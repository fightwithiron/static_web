import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { sfx } from '../../utils/sound'
import { useConfetti, ConfettiLayer } from '../../components/Confetti'
import './games.css'
import './roulette.css'

const PRESETS = [
  { name: '今晚吃什么', items: '火锅\n烧烤\n麻辣烫\n饺子\n轻食沙拉\n面条\n汉堡\n随便走走看' },
  { name: '课堂点名', items: '小明\n小红\n小刚\n小丽\n小强\n小美' },
  { name: '做不做', items: '做！\n不做\n再想想\n问朋友\n明天再说' },
]

const SEG_COLORS = ['#f59e0b', '#2dd4bf', '#60a5fa', '#f472b6', '#a78bfa', '#34d399', '#fbbf24', '#f87171', '#38bdf8', '#c084fc', '#4ade80', '#fb923c']

const readOptions = () => localStorage.getItem('roulette-options') ?? PRESETS[0].items
const readHistory = () => {
  try {
    const arr = JSON.parse(localStorage.getItem('roulette-history') ?? '[]')
    return Array.isArray(arr) ? arr.slice(0, 10) : []
  } catch {
    return []
  }
}

export default function Roulette() {
  const canvasRef = useRef(null)
  const shellRef = useRef(null)
  const rotationRef = useRef(0)
  const animRef = useRef(null)
  const lastTickRef = useRef(-1)
  const soundRef = useRef(true)

  const [optionsText, setOptionsText] = useState(readOptions)
  const [editorOpen, setEditorOpen] = useState(false)
  const [spinning, setSpinning] = useState(false)
  const [result, setResult] = useState(null)
  const [history, setHistory] = useState(readHistory)
  const [error, setError] = useState('')
  const { pieces: confetti, burst } = useConfetti({ count: 60 })

  const options = optionsText.split('\n').map((s) => s.trim()).filter(Boolean)
  const canSpin = options.length >= 2 && options.length <= 12

  useEffect(() => {
    try { localStorage.setItem('roulette-options', optionsText) } catch { /* 忽略 */ }
  }, [optionsText])

  const soundOn = () => soundRef.current

  // ---------- 绘制转盘 ----------
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const shell = shellRef.current
    if (!canvas || !shell) return
    const size = Math.min(shell.clientWidth, 470)
    const dpr = window.devicePixelRatio || 1
    if (canvas.width !== size * dpr) {
      canvas.width = size * dpr
      canvas.height = size * dpr
      canvas.style.width = `${size}px`
      canvas.style.height = `${size}px`
    }
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size, size)

    const cx = size / 2
    const cy = size / 2
    const rOuter = size / 2 - 14
    const rInner = rOuter * 0.3
    const n = Math.max(options.length, 1)
    const seg = (Math.PI * 2) / n

    // 外圈金属环
    ctx.beginPath()
    ctx.arc(cx, cy, rOuter + 7, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(255,255,255,0.16)'
    ctx.lineWidth = 6
    ctx.stroke()

    for (let i = 0; i < n; i++) {
      const start = rotationRef.current + i * seg - Math.PI / 2
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.arc(cx, cy, rOuter, start, start + seg)
      ctx.closePath()
      ctx.fillStyle = SEG_COLORS[i % SEG_COLORS.length]
      ctx.globalAlpha = 0.88
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.strokeStyle = 'rgba(0,0,0,0.28)'
      ctx.lineWidth = 1.5
      ctx.stroke()

      // 文字沿半径排布
      const mid = start + seg / 2
      ctx.save()
      ctx.translate(cx + Math.cos(mid) * (rOuter * 0.62), cy + Math.sin(mid) * (rOuter * 0.62))
      ctx.rotate(mid)
      ctx.fillStyle = 'rgba(15,15,22,0.92)'
      ctx.font = `650 ${Math.max(13, size * 0.032)}px Inter, sans-serif`
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      const label = options[i] ?? ''
      ctx.fillText(label.length > 8 ? `${label.slice(0, 8)}…` : label, 0, 0)
      ctx.restore()
    }

    // 中心轴
    ctx.beginPath()
    ctx.arc(cx, cy, rInner, 0, Math.PI * 2)
    ctx.fillStyle = '#15151f'
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'
    ctx.lineWidth = 3
    ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.font = `700 ${Math.max(14, size * 0.036)}px Inter, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('GO', cx, cy + 1)

    // 顶部指针
    ctx.beginPath()
    ctx.moveTo(cx, 4)
    ctx.lineTo(cx - 11, 26)
    ctx.lineTo(cx + 11, 26)
    ctx.closePath()
    ctx.fillStyle = '#fbbf24'
    ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'
    ctx.lineWidth = 1.5
    ctx.stroke()
  }, [options])

  useEffect(() => {
    draw()
    const onResize = () => draw()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [draw])

  // 当前指针指向的选项下标
  const pointedIndex = () => {
    const n = options.length
    const seg = (Math.PI * 2) / n
    // 指针在顶部（-90°），轮盘转了 rotation
    let local = (-Math.PI / 2 - rotationRef.current) % (Math.PI * 2)
    if (local < 0) local += Math.PI * 2
    return Math.floor(local / seg) % n
  }

  const spin = useCallback(() => {
    if (spinning || !canSpin) {
      if (!canSpin) setError('请准备 2-12 个选项')
      return
    }
    setError('')
    setResult(null)
    setSpinning(true)
    if (soundOn()) sfx.ui()

    const start = rotationRef.current
    const turns = 5 + Math.random() * 3
    const delta = turns * Math.PI * 2 + Math.random() * Math.PI * 2
    const duration = 4200 + Math.random() * 600
    const t0 = performance.now()

    const easeOut = (t) => 1 - Math.pow(1 - t, 3)

    const frame = (now) => {
      const t = Math.min((now - t0) / duration, 1)
      const prev = rotationRef.current
      rotationRef.current = start + delta * easeOut(t)

      // 逐格咔哒
      const tickIdx = Math.floor(pointedIndex() * 1)
      const n = options.length
      const seg = (Math.PI * 2) / n
      let local = (-Math.PI / 2 - rotationRef.current) % (Math.PI * 2)
      if (local < 0) local += Math.PI * 2
      const segIdx = Math.floor(local / seg)
      if (segIdx !== lastTickRef.current && t < 0.995) {
        lastTickRef.current = segIdx
        if (soundOn()) sfx.spinTick()
      }

      draw()
      if (t < 1) {
        animRef.current = requestAnimationFrame(frame)
      } else {
        setSpinning(false)
        const winner = options[pointedIndex()]
        setResult(winner)
        setHistory((h) => {
          const next = [{ text: winner, at: Date.now() }, ...h].slice(0, 10)
          try { localStorage.setItem('roulette-history', JSON.stringify(next)) } catch { /* 忽略 */ }
          return next
        })
        burst()
        if (soundOn()) sfx.win()
      }
    }
    animRef.current = requestAnimationFrame(frame)
  }, [spinning, canSpin, options, draw, burst])

  useEffect(() => () => cancelAnimationFrame(animRef.current), [])

  const removeWinner = () => {
    if (!result) return
    const next = options.filter((o) => o !== result)
    if (next.length < 2) {
      setError('至少保留 2 个选项')
      setResult(null)
      return
    }
    setOptionsText(next.join('\n'))
    setResult(null)
    sfx.ui()
  }

  return (
    <div className="gm-wrap">
      <header className="gm-header gm-header-row">
        <div>
          <p className="gm-kicker" style={{ color: 'rgba(96,165,250,0.85)' }}>LUCKY WHEEL</p>
          <h1 className="gm-title gm-title-sm">大转盘</h1>
        </div>
        <Link to="/games" className="gm-back gm-back-top">← 返回街机</Link>
      </header>

      <section className="gm-panel rt-panel">
        <div className="rt-toolbar">
          <button type="button" className="ms-chip" onClick={() => setEditorOpen((v) => !v)}>
            编辑选项（{options.length}）
          </button>
          {PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              className="ms-chip"
              onClick={() => { setOptionsText(p.items); setEditorOpen(false); setResult(null); sfx.ui() }}
            >
              {p.name}
            </button>
          ))}
        </div>

        {editorOpen && (
          <div className="rt-editor">
            <textarea
              className="rt-textarea"
              value={optionsText}
              onChange={(e) => setOptionsText(e.target.value)}
              rows={7}
              placeholder="每行一个选项，2-12 个"
              spellCheck={false}
            />
            <p className="rt-editor-hint">当前 {options.length} 个选项{options.length > 12 ? '（超过 12 个只取前 12 个）' : ''}</p>
          </div>
        )}

        <div className="rt-shell" ref={shellRef}>
          <canvas ref={canvasRef} className="rt-canvas" />
          {result && !spinning && (
            <div className="rt-result">
              <p className="rt-result-label">就决定是你了</p>
              <p className="rt-result-text">{result}</p>
              <div className="rt-result-actions">
                <button type="button" className="gm-btn-start" onClick={() => { setResult(null); spin() }}>再转一次</button>
                <button type="button" className="ms-chip" onClick={removeWinner}>移除该选项</button>
              </div>
            </div>
          )}
          <ConfettiLayer pieces={confetti} />
        </div>

        {error && <p className="rt-error">{error}</p>}

        <button type="button" className="rt-spin-btn" onClick={spin} disabled={spinning || !canSpin}>
          {spinning ? '转动中…' : '开始旋转'}
        </button>

        {history.length > 0 && (
          <div className="rt-history">
            <span className="rt-history-label">最近结果</span>
            <div className="rt-history-items">
              {history.map((h) => (
                <span key={h.at} className="rt-history-item">{h.text}</span>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
