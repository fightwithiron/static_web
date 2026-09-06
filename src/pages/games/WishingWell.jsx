import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { sfx } from '../../utils/sound'
import './games.css'
import './wishingwell.css'

const HUES = [45, 150, 190, 320, 265]
const readWishes = () => {
  try {
    const arr = JSON.parse(localStorage.getItem('wishes') ?? '[]')
    return Array.isArray(arr) ? arr.slice(0, 12) : []
  } catch {
    return []
  }
}

export default function WishingWell() {
  const canvasRef = useRef(null)
  const shellRef = useRef(null)
  const engineRef = useRef({ rockets: [], sparks: [], texts: [], stars: [], hueIdx: 0 })
  const [wishes, setWishes] = useState(readWishes)
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const soundRef = useRef(true)

  // ---------- 画布与星空初始化 ----------
  const resize = useCallback(() => {
    const canvas = canvasRef.current
    const shell = shellRef.current
    if (!canvas || !shell) return
    const w = shell.clientWidth
    const h = Math.min(Math.max(w * 0.56, 300), 460)
    const dpr = window.devicePixelRatio || 1
    canvas.width = w * dpr
    canvas.height = h * dpr
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    const stars = []
    for (let i = 0; i < 90; i++) {
      stars.push({
        x: Math.random() * w,
        y: Math.random() * h * 0.72,
        r: Math.random() * 1.3 + 0.4,
        tw: Math.random() * Math.PI * 2,
        sp: 0.4 + Math.random() * 1.2,
      })
    }
    engineRef.current.stars = stars
    engineRef.current.waterY = h * 0.82
  }, [])

  useEffect(() => {
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [resize])

  // ---------- 渲染循环 ----------
  useEffect(() => {
    let raf
    const frame = (now) => {
      const canvas = canvasRef.current
      if (canvas) {
        const ctx = canvas.getContext('2d')
        const dpr = window.devicePixelRatio || 1
        const w = canvas.width / dpr
        const h = canvas.height / dpr
        const g = engineRef.current
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

        // 夜空底色（带拖尾的半透明覆盖）
        ctx.fillStyle = 'rgba(7, 9, 18, 0.26)'
        ctx.fillRect(0, 0, w, h)

        // 星星
        for (const s of g.stars) {
          const a = 0.25 + 0.55 * Math.abs(Math.sin(s.tw))
          ctx.fillStyle = `rgba(210, 220, 255, ${a})`
          ctx.beginPath()
          ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
          ctx.fill()
          s.tw += 0.02 * s.sp
        }

        // 水面
        const waterY = g.waterY ?? h * 0.82
        const wg = ctx.createLinearGradient(0, waterY, 0, h)
        wg.addColorStop(0, 'rgba(60, 80, 130, 0.22)')
        wg.addColorStop(1, 'rgba(10, 14, 26, 0.55)')
        ctx.fillStyle = wg
        ctx.fillRect(0, waterY, w, h - waterY)
        ctx.strokeStyle = 'rgba(150, 170, 230, 0.16)'
        ctx.beginPath()
        ctx.moveTo(0, waterY)
        ctx.lineTo(w, waterY)
        ctx.stroke()

        // 火箭升空
        for (let i = g.rockets.length - 1; i >= 0; i--) {
          const r = g.rockets[i]
          r.y += r.vy
          r.x += Math.sin(r.y / 26) * 0.7
          g.sparks.push({ x: r.x, y: r.y, vx: 0, vy: 0.4, life: 14, hue: r.hue, dim: true })
          ctx.fillStyle = `hsla(${r.hue}, 90%, 80%, 0.95)`
          ctx.beginPath()
          ctx.arc(r.x, r.y, 2.1, 0, Math.PI * 2)
          ctx.fill()
          if (r.y <= r.targetY) {
            g.rockets.splice(i, 1)
            explode(g, r, w)
            if (soundRef.current) sfx.burstBoom()
            // 愿望文字随烟花浮现
            if (r.text) g.texts.push({ text: r.text, x: r.x, y: r.y, born: now })
          }
        }

        // 火花粒子
        ctx.globalCompositeOperation = 'lighter'
        for (let i = g.sparks.length - 1; i >= 0; i--) {
          const p = g.sparks[i]
          p.x += p.vx
          p.y += p.vy
          p.vy += p.grav ?? 0.035
          p.vx *= 0.985
          p.vy *= 0.985
          p.life -= 1
          const a = Math.max(p.life / p.maxLife, 0)
          if (p.dim) {
            ctx.fillStyle = `hsla(${p.hue}, 90%, 75%, ${a * 0.5})`
          } else {
            ctx.fillStyle = `hsla(${p.hue}, 92%, ${58 + a * 22}%, ${a})`
          }
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.dim ? 1.1 : 1.9, 0, Math.PI * 2)
          ctx.fill()
          if (p.life <= 0) g.sparks.splice(i, 1)
        }
        ctx.globalCompositeOperation = 'source-over'

        // 愿望文字：缓缓上升淡出
        for (let i = g.texts.length - 1; i >= 0; i--) {
          const t = g.texts[i]
          const age = (now - t.born) / 1000
          if (age > 2.6) { g.texts.splice(i, 1); continue }
          const a = age < 0.4 ? age / 0.4 : 1 - (age - 0.4) / 2.2
          ctx.fillStyle = `rgba(235, 238, 255, ${Math.max(a, 0)})`
          ctx.font = `600 15px 'JetBrains Mono', monospace`
          ctx.textAlign = 'center'
          ctx.shadowColor = 'rgba(160, 180, 255, 0.8)'
          ctx.shadowBlur = 12
          ctx.fillText(t.text, t.x, t.y - age * 22)
          ctx.shadowBlur = 0
        }
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [])

  const makeWish = useCallback(() => {
    const wish = text.trim()
    if (!wish) {
      setError('先写下一个愿望吧')
      return
    }
    if (wish.length > 36) {
      setError('愿望太长了，精简到 36 字以内更容易实现')
      return
    }
    setError('')
    const shell = shellRef.current
    const canvas = canvasRef.current
    if (canvas && shell) {
      const w = canvas.width / (window.devicePixelRatio || 1)
      const hue = HUES[engineRef.current.hueIdx % HUES.length]
      engineRef.current.hueIdx += 1
      engineRef.current.rockets.push({
        x: w * (0.3 + Math.random() * 0.4),
        y: (engineRef.current.waterY ?? 300) - 4,
        vy: -(6.2 + Math.random() * 1.6),
        targetY: 60 + Math.random() * 90,
        hue,
        text: wish,
      })
      if (soundRef.current) sfx.whoosh()
    }
    const next = [{ text: wish, at: Date.now() }, ...wishes].slice(0, 12)
    setWishes(next)
    try { localStorage.setItem('wishes', JSON.stringify(next)) } catch { /* 忽略 */ }
    setText('')
    if (soundRef.current) sfx.chime()
  }, [text, wishes])

  const refire = useCallback((wish) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const w = canvas.width / (window.devicePixelRatio || 1)
    const hue = HUES[engineRef.current.hueIdx % HUES.length]
    engineRef.current.hueIdx += 1
    engineRef.current.rockets.push({
      x: w * (0.25 + Math.random() * 0.5),
      y: (engineRef.current.waterY ?? 300) - 4,
      vy: -(6.2 + Math.random() * 1.6),
      targetY: 60 + Math.random() * 90,
      hue,
      text: '',
    })
    if (soundRef.current) sfx.whoosh()
  }, [])

  const clearWishes = () => {
    setWishes([])
    try { localStorage.removeItem('wishes') } catch { /* 忽略 */ }
    sfx.ui()
  }

  return (
    <div className="gm-wrap">
      <header className="gm-header gm-header-row">
        <div>
          <p className="gm-kicker" style={{ color: 'rgba(150,170,230,0.85)' }}>CYBER WISHING WELL</p>
          <h1 className="gm-title gm-title-sm">赛博许愿池</h1>
        </div>
        <Link to="/games" className="gm-back gm-back-top">← 返回街机</Link>
      </header>

      <section className="gm-panel ww-panel">
        <div className="ww-input-row">
          <input
            type="text"
            className="ww-input"
            placeholder="写下你的愿望，放进烟花里放飞…"
            value={text}
            maxLength={40}
            onChange={(e) => { setText(e.target.value); if (error) setError('') }}
            onKeyDown={(e) => { if (e.key === 'Enter') makeWish() }}
          />
          <button type="button" className="gm-btn-start ww-btn" onClick={makeWish}>放飞</button>
        </div>
        {error && <p className="ww-error">{error}</p>}

        <div className="ww-shell" ref={shellRef}>
          <canvas ref={canvasRef} className="ww-canvas" />
        </div>

        <div className="ww-wall">
          <div className="ww-wall-head">
            <span className="ww-wall-title">愿望墙</span>
            {wishes.length > 0 && (
              <button type="button" className="ms-chip" onClick={clearWishes}>清空</button>
            )}
          </div>
          {wishes.length === 0 ? (
            <p className="ww-empty">还没有愿望。第一个愿望，通常和想见的人有关。</p>
          ) : (
            <div className="ww-wishes">
              {wishes.map((w) => (
                <button
                  key={w.at}
                  type="button"
                  className="ww-wish"
                  onClick={() => refire(w.text)}
                  title="点击再放一发烟花"
                >
                  <i className="ww-lamp" aria-hidden="true" />
                  {w.text}
                </button>
              ))}
            </div>
          )}
        </div>
        <p className="ww-tip">愿望只保存在你自己的浏览器里，烟花是给你自己看的仪式感。</p>
      </section>
    </div>
  )
}

// 爆炸：一圈粒子 + 随机双层
function explode(g, rocket, w) {
  const count = 64 + Math.floor(Math.random() * 30)
  const base = rocket.hue
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.2
    const speed = 1.6 + Math.random() * 3.4
    g.sparks.push({
      x: rocket.x,
      y: rocket.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 46 + Math.random() * 26,
      maxLife: 66,
      grav: 0.045,
      hue: Math.random() < 0.22 ? (base + 60) % 360 : base,
    })
  }
}
