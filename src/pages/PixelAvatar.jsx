import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { sfx } from '../utils/sound'
import './games/games.css'
import './pixelavatar.css'

const DENSITIES = [8, 16, 24, 32, 48, 64]
const PALETTES = [
  { id: 'raw', name: '原始色', k: 0 },
  { id: 'p8', name: '8 色', k: 8 },
  { id: 'p16', name: '16 色', k: 16 },
  { id: 'p32', name: '32 色', k: 32 },
  { id: 'p64', name: '64 色', k: 64 },
]
const EXPORT_SIZE = 512

// 中位切分量化：把像素集合收敛到 k 个代表色
function medianCut(pixels, k) {
  let boxes = [pixels]
  while (boxes.length < k) {
    let bi = -1
    let bestRange = -1
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i]
      if (box.length < 2) continue
      for (let c = 0; c < 3; c++) {
        let min = 255
        let max = 0
        for (const p of box) {
          if (p[c] < min) min = p[c]
          if (p[c] > max) max = p[c]
        }
        const range = (max - min) * Math.sqrt(box.length)
        if (range > bestRange) { bestRange = range; bi = i; }
      }
    }
    if (bi < 0) break
    const box = boxes[bi]
    let c = 0
    let best = -1
    for (let ch = 0; ch < 3; ch++) {
      let min = 255
      let max = 0
      for (const p of box) {
        if (p[ch] < min) min = p[ch]
        if (p[ch] > max) max = p[ch]
      }
      if (max - min > best) { best = max - min; c = ch; }
    }
    box.sort((a, b) => a[c] - b[c])
    const mid = box.length >> 1
    boxes = [...boxes.slice(0, bi), box.slice(0, mid), box.slice(mid), ...boxes.slice(bi + 1)]
  }
  return boxes
    .filter((b) => b.length)
    .map((box) => {
      const s = [0, 0, 0]
      for (const p of box) { s[0] += p[0]; s[1] += p[1]; s[2] += p[2] }
      return [Math.round(s[0] / box.length), Math.round(s[1] / box.length), Math.round(s[2] / box.length)]
    })
}

function nearest(palette, p) {
  let bi = 0
  let bd = Infinity
  for (let i = 0; i < palette.length; i++) {
    const c = palette[i]
    const d = (c[0] - p[0]) ** 2 + (c[1] - p[1]) ** 2 + (c[2] - p[2]) ** 2
    if (d < bd) { bd = d; bi = i; }
  }
  return palette[bi]
}

