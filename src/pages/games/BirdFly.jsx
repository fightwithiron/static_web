import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { sfx } from '../../utils/sound'
import { useConfetti, ConfettiLayer } from '../../components/Confetti'
import './games.css'
import './bird.css'

// 笨鸟先飞：全程序化绘制的振翅穿柱游戏
// 物理调校参考社区共识：恒定重力 + 振翅直接设置上升速度（非叠加），保证每跳手感一致

const DIFFS = [
  { id: 'easy', name: '简单', desc: '柱缝宽、速度慢' },
  { id: 'hard', name: '困难', desc: '柱缝窄、速度快' },
]

const LEVELS = {
  easy: { gap: 172, speed: 150, spacing: 240 },
  hard: { gap: 142, speed: 188, spacing: 218 },
}

const CW = 480, CH = 600
const GROUND_H = 64
const BIRD_X = 132
const GRAVITY = 1650
const FLAP_VY = -420
const MAX_FALL = 560
const BIRD_R = 14 // 碰撞半径

const rand = (a, b) => a + Math.random() * (b - a)

// 星空（固定种子的一次性生成）
const STARS = Array.from({ length: 42 }, (_, i) => ({
  x: (i * 97.3) % CW,
  y: (i * 61.7) % (CH - GROUND_H - 80),
  r: 0.6 + ((i * 7) % 5) * 0.28,
  ph: (i * 1.7) % (Math.PI * 2),
}))

// 天际线：以楼层序号为种子的确定性伪随机
const skylineH = (n) => 46 + ((n * 73) % 7) * 16 + ((n * 31) % 5) * 6

const readRecord = (diff) => {
  try {
    const r = JSON.parse(localStorage.getItem(`bird-record-${diff}`) ?? 'null')
    return r ?? { best: 0 }
  } catch { return { best: 0 } }
}

const medalOf = (score) => {
  if (score >= 40) return { name: '铂翼', color: '#e0f2fe' }
  if (score >= 25) return { name: '金翼', color: '#fbbf24' }
  if (score >= 15) return { name: '银翼', color: '#cbd5e1' }
  if (score >= 8) return { name: '铜翼', color: '#d97706' }
  return null
}

