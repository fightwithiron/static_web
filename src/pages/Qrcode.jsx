import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import qrcode from 'qrcode-generator'
import { sfx } from '../utils/sound'
import './games/games.css'
import './qrcode.css'

const STYLES = [
  { id: 'square', name: '方块' },
  { id: 'dot', name: '圆点' },
  { id: 'rounded', name: '圆角' },
]
const ECS = [
  { id: 'L', name: 'L · 7%' },
  { id: 'M', name: 'M · 15%' },
  { id: 'Q', name: 'Q · 25%' },
  { id: 'H', name: 'H · 30%' },
]
const SIZES = [512, 768, 1024]
const MARGIN = 4
const CROP_DISPLAY = 340

// 7×7 定位角：外框 + 内芯
function drawFinderAt(ctx, col, row, off, cell, fg, style) {
  const x = off + col * cell
  const y = off + row * cell
  const w = 7 * cell
  ctx.lineWidth = cell
  ctx.strokeStyle = fg
  if (ctx.roundRect && style !== 'square') {
    ctx.beginPath()
    ctx.roundRect(x + cell / 2, y + cell / 2, w - cell, w - cell, cell * 1.6)
    ctx.stroke()
  } else {
    ctx.strokeRect(x + cell / 2, y + cell / 2, w - cell, w - cell)
  }
  ctx.fillStyle = fg
  if (ctx.roundRect && style !== 'square') {
    ctx.beginPath()
    ctx.roundRect(x + cell * 2, y + cell * 2, cell * 3, cell * 3, cell * 0.9)
    ctx.fill()
  } else {
    ctx.fillRect(x + cell * 2, y + cell * 2, cell * 3, cell * 3)
  }
}