export default function PixelAvatar() {
  const canvasRef = useRef(null)     // 取景画布
  const previewRef = useRef(null)    // 像素预览
  const frameRef = useRef(null)
  const imgRef = useRef(null)        // Image 对象
  const fitRef = useRef({ scale: 1, ox: 0, oy: 0, size: 420 })
  const objectUrlRef = useRef(null)
  const dragRef = useRef(null)

  const [hasImg, setHasImg] = useState(false)
  const [fileName, setFileName] = useState('')
  const [crop, setCrop] = useState({ x: 60, y: 60, size: 300 })
  const [density, setDensity] = useState(16)
  const [paletteMode, setPaletteMode] = useState('p16')
  const smallRef = useRef(null) // density×density 的像素原图，导出用它而不是预览画布

  const DISPLAY = 420

  // ---------- 加载图片 ----------
  const loadFile = useCallback((file) => {
    if (!file || !file.type.startsWith('image/')) return
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    objectUrlRef.current = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      setHasImg(true)
      setFileName(file.name)
      // 居中放一个 80% 的方形取景框
      const side = DISPLAY * 0.8
      setCrop({ x: (DISPLAY - side) / 2, y: (DISPLAY - side) / 2, size: side })
      sfx.ui()
    }
    img.src = objectUrlRef.current
  }, [])

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
  }, [])

  // ---------- 取景画布：绘制原图 + 适配信息 ----------
  const drawSource = useCallback(() => {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    if (canvas.width !== DISPLAY * dpr) {
      canvas.width = DISPLAY * dpr
      canvas.height = DISPLAY * dpr
      canvas.style.width = `${DISPLAY}px`
      canvas.style.height = `${DISPLAY}px`
    }
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#0a0c12'
    ctx.fillRect(0, 0, DISPLAY, DISPLAY)
    if (!img) return
    const scale = Math.min(DISPLAY / img.width, DISPLAY / img.height)
    const w = img.width * scale
    const h = img.height * scale
    const ox = (DISPLAY - w) / 2
    const oy = (DISPLAY - h) / 2
    fitRef.current = { scale, ox, oy, size: DISPLAY }
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(img, ox, oy, w, h)
  }, [])

  // ---------- 像素化渲染管线 ----------
  const render = useCallback(() => {
    drawSource()
    const preview = previewRef.current
    const img = imgRef.current
    if (!preview) return
    const ctx = preview.getContext('2d')
    if (!img) {
      ctx.clearRect(0, 0, preview.width, preview.height)
      return
    }
    const { scale, ox, oy } = fitRef.current
    const sx = (crop.x - ox) / scale
    const sy = (crop.y - oy) / scale
    const sw = crop.size / scale

    // 1) 降采样到 N×N（关平滑 = 最近邻采样，得到硬边像素）
    const small = document.createElement('canvas')
    small.width = density
    small.height = density
    const sctx = small.getContext('2d')
    sctx.imageSmoothingEnabled = false
    sctx.drawImage(img, sx, sy, sw, sw, 0, 0, density, density)
    smallRef.current = small

    // 2) 可选：中位切分限色
    const data = sctx.getImageData(0, 0, density, density)
    const k = PALETTES.find((p) => p.id === paletteMode).k
    if (k > 0) {
      const pixels = []
      for (let i = 0; i < data.data.length; i += 4) {
        pixels.push([data.data[i], data.data[i + 1], data.data[i + 2]])
      }
      const palette = medianCut(pixels, Math.min(k, pixels.length))
      for (let i = 0; i < data.data.length; i += 4) {
        const c = nearest(palette, [data.data[i], data.data[i + 1], data.data[i + 2]])
        data.data[i] = c[0]
        data.data[i + 1] = c[1]
        data.data[i + 2] = c[2]
      }
      sctx.putImageData(data, 0, 0)
    }

    // 3) 放大到预览尺寸（最近邻，保持锐利）
    const view = 340
    preview.width = view
    preview.height = view
    preview.style.width = `${view}px`
    preview.style.height = `${view}px`
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, view, view)
    ctx.drawImage(small, 0, 0, density, density, 0, 0, view, view)
  }, [crop, density, paletteMode, drawSource])

  useEffect(() => {
    render()
  }, [render])

  // ---------- 取景框拖拽 ----------
  const clampCrop = (c) => {
    const size = Math.min(Math.max(c.size, 48), DISPLAY)
    return {
      size,
      x: Math.min(Math.max(c.x, 0), DISPLAY - size),
      y: Math.min(Math.max(c.y, 0), DISPLAY - size),
    }
  }

  const onFrameDown = (e, mode) => {
    e.preventDefault()
    e.stopPropagation()
    dragRef.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      orig: { ...crop },
    }
  }

  useEffect(() => {
    const onMove = (e) => {
      const d = dragRef.current
      if (!d) return
      const dx = e.clientX - d.startX
      const dy = e.clientY - d.startY
      if (d.mode === 'move') {
        setCrop(clampCrop({ ...d.orig, x: d.orig.x + dx, y: d.orig.y + dy }))
      } else {
        setCrop(clampCrop({ ...d.orig, size: Math.max(d.orig.size + (dx + dy) / 2, 48) }))
      }
    }
    const onUp = () => { dragRef.current = null }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [])

  // ---------- 导出 ----------
  const exportPng = () => {
    const small = smallRef.current
    if (!small || !hasImg) return
    const out = document.createElement('canvas')
    out.width = EXPORT_SIZE
    out.height = EXPORT_SIZE
    const ctx = out.getContext('2d')
    ctx.imageSmoothingEnabled = false
    // 直接从 density×density 的像素原图放大，内容与预览框完全一致
    ctx.drawImage(small, 0, 0, density, density, 0, 0, EXPORT_SIZE, EXPORT_SIZE)
    out.toBlob((blob) => {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `pixel-avatar-${density}x${density}.png`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 4000)
      sfx.chime()
    }, 'image/png')
  }

  const onDrop = (e) => {
    e.preventDefault()
    loadFile(e.dataTransfer.files?.[0])
  }

  return (
    <div className="px-wrap">
      <header className="gm-header gm-header-row">
        <div>
          <p className="gm-kicker" style={{ color: 'rgba(232,201,160,0.85)' }}>PIXEL AVATAR STUDIO</p>
          <h1 className="gm-title gm-title-sm">像素头像工坊</h1>
        </div>
        <Link to="/" className="gm-back gm-back-top">← 返回首页</Link>
      </header>

      <section className="gm-panel px-panel">
        <div className="px-grid">
          {/* 左：原图 + 取景框 */}
          <div>
            <p className="px-label">原图 · 拖动方框选取区域</p>
            <div
              className="px-stage"
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
            >
              <canvas ref={canvasRef} className="px-canvas" />
              {hasImg ? (
                <div
                  ref={frameRef}
                  className="px-frame"
                  style={{ left: crop.x, top: crop.y, width: crop.size, height: crop.size }}
                  onPointerDown={(e) => onFrameDown(e, 'move')}
                >
                  <span
                    className="px-handle"
                    onPointerDown={(e) => onFrameDown(e, 'resize')}
                  />
                </div>
              ) : (
                <div className="px-empty">
                  <p>把图片拖到这里</p>
                  <p className="px-empty-sub">或点击下方按钮选择文件</p>
                </div>
              )}
            </div>
            <label className="px-upload">
              {hasImg ? '换一张图片' : '选择图片'}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => loadFile(e.target.files?.[0])}
              />
            </label>
            {hasImg && <p className="px-filename">{fileName}</p>}
          </div>

          {/* 右：预览与导出 */}
          <div>
            <p className="px-label">像素预览 · {density}×{density}</p>
            <div className="px-preview-box">
              <canvas ref={previewRef} className="px-preview" />
            </div>
            <div className="px-controls">
              <div className="px-row">
                <span className="px-row-label">密度</span>
                <div className="gm-seg">
                  {DENSITIES.map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={`gm-seg-btn ${density === d ? 'active' : ''}`}
                      onClick={() => { setDensity(d); sfx.ui() }}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
              <div className="px-row">
                <span className="px-row-label">限色</span>
                <div className="gm-seg">
                  {PALETTES.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`gm-seg-btn ${paletteMode === p.id ? 'active' : ''}`}
                      onClick={() => { setPaletteMode(p.id); sfx.ui() }}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="button"
                className="gm-btn-start px-export"
                onClick={exportPng}
                disabled={!hasImg}
              >
                导出 PNG（{EXPORT_SIZE}px）
              </button>
            </div>
          </div>
        </div>
        <p className="px-tip">小技巧：限色 16 色最出味道；取景框越小，单格像素越大越抽象。</p>
      </section>
    </div>
  )
}