export default function BirdFly() {
  const canvasRef = useRef(null)
  const [difficulty, setDifficulty] = useState(() => localStorage.getItem('bird-diff') ?? 'easy')
  const [status, setStatus] = useState('idle') // idle | ready | playing | dying | over
  const [score, setScore] = useState(0)
  const [best, setBest] = useState(0)
  const [isNewBest, setIsNewBest] = useState(false)
  const [records, setRecords] = useState(() => ({ easy: readRecord('easy'), hard: readRecord('hard') }))
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem('bird-sound') !== 'off')
  const { pieces: confetti, burst } = useConfetti({
    colors: ['#fbbf24', '#4ade80', '#60a5fa', '#f472b6', '#fde68a'],
  })

  const worldRef = useRef(null)
  const soundRef = useRef(soundOn)
  soundRef.current = soundOn
  const diffRef = useRef(difficulty)
  diffRef.current = difficulty
  const statusRef = useRef(status)
  statusRef.current = status

  const recordsRef = useRef(records)
  recordsRef.current = records

  useEffect(() => {
    try {
      localStorage.setItem('bird-diff', difficulty)
      localStorage.setItem('bird-sound', soundOn ? 'on' : 'off')
    } catch { /* 忽略 */ }
  }, [difficulty, soundOn])

  const resetWorld = useCallback(() => {
    worldRef.current = {
      y: CH * 0.42, vy: 0, rot: 0, wing: 0,
      pipes: [], scroll: 0, t: 0,
      score: 0, flash: 0, shake: 0, deathGround: false,
    }
    setScore(0)
  }, [])

  const finish = useCallback(() => {
    const w = worldRef.current
    const diff = diffRef.current
    const s = w.score
    const prevBest = recordsRef.current[diff].best
    setStatus('over')
    setBest(s)
    setIsNewBest(s > prevBest && s > 0)
    setRecords((prev) => {
      const rec = { best: Math.max(prev[diff].best, s) }
      try { localStorage.setItem(`bird-record-${diff}`, JSON.stringify(rec)) } catch { /* 忽略 */ }
      return { ...prev, [diff]: rec }
    })
    if (soundRef.current) sfx.over()
    if (s >= 25) burst()
  }, [burst])

  // 振翅：唯一输入。ready 态首次输入直接起跳开局
  const flap = useCallback(() => {
    if (statusRef.current === 'idle' || statusRef.current === 'over') return
    const w = worldRef.current
    if (statusRef.current === 'ready') setStatus('playing')
    w.vy = FLAP_VY // 直接设速度，保证每次振翅力度一致
    w.wing = 1
    if (soundRef.current) sfx.flap()
  }, [])

  const start = useCallback(() => {
    resetWorld()
    setStatus('ready')
    if (soundRef.current) sfx.ui()
  }, [resetWorld])

  // ---------- 循环 ----------
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = CW * dpr
    canvas.height = CH * dpr
    let raf = 0
    let last = performance.now()
    let ambient = 0 // 环境动画时间：world 为 null（idle）时也要能走

    const drawBird = (w) => {
      const flapK = Math.sin(w.wing * Math.PI * 2)
      ctx.save()
      ctx.translate(BIRD_X, w.y)
      ctx.rotate(w.rot)
      // 身体
      ctx.fillStyle = '#fbbf24'
      ctx.strokeStyle = 'rgba(8, 10, 16, 0.55)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.ellipse(0, 0, 16, 12.5, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      // 肚皮
      ctx.fillStyle = '#fde68a'
      ctx.beginPath()
      ctx.ellipse(2.5, 5, 9.5, 6.5, 0, 0, Math.PI * 2)
      ctx.fill()
      // 翅膀（绕肩点扑动）
      ctx.save()
      ctx.translate(-3, -1)
      ctx.rotate(flapK * 0.9 - 0.2)
      ctx.fillStyle = '#d97706'
      ctx.beginPath()
      ctx.ellipse(-4, 0, 8.5, 5, 0.25, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(8, 10, 16, 0.4)'
      ctx.stroke()
      ctx.restore()
      // 眼睛
      ctx.fillStyle = '#fff'
      ctx.beginPath()
      ctx.arc(7.5, -4.5, 4.4, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(8, 10, 16, 0.35)'
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.fillStyle = '#0b0d14'
      ctx.beginPath()
      ctx.arc(9, -4.5, 2, 0, Math.PI * 2)
      ctx.fill()
      // 喙
      ctx.fillStyle = '#fb923c'
      ctx.beginPath()
      ctx.moveTo(13, -1)
      ctx.lineTo(22, 1.5)
      ctx.lineTo(13, 5)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }

    const drawPipePair = (p, gap, glow) => {
      const pw = 64
      const topH = p.gapY - gap / 2
      const botY = p.gapY + gap / 2
      const cap = (y, h) => {
        ctx.fillStyle = '#0c1f26'
        ctx.fillRect(p.x, y, pw, h)
        ctx.strokeStyle = glow
        ctx.lineWidth = 2
        ctx.shadowColor = glow
        ctx.shadowBlur = 10
        ctx.strokeRect(p.x + 1, y + 1, pw - 2, h - 2)
        ctx.shadowBlur = 0
      }
      cap(-8, topH + 8)
      cap(botY, CH - GROUND_H - botY + 4)
      // 柱头帽檐
      ctx.fillStyle = '#12333d'
      ctx.fillRect(p.x - 4, topH - 14, pw + 8, 14)
      ctx.fillRect(p.x - 4, botY, pw + 8, 14)
      ctx.strokeStyle = glow
      ctx.lineWidth = 1.5
      ctx.strokeRect(p.x - 3.5, topH - 13.5, pw + 7, 13)
      ctx.strokeRect(p.x - 3.5, botY + 0.5, pw + 7, 13)
    }

    const step = (now) => {
      raf = requestAnimationFrame(step)
      const dt = Math.min((now - last) / 1000, 0.033)
      last = now
      const w = worldRef.current
      const lv = LEVELS[diffRef.current]
      const st = statusRef.current

      // ===== 更新 =====
      ambient += dt
      if (w) {
        w.t += dt
        if (st === 'ready' && w) {
          w.y = CH * 0.42 + Math.sin(ambient * 3.2) * 7
          w.rot = 0
          w.wing = (w.wing + dt * 2.4) % 1
        } else if (st === 'playing' || st === 'dying') {
          w.vy = Math.min(MAX_FALL, w.vy + GRAVITY * dt)
          w.y += w.vy * dt
          // 俯仰角跟随速度
          const targetRot = Math.max(-0.42, Math.min(1.35, w.vy / 520))
          w.rot += (targetRot - w.rot) * Math.min(1, dt * (w.vy < 0 ? 14 : 5.5))
          if (w.wing > 0) w.wing = Math.max(0, w.wing - dt * 2.6)
          w.flash = Math.max(0, w.flash - dt * 3)
          w.shake = Math.max(0, w.shake - dt * 3)

          if (st === 'playing') {
            w.scroll += lv.speed * dt
            // 柱子
            for (const p of w.pipes) p.x -= lv.speed * dt
            w.pipes = w.pipes.filter((p) => p.x > -80)
            const lastX = w.pipes.length ? w.pipes[w.pipes.length - 1].x : -Infinity
            if (lastX < CW - lv.spacing) {
              w.pipes.push({ x: Math.max(CW + 10, lastX + lv.spacing), gapY: rand(120, CH - GROUND_H - 120) })
            }
            // 记分
            for (const p of w.pipes) {
              if (!p.passed && p.x + 64 < BIRD_X - BIRD_R) {
                p.passed = true
                w.score++
                setScore(w.score)
                if (soundRef.current) sfx.ding()
              }
            }
            // 顶棚
            if (w.y < BIRD_R + 2) { w.y = BIRD_R + 2; w.vy = Math.max(w.vy, 0) }
            // 碰撞：圆 vs 两根矩形柱
            const hit = (px, py, pw2, ph2) => {
              const nx = Math.max(px, Math.min(BIRD_X, px + pw2))
              const ny = Math.max(py, Math.min(w.y, py + ph2))
              return (BIRD_X - nx) ** 2 + (w.y - ny) ** 2 < BIRD_R * BIRD_R
            }
            for (const p of w.pipes) {
              if (p.x > BIRD_X + 90 || p.x + 64 < BIRD_X - 90) continue
              if (hit(p.x, -8, 64, p.gapY - lv.gap / 2 + 8) ||
                  hit(p.x, p.gapY + lv.gap / 2, 64, CH - GROUND_H - p.gapY - lv.gap / 2 + 8)) {
                setStatus('dying')
                w.vy = Math.min(w.vy, -160) // 撞后弹起一点再坠
                w.flash = 1
                w.shake = 1
                if (soundRef.current) sfx.crash()
                break
              }
            }
          }
          // 地面（dying 也继续坠）
          if (w.y > CH - GROUND_H - BIRD_R) {
            w.y = CH - GROUND_H - BIRD_R
            if (st === 'playing') {
              setStatus('dying')
              w.flash = 1
              w.shake = 0.6
              if (soundRef.current) sfx.crash()
            } else if (st === 'dying' && !w.deathGround) {
              w.deathGround = true
              finish()
            }
          }
        }
      }

      // ===== 绘制 =====
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (w && w.shake > 0) ctx.translate(rand(-6, 6) * w.shake, rand(-5, 5) * w.shake)

      // 夜空
      const sky = ctx.createLinearGradient(0, 0, 0, CH)
      sky.addColorStop(0, '#0b1226')
      sky.addColorStop(0.6, '#101a33')
      sky.addColorStop(1, '#1a2440')
      ctx.fillStyle = sky
      ctx.fillRect(-10, -10, CW + 20, CH + 20)

      // 星
      for (const s of STARS) {
        ctx.globalAlpha = 0.35 + 0.4 * Math.abs(Math.sin(ambient * 1.4 + s.ph))
        ctx.fillStyle = '#dbeafe'
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
      // 月
      ctx.fillStyle = 'rgba(226, 232, 240, 0.9)'
      ctx.beginPath()
      ctx.arc(CW - 74, 84, 26, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#0b1226'
      ctx.beginPath()
      ctx.arc(CW - 64, 76, 22, 0, Math.PI * 2)
      ctx.fill()

      const scrollX = w ? w.scroll : ambient * 30
      // 远景天际线
      ctx.fillStyle = 'rgba(30, 41, 66, 0.85)'
      for (let n = Math.floor(scrollX * 0.25 / 52) - 1; n < (scrollX * 0.25 + CW) / 52 + 1; n++) {
        const bx = n * 52 - scrollX * 0.25
        ctx.fillRect(bx, CH - GROUND_H - skylineH(n) - 26, 46, skylineH(n) + 26)
      }
      // 近景天际线 + 零星亮窗
      for (let n = Math.floor(scrollX * 0.55 / 44) - 1; n < (scrollX * 0.55 + CW) / 44 + 1; n++) {
        const bx = n * 44 - scrollX * 0.55
        const bh = skylineH(n * 3 + 11)
        ctx.fillStyle = 'rgba(17, 24, 44, 0.96)'
        ctx.fillRect(bx, CH - GROUND_H - bh, 40, bh)
        if ((n * 13) % 3 === 0) {
          ctx.fillStyle = 'rgba(251, 191, 36, 0.24)'
          ctx.fillRect(bx + 8, CH - GROUND_H - bh + 10, 6, 8)
          ctx.fillRect(bx + 24, CH - GROUND_H - bh + 26, 6, 8)
        }
      }

      // 柱子
      const glow = st === 'hard' ? 'rgba(74, 222, 128, 0.75)' : 'rgba(56, 189, 248, 0.75)'
      if (w) for (const p of w.pipes) drawPipePair(p, lv.gap, glow)

      // 地面
      ctx.fillStyle = '#0d1526'
      ctx.fillRect(-10, CH - GROUND_H, CW + 20, GROUND_H + 10)
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(-10, CH - GROUND_H + 1)
      ctx.lineTo(CW + 10, CH - GROUND_H + 1)
      ctx.stroke()
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)'
      ctx.lineWidth = 1
      const hatchOff = (scrollX * 1) % 18
      for (let hx = -18 - hatchOff; hx < CW + 18; hx += 18) {
        ctx.beginPath()
        ctx.moveTo(hx, CH - GROUND_H + 6)
        ctx.lineTo(hx + 12, CH - 8)
        ctx.stroke()
      }

      // 鸟
      if (w) drawBird(w)

      // 受击白闪
      if (w && w.flash > 0) {
        ctx.fillStyle = `rgba(255, 241, 230, ${w.flash * 0.55})`
        ctx.fillRect(-10, -10, CW + 20, CH + 20)
      }

      // ready 提示
      if (st === 'ready' || st === 'idle') {
        ctx.save()
        ctx.textAlign = 'center'
        ctx.fillStyle = 'rgba(226, 232, 240, 0.9)'
        ctx.font = "600 17px 'JetBrains Mono', ui-monospace, monospace"
        ctx.fillText('点击 / 空格 振翅', CW / 2, CH * 0.62)
        ctx.fillStyle = 'rgba(148, 163, 184, 0.7)'
        ctx.font = "12px 'JetBrains Mono', ui-monospace, monospace"
        ctx.fillText('穿过柱缝 +1 分', CW / 2, CH * 0.62 + 24)
        ctx.restore()
      }

      // 进行中分数（画在画布顶部）
      if (st === 'playing' || st === 'dying') {
        ctx.save()
        ctx.textAlign = 'center'
        ctx.font = "700 44px 'JetBrains Mono', ui-monospace, monospace"
        ctx.fillStyle = 'rgba(226, 232, 240, 0.92)'
        ctx.strokeStyle = 'rgba(8, 10, 16, 0.6)'
        ctx.lineWidth = 4
        ctx.strokeText(String(w.score), CW / 2, 64)
        ctx.fillText(String(w.score), CW / 2, 64)
        ctx.restore()
      }
    }

    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [difficulty, finish])

  // ---------- 输入：点击 / 触摸 / 空格 / ↑ ----------
  useEffect(() => {
    const canvas = canvasRef.current
    const press = (e) => {
      if (e.touches) e.preventDefault()
      flap()
    }
    canvas.addEventListener('mousedown', press)
    canvas.addEventListener('touchstart', press, { passive: false })
    const key = (e) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault()
        flap()
      }
    }
    window.addEventListener('keydown', key)
    return () => {
      canvas.removeEventListener('mousedown', press)
      canvas.removeEventListener('touchstart', press)
      window.removeEventListener('keydown', key)
    }
  }, [flap])

  const record = records[difficulty]
  const medal = medalOf(best)

  return (
    <div className="gm-wrap">
      <header className="gm-header gm-header-row">
        <div>
          <p className="gm-kicker" style={{ color: 'rgba(251, 191, 36, 0.85)' }}>EARLY BIRD</p>
          <h1 className="gm-title gm-title-sm">笨鸟先飞</h1>
        </div>
        <Link to="/games" className="gm-back gm-back-top">← 返回街机</Link>
      </header>

      <section className="gm-panel bd-panel">
        <div className="bd-toolbar">
          <div className="gm-seg">
            {DIFFS.map((d) => (
              <button
                key={d.id}
                type="button"
                className={`gm-seg-btn ${difficulty === d.id ? 'active' : ''}`}
                onClick={() => { setDifficulty(d.id); if (soundRef.current) sfx.ui() }}
                title={d.desc}
              >
                {d.name}
              </button>
            ))}
          </div>
          <div className="bd-toolbar-right">
            <button type="button" className="ms-chip" onClick={start}>
              {status === 'idle' ? '起飞' : status === 'over' ? '再飞一次' : '重新开始'}
            </button>
            <button type="button" className="ms-chip" onClick={() => setSoundOn((v) => !v)}>{soundOn ? '🔊' : '🔇'}</button>
          </div>
        </div>

        <div className="ff-hud">
          <span className="wf-stat">本局<b>{score}</b></span>
          <span className="wf-stat">{difficulty === 'hard' ? '困难' : '简单'}最佳<b>{record.best} 柱</b></span>
          <span className="wf-stat">称号<b>{record.best >= 8 ? medalOf(record.best).name : '—'}</b></span>
        </div>

        <div className="gk-shell bd-shell">
          <canvas ref={canvasRef} className="bd-canvas" />
          {status === 'idle' && (
            <div className="gk-overlay">
              <p className="gk-overlay-title">笨鸟先飞 · 夜航篇</p>
              <p className="gk-overlay-sub">
                一只笨鸟要穿过一整片能量柱林。<br />
                点击 / 触屏 / 空格振翅，撞柱或落地即坠。简单柱缝宽，困难又窄又快。
              </p>
              <div className="gk-overlay-actions">
                <button type="button" className="gm-btn-start" onClick={start}>起飞</button>
              </div>
            </div>
          )}
          {status === 'over' && (
            <div className="gk-overlay gk-overlay-lite">
              <p className="gk-overlay-title">{medal ? `${medal.name} · ${best} 柱` : `${best} 柱`}</p>
              <p className="gk-overlay-sub">
                {isNewBest ? '新纪录！笨鸟也有春天。'
                  : best === 0 ? '第一次起飞总会栽跟头，笨鸟先飞。'
                  : `距离 ${difficulty === 'hard' ? '困难' : '简单'}最佳 ${record.best} 柱还差一点，再试一次，笨鸟先飞。`}
              </p>
              <div className="gk-overlay-actions">
                <button type="button" className="gm-btn-start" onClick={start}>再飞一次</button>
              </div>
            </div>
          )}
          <ConfettiLayer pieces={confetti} />
        </div>

        <p className="gk-tip">每根柱子 +1 分；铜翼 8 / 银翼 15 / 金翼 25 / 铂翼 40。25 柱以上落地时撒花。</p>
      </section>
    </div>
  )
}