export default function Qrcode() {
  const canvasRef = useRef(null)      // 输出画布
  const cropCanvasRef = useRef(null)  // 图片底纹模式的取景画布
  const imgMainRef = useRef(null)     // 底纹原图
  const imgLogoRef = useRef(null)     // 中央嵌图
  const mainUrlRef = useRef(null)
  const logoUrlRef = useRef(null)
  const fitRef = useRef({ scale: 1, ox: 0, oy: 0 })
  const dragRef = useRef(null)

  const [text, setText] = useState('https://example.com')
  const [mode, setMode] = useState('color') // color 纯色 | image 图片底纹
  const [style, setStyle] = useState('rounded')
  const [ec, setEc] = useState('Q')
  const [size, setSize] = useState(512)
  const [fg, setFg] = useState('#181820')
  const [bg, setBg] = useState('#ffffff')
  const [logo, setLogo] = useState(null)
  const [logoName, setLogoName] = useState('')
  const [imgMain, setImgMain] = useState(null)
  const [crop, setCrop] = useState({ x: 40, y: 40, size: 260 })
  const [dim, setDim] = useState(60) // 图片淡化：白色蒙版百分比
  const [error, setError] = useState('')
  const [hasMain, setHasMain] = useState(false)

  const effEc = mode === 'image' || logo ? 'H' : ec

  // ---------- 底纹原图加载 ----------
  const loadMain = useCallback((file) => {
    if (!file || !file.type.startsWith('image/')) return
    if (mainUrlRef.current) URL.revokeObjectURL(mainUrlRef.current)
    mainUrlRef.current = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      imgMainRef.current = img
      setImgMain(img)
      setHasMain(true)
      const side = CROP_DISPLAY * 0.82
      setCrop({ x: (CROP_DISPLAY - side) / 2, y: (CROP_DISPLAY - side) / 2, size: side })
      sfx.ui()
    }
    img.src = mainUrlRef.current
  }, [])

  useEffect(() => () => {
    if (mainUrlRef.current) URL.revokeObjectURL(mainUrlRef.current)
    if (logoUrlRef.current) URL.revokeObjectURL(logoUrlRef.current)
  }, [])

  // ---------- 取景画布 ----------
  const drawCropCanvas = useCallback(() => {
    const canvas = cropCanvasRef.current
    const img = imgMainRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    if (canvas.width !== CROP_DISPLAY * dpr) {
      canvas.width = CROP_DISPLAY * dpr
      canvas.height = CROP_DISPLAY * dpr
      canvas.style.width = `${CROP_DISPLAY}px`
      canvas.style.height = `${CROP_DISPLAY}px`
    }
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#0a0c12'
    ctx.fillRect(0, 0, CROP_DISPLAY, CROP_DISPLAY)
    if (!img) return
    const scale = Math.min(CROP_DISPLAY / img.width, CROP_DISPLAY / img.height)
    const w = img.width * scale
    const h = img.height * scale
    const ox = (CROP_DISPLAY - w) / 2
    const oy = (CROP_DISPLAY - h) / 2
    fitRef.current = { scale, ox, oy }
    ctx.drawImage(img, ox, oy, w, h)
  }, [])

  useEffect(() => {
    if (mode === 'image') drawCropCanvas()
  }, [mode, imgMain, drawCropCanvas])

  // ---------- 取景框拖拽 ----------
  const clampCrop = (c) => {
    const size = Math.min(Math.max(c.size, 60), CROP_DISPLAY)
    return {
      size,
      x: Math.min(Math.max(c.x, 0), CROP_DISPLAY - size),
      y: Math.min(Math.max(c.y, 0), CROP_DISPLAY - size),
    }
  }

  useEffect(() => {
    const onMove = (e) => {
      const d = dragRef.current
      if (!d) return
      const dx = e.clientX - d.startX
      const dy = e.clientY - d.startY
      if (d.mode === 'move') setCrop(clampCrop({ ...d.orig, x: d.orig.x + dx, y: d.orig.y + dy }))
      else setCrop(clampCrop({ ...d.orig, size: Math.max(d.orig.size + (dx + dy) / 2, 60) }))
    }
    const onUp = () => { dragRef.current = null }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [])

  // ---------- 绘制输出 ----------
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = size * dpr
    canvas.height = size * dpr
    canvas.style.width = `${Math.min(size, 340)}px`
    canvas.style.height = `${Math.min(size, 340)}px`
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    ctx.fillStyle = bg
    ctx.fillRect(0, 0, size, size)

    const content = text.trim()
    if (!content) {
      ctx.fillStyle = '#9aa0b4'
      ctx.font = '15px Inter, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('输入文字或链接，二维码会实时出现', size / 2, size / 2)
      return
    }

    let qr
    try {
      qr = qrcode(0, effEc)
      qr.addData(content)
      qr.make()
      setError('')
    } catch {
      setError('内容太长，当前容错等级下编码不下——换更高容错或缩短内容')
      return
    }

    const count = qr.getModuleCount()
    const cell = size / (count + MARGIN * 2)
    const off = MARGIN * cell
    const radius = cell * 0.46

    // 图片底纹：铺满 + 白色淡化蒙版
    if (mode === 'image' && imgMain) {
      const { scale, ox, oy } = fitRef.current
      const sx = (crop.x - ox) / scale
      const sy = (crop.y - oy) / scale
      const sw = crop.size / scale
      ctx.drawImage(imgMain, sx, sy, sw, sw, 0, 0, size, size)
      ctx.fillStyle = `rgba(255,255,255,${dim / 100})`
      ctx.fillRect(0, 0, size, size)
    }

    const drawModule = (x, y, w) => {
      if (style === 'square') {
        ctx.fillRect(x, y, w + 0.5, w + 0.5)
      } else if (style === 'dot') {
        ctx.beginPath()
        ctx.arc(x + w / 2, y + w / 2, radius, 0, Math.PI * 2)
        ctx.fill()
      } else {
        if (ctx.roundRect) {
          ctx.beginPath()
          ctx.roundRect(x, y, w, w, w * 0.32)
          ctx.fill()
        } else {
          ctx.fillRect(x, y, w, w)
        }
      }
    }

    // 数据区（跳过定位角，稍后单独画）
    ctx.fillStyle = fg
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        if (!qr.isDark(row, col)) continue
        const inFinder = (row < 7 && col < 7) || (row < 7 && col >= count - 7) || (row >= count - 7 && col < 7)
        if (inFinder) continue
        drawModule(off + col * cell, off + row * cell, cell)
      }
    }

    // 定位角在图片底纹上加白色衬底，保证任何背景下都可扫
    if (mode === 'image' && imgMain) {
      const pads = [[0, 0], [count - 7, 0], [0, count - 7]]
      for (const [c, r] of pads) {
        ctx.fillStyle = bg
        ctx.fillRect(off + c * cell - cell * 0.5, off + r * cell - cell * 0.5, cell * 8, cell * 8)
      }
    }
    drawFinderAt(ctx, 0, 0, off, cell, fg, style)
    drawFinderAt(ctx, count - 7, 0, off, cell, fg, style)
    drawFinderAt(ctx, 0, count - 7, off, cell, fg, style)

    // 中央嵌图（带白色衬底）
    if (logo) {
      const lw = size * 0.2
      const lx = (size - lw) / 2
      const pad = lw * 0.09
      ctx.fillStyle = bg
      if (ctx.roundRect) {
        ctx.beginPath()
        ctx.roundRect(lx - pad, lx - pad, lw + pad * 2, lw + pad * 2, lw * 0.18)
        ctx.fill()
      } else {
        ctx.fillRect(lx - pad, lx - pad, lw + pad * 2, lw + pad * 2)
      }
      const ratio = Math.min(lw / logo.width, lw / logo.height)
      const dw = logo.width * ratio
      const dh = logo.height * ratio
      ctx.drawImage(logo, lx + (lw - dw) / 2, lx + (lw - dh) / 2, dw, dh)
    }
  }, [text, mode, style, effEc, size, fg, bg, logo, imgMain, crop, dim])

  useEffect(() => {
    draw()
  }, [draw])

  const loadLogo = (file) => {
    if (!file || !file.type.startsWith('image/')) return
    if (logoUrlRef.current) URL.revokeObjectURL(logoUrlRef.current)
    logoUrlRef.current = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      setLogo(img)
      setLogoName(file.name)
      sfx.ui()
    }
    img.src = logoUrlRef.current
  }

  const clearLogo = () => {
    setLogo(null)
    setLogoName('')
    sfx.ui()
  }

  const download = () => {
    const canvas = canvasRef.current
    if (!canvas || !text.trim() || error) return
    canvas.toBlob((blob) => {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `qrcode-${mode}-${effEc}-${size}.png`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 4000)
      sfx.chime()
    }, 'image/png')
  }

  return (
    <div className="qr-wrap">
      <header className="gm-header gm-header-row">
        <div>
          <p className="gm-kicker" style={{ color: 'rgba(96,165,250,0.85)' }}>QR STUDIO</p>
          <h1 className="gm-title gm-title-sm">二维码工坊</h1>
        </div>
        <Link to="/" className="gm-back gm-back-top">← 返回首页</Link>
      </header>

      <section className="gm-panel qr-panel">
        <div className="qr-grid">
          <div className="qr-form">
            <div className="qr-mode-row">
              <div className="gm-seg">
                <button type="button" className={`gm-seg-btn ${mode === 'color' ? 'active' : ''}`} onClick={() => { setMode('color'); sfx.ui() }}>纯色</button>
                <button type="button" className={`gm-seg-btn ${mode === 'image' ? 'active' : ''}`} onClick={() => { setMode('image'); sfx.ui() }}>图片底纹</button>
              </div>
            </div>

            <p className="qr-label">内容 · 文字或链接</p>
            <textarea
              className="qr-textarea"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              placeholder="https://… 或任意文字"
              spellCheck={false}
            />

            {mode === 'image' && (
              <div className="qr-image-section">
                <p className="qr-label">底纹图片 · 拖动方框选取区域</p>
                <div
                  className="qr-crop-stage"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); loadMain(e.dataTransfer.files?.[0]) }}
                >
                  <canvas ref={cropCanvasRef} className="qr-crop-canvas" />
                  {hasMain ? (
                    <div
                      className="px-frame"
                      style={{ left: crop.x, top: crop.y, width: crop.size, height: crop.size }}
                      onPointerDown={(e) => {
                        e.preventDefault()
                        dragRef.current = { mode: 'move', startX: e.clientX, startY: e.clientY, orig: { ...crop } }
                      }}
                    >
                      <span
                        className="px-handle"
                        onPointerDown={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          dragRef.current = { mode: 'resize', startX: e.clientX, startY: e.clientY, orig: { ...crop } }
                        }}
                      />
                    </div>
                  ) : (
                    <div className="qr-crop-empty">
                      <p>把图片拖到这里</p>
                      <p className="qr-crop-empty-sub">作为整个二维码的底纹</p>
                    </div>
                  )}
                </div>
                <label className="ms-chip qr-logo-btn qr-upload-btn">
                  {hasMain ? '换一张底纹图' : '选择底纹图片'}
                  <input type="file" accept="image/*" onChange={(e) => loadMain(e.target.files?.[0])} />
                </label>

                <div className="px-row qr-dim-row">
                  <span className="px-row-label">淡化</span>
                  <input
                    type="range" min="30" max="85" step="5" value={dim}
                    onChange={(e) => setDim(Number(e.target.value))}
                    disabled={!hasMain}
                  />
                  <span className="qr-dim-val">{dim}%</span>
                </div>
                <p className="qr-hint">
                  图片底纹自动使用最高容错 H（30%）。淡化越低越好看、越高越好扫。生成后务必先用手机扫一下。
                </p>

                <p className="qr-label qr-center-label">中心嵌图（可选）</p>
                <div className="qr-logo-row">
                  <label className="ms-chip qr-logo-btn">
                    {logo ? '换一张' : '上传中心图片'}
                    <input type="file" accept="image/*" onChange={(e) => loadLogo(e.target.files?.[0])} />
                  </label>
                  {logo && (
                    <>
                      <span className="qr-logo-name">{logoName}</span>
                      <button type="button" className="ms-chip" onClick={clearLogo}>移除</button>
                    </>
                  )}
                </div>
              </div>
            )}

            {mode === 'color' && (
              <>
                <p className="qr-label">中央嵌图（可选）</p>
                <div className="qr-logo-row">
                  <label className="ms-chip qr-logo-btn">
                    {logo ? '换一张' : '上传图片'}
                    <input type="file" accept="image/*" onChange={(e) => loadLogo(e.target.files?.[0])} />
                  </label>
                  {logo && (
                    <>
                      <span className="qr-logo-name">{logoName}</span>
                      <button type="button" className="ms-chip" onClick={clearLogo}>移除</button>
                    </>
                  )}
                </div>
                {logo && <p className="qr-hint">已自动切换到最高容错 H（30%），确保嵌图后仍可扫描</p>}
              </>
            )}

            <div className="qr-rows">
              <div className="px-row">
                <span className="px-row-label">码点</span>
                <div className="gm-seg">
                  {STYLES.map((s) => (
                    <button key={s.id} type="button" className={`gm-seg-btn ${style === s.id ? 'active' : ''}`} onClick={() => { setStyle(s.id); sfx.ui() }}>
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
              {mode === 'color' && (
                <div className="px-row">
                  <span className="px-row-label">容错</span>
                  <div className="gm-seg">
                    {ECS.map((e2) => (
                      <button key={e2.id} type="button" className={`gm-seg-btn ${effEc === e2.id ? 'active' : ''}`} onClick={() => { setEc(e2.id); sfx.ui() }} disabled={!!logo}>
                        {e2.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="px-row">
                <span className="px-row-label">尺寸</span>
                <div className="gm-seg">
                  {SIZES.map((s) => (
                    <button key={s} type="button" className={`gm-seg-btn ${size === s ? 'active' : ''}`} onClick={() => { setSize(s); sfx.ui() }}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div className="px-row">
                <span className="px-row-label">配色</span>
                <div className="qr-colors">
                  <label className="qr-color">
                    <input type="color" value={fg} onChange={(e) => setFg(e.target.value)} />
                    <span>码色</span>
                  </label>
                  {mode === 'color' && (
                    <label className="qr-color">
                      <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} />
                      <span>底色</span>
                    </label>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="qr-preview-col">
            <canvas ref={canvasRef} className="qr-canvas" />
            <button type="button" className="gm-btn-start qr-download" onClick={download}>
              下载 PNG
            </button>
            <p className="qr-tip">生成后请先用手机扫一下确认可用——码点越花哨，对扫描环境越挑剔。</p>
          </div>
        </div>
        {error && <p className="qr-error">{error}</p>}
      </section>
    </div>
  )
}
