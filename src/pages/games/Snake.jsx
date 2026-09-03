import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { sfx, MusicLoop } from '../../utils/sound'
import './games.css'
import './snake.css'

const COLS = 21
const ROWS = 21
const BASE_INTERVAL = 150
const MIN_INTERVAL = 72
const STEP = 3 // 每吃一个食物加速的毫秒数

const DIRS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}

const readNum = (key, fallback = 0) => {
  const v = Number(localStorage.getItem(key))
  return Number.isFinite(v) && v >= 0 ? v : fallback
}

function freshGame() {
  const snake = [
    { x: 10, y: 10 },
    { x: 9, y: 10 },
    { x: 8, y: 10 },
  ]
  return {
    snake,
    prev: snake.map((s) => ({ ...s })),
    dir: DIRS.right,
    queue: [],
    food: null,
    interval: BASE_INTERVAL,
    acc: 0,
    eaten: 0,
  }
}

function randomFood(snake, golden) {
  const occupied = new Set(snake.map((s) => `${s.x},${s.y}`))
  const pool = []
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (!occupied.has(`${x},${y}`)) pool.push({ x, y })
    }
  }
  const pick = pool[Math.floor(Math.random() * pool.length)] ?? { x: 0, y: 0 }
  return { ...pick, golden, ttl: golden ? 5200 : Infinity, born: performance.now() }
}

export default function Snake() {
  const canvasRef = useRef(null)
  const shellRef = useRef(null)
  const gameRef = useRef(freshGame())
  const musicRef = useRef(null)
  const scoreRef = useRef(0)
  const bestRef = useRef(readNum('snake-best'))
  const soundRef = useRef(true)
  const touchRef = useRef(null)

  const [status, setStatus] = useState('idle') // idle | running | paused | over
  const [score, setScore] = useState(0)
  const [best, setBest] = useState(bestRef.current)
  const [newRecord, setNewRecord] = useState(false)
  const [level, setLevel] = useState(1)
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem('snake-sound') !== 'off')
  const [musicOn, setMusicOn] = useState(() => localStorage.getItem('snake-music') === 'on')

  soundRef.current = soundOn

  // ---------- 持久化偏好 ----------
  useEffect(() => {
    try {
      localStorage.setItem('snake-sound', soundOn ? 'on' : 'off')
      localStorage.setItem('snake-music', musicOn ? 'on' : 'off')
    } catch { /* 忽略隐私模式 */ }
  }, [soundOn, musicOn])

  // ---------- 背景音乐 ----------
  useEffect(() => {
    if (!musicRef.current) musicRef.current = new MusicLoop()
    const music = musicRef.current
    if (musicOn && status === 'running') music.start()
    else music.stop()
    return () => music.stop()
  }, [musicOn, status])

  // ---------- 画布尺寸（高清渲染） ----------
  const draw = useCallback((now = performance.now()) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const sizeCss = canvas.width / (window.devicePixelRatio || 1)
    const cell = sizeCss / COLS
    const g = gameRef.current
    const dpr = window.devicePixelRatio || 1
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // 背景
    const bgGrad = ctx.createRadialGradient(sizeCss / 2, sizeCss / 2, 20, sizeCss / 2, sizeCss / 2, sizeCss * 0.75)
    bgGrad.addColorStop(0, '#0d1712')
    bgGrad.addColorStop(1, '#080d0a')
    ctx.fillStyle = bgGrad
    ctx.fillRect(0, 0, sizeCss, sizeCss)

    // 网格
    ctx.strokeStyle = 'rgba(120, 220, 160, 0.055)'
    ctx.lineWidth = 1
    for (let i = 1; i < COLS; i++) {
      ctx.beginPath()
      ctx.moveTo(i * cell, 0)
      ctx.lineTo(i * cell, sizeCss)
      ctx.stroke()
    }
    for (let i = 1; i < ROWS; i++) {
      ctx.beginPath()
      ctx.moveTo(0, i * cell)
      ctx.lineTo(sizeCss, i * cell)
      ctx.stroke()
    }

    // 食物
    if (g.food) {
      const pulse = Math.sin((now - g.food.born) / 170) * 1.6
      const fx = (g.food.x + 0.5) * cell
      const fy = (g.food.y + 0.5) * cell
      const golden = g.food.golden
      const expiring = golden && g.food.ttl < 1600
      const blink = expiring ? 0.45 + 0.55 * Math.abs(Math.sin(now / 90)) : 1
      ctx.save()
      ctx.globalAlpha = blink
      const glow = ctx.createRadialGradient(fx, fy, 1, fx, fy, cell * 1.15)
      glow.addColorStop(0, golden ? 'rgba(251,191,36,0.5)' : 'rgba(248,113,113,0.45)')
      glow.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = glow
      ctx.fillRect(fx - cell * 1.2, fy - cell * 1.2, cell * 2.4, cell * 2.4)
      ctx.fillStyle = golden ? '#fbbf24' : '#f87171'
      ctx.shadowColor = golden ? '#fbbf24' : '#f87171'
      ctx.shadowBlur = 14
      ctx.beginPath()
      ctx.arc(fx, fy, cell * 0.3 + pulse, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0
      ctx.fillStyle = 'rgba(255,255,255,0.75)'
      ctx.beginPath()
      ctx.arc(fx - cell * 0.09, fy - cell * 0.1, cell * 0.08, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    // 蛇（帧间插值，平滑滑行）
    const t = status === 'running' ? Math.min(g.acc / g.interval, 1) : 1
    const pts = g.snake.map((seg, i) => {
      const p = g.prev[Math.min(i, g.prev.length - 1)]
      return {
        x: (p.x + (seg.x - p.x) * t + 0.5) * cell,
        y: (p.y + (seg.y - p.y) * t + 0.5) * cell,
      }
    })
    const len = pts.length
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (let i = len - 1; i > 0; i--) {
      const k = 1 - i / len
      const c1 = [74, 222, 128]
      const c2 = [22, 101, 52]
      const mix = c1.map((v, j) => Math.round(v + (c2[j] - v) * (1 - k)))
      ctx.strokeStyle = `rgba(${mix[0]},${mix[1]},${mix[2]},${0.55 + 0.45 * k})`
      ctx.lineWidth = cell * (0.52 + 0.24 * k)
      ctx.beginPath()
      ctx.moveTo(pts[i].x, pts[i].y)
      ctx.lineTo(pts[i - 1].x, pts[i - 1].y)
      ctx.stroke()
    }
    // 头部
    const head = pts[0]
    ctx.save()
    ctx.shadowColor = 'rgba(74,222,128,0.65)'
    ctx.shadowBlur = 12
    ctx.fillStyle = '#4ade80'
    ctx.beginPath()
    ctx.arc(head.x, head.y, cell * 0.42, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    // 眼睛（垂直于运动方向分布）
    const dir = g.dir
    const px = -dir.y
    const py = dir.x
    for (const side of [-1, 1]) {
      const ex = head.x + dir.x * cell * 0.16 + px * side * cell * 0.17
      const ey = head.y + dir.y * cell * 0.16 + py * side * cell * 0.17
      ctx.fillStyle = '#0b120d'
      ctx.beginPath()
      ctx.arc(ex, ey, cell * 0.075, 0, Math.PI * 2)
      ctx.fill()
    }
  }, [status])

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const shell = shellRef.current
    if (!canvas || !shell) return
    const sizeCss = Math.min(shell.clientWidth, 500)
    const dpr = window.devicePixelRatio || 1
    canvas.width = sizeCss * dpr
    canvas.height = sizeCss * dpr
    canvas.style.width = `${sizeCss}px`
    canvas.style.height = `${sizeCss}px`
    draw()
  }, [draw])

  useEffect(() => {
    resizeCanvas()
    const onResize = () => resizeCanvas()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [resizeCanvas])

  // ---------- 游戏循环 ----------
  useEffect(() => {
    if (status !== 'running') return undefined
    const g = gameRef.current
    g.last = performance.now()

    const die = () => {
      g.dead = true
      const finalScore = scoreRef.current
      setNewRecord(finalScore > bestRef.current && finalScore > 0)
      if (finalScore > bestRef.current) {
        bestRef.current = finalScore
        setBest(finalScore)
        try {
          localStorage.setItem('snake-best', String(finalScore))
        } catch { /* 忽略 */ }
      }
      setStatus('over')
      if (soundRef.current) sfx.over()
    }

    const applyDir = () => {
      while (g.queue.length) {
        const d = g.queue.shift()
        const isReverse = d.x === -g.dir.x && d.y === -g.dir.y
        const isSame = d.x === g.dir.x && d.y === g.dir.y
        if (!isReverse && !isSame) {
          g.dir = d
          break
        }
      }
    }

    const tick = () => {
      applyDir()
      g.prev = g.snake.map((s) => ({ ...s }))
      const head = g.snake[0]
      const nx = head.x + g.dir.x
      const ny = head.y + g.dir.y

      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) {
        die()
        return
      }
      const eating = g.food && nx === g.food.x && ny === g.food.y
      const bodyLen = eating ? g.snake.length : g.snake.length - 1
      for (let i = 0; i < bodyLen; i++) {
        if (g.snake[i].x === nx && g.snake[i].y === ny) {
          die()
          return
        }
      }

      g.snake.unshift({ x: nx, y: ny })
      if (eating) {
        const golden = g.food.golden
        scoreRef.current += golden ? 3 : 1
        setScore(scoreRef.current)
        g.eaten += 1
        g.interval = Math.max(MIN_INTERVAL, BASE_INTERVAL - g.eaten * STEP)
        setLevel(1 + Math.floor((BASE_INTERVAL - g.interval) / (STEP * 4)))
        if (soundRef.current) (golden ? sfx.golden : sfx.eat)(g.eaten)
        g.food = randomFood(g.snake, Math.random() < 0.14)
      } else {
        g.snake.pop()
      }
      // 金苹果过期 → 换普通苹果
      if (g.food && Number.isFinite(g.food.ttl)) {
        g.food.ttl -= g.interval
        if (g.food.ttl <= 0) g.food = randomFood(g.snake, false)
      }
    }

    let raf
    const frame = (now) => {
      const dt = Math.min(now - g.last, 120)
      g.last = now
      g.acc += dt
      let guard = 0
      while (g.acc >= g.interval && !g.dead && guard < 8) {
        g.acc -= g.interval
        tick()
        guard++
      }
      draw(now)
      if (!g.dead) raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [status, draw])

  // ---------- 操作 ----------
  const start = useCallback((dir) => {
    gameRef.current = freshGame()
    gameRef.current.food = randomFood(gameRef.current.snake, Math.random() < 0.14)
    if (dir) gameRef.current.queue.push(dir)
    scoreRef.current = 0
    setScore(0)
    setLevel(1)
    setNewRecord(false)
    setStatus('running')
  }, [])

  const pushDir = useCallback((d) => {
    const g = gameRef.current
    if (status === 'idle' || status === 'over') {
      start(d)
      return
    }
    if (status === 'paused') {
      setStatus('running')
    }
    if (g.queue.length < 3) g.queue.push(d)
  }, [status, start])

  useEffect(() => {
    const onKey = (e) => {
      const key = e.key.toLowerCase()
      const dirMap = {
        arrowup: DIRS.up, w: DIRS.up,
        arrowdown: DIRS.down, s: DIRS.down,
        arrowleft: DIRS.left, a: DIRS.left,
        arrowright: DIRS.right, d: DIRS.right,
      }
      if (dirMap[key]) {
        e.preventDefault()
        pushDir(dirMap[key])
        return
      }
      if (e.key === ' ') {
        e.preventDefault()
        if (status === 'running') setStatus('paused')
        else if (status === 'paused') setStatus('running')
        else start()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [status, pushDir, start])

  // 失焦自动暂停
  useEffect(() => {
    const onBlur = () => {
      if (status === 'running') setStatus('paused')
    }
    window.addEventListener('blur', onBlur)
    return () => window.removeEventListener('blur', onBlur)
  }, [status])

  // 触屏滑动
  const onTouchStart = (e) => {
    const t = e.touches[0]
    touchRef.current = { x: t.clientX, y: t.clientY, used: false }
  }
  const onTouchMove = (e) => {
    const rec = touchRef.current
    if (!rec || rec.used) return
    const t = e.touches[0]
    const dx = t.clientX - rec.x
    const dy = t.clientY - rec.y
    if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return
    rec.used = true
    if (Math.abs(dx) > Math.abs(dy)) pushDir(dx > 0 ? DIRS.right : DIRS.left)
    else pushDir(dy > 0 ? DIRS.down : DIRS.up)
  }

  const overlay = status !== 'running' && (
    <div className="sn-overlay">
      {status === 'idle' && (
        <>
          <p className="sn-overlay-title">准备好了吗？</p>
          <p className="sn-overlay-sub">方向键 / WASD / 滑动屏幕 控制方向，空格暂停</p>
          <button type="button" className="gm-btn-start" onClick={() => start()}>开始游戏</button>
        </>
      )}
      {status === 'paused' && (
        <>
          <p className="sn-overlay-title">已暂停</p>
          <button type="button" className="gm-btn-start" onClick={() => setStatus('running')}>继续</button>
        </>
      )}
      {status === 'over' && (
        <>
          <p className="sn-overlay-title">{newRecord ? '新纪录！' : '游戏结束'}</p>
          <p className="sn-overlay-score">
            {score} <small>分</small>
            {newRecord && <span className="sn-record-tag">NEW</span>}
          </p>
          <button type="button" className="gm-btn-start" onClick={() => start()}>再来一局</button>
        </>
      )}
    </div>
  )

  return (
    <div className="gm-wrap">
      <header className="gm-header gm-header-row">
        <div>
          <p className="gm-kicker" style={{ color: 'rgba(52,211,153,0.8)' }}>SNAKE</p>
          <h1 className="gm-title gm-title-sm">贪吃蛇</h1>
        </div>
        <Link to="/games" className="gm-back gm-back-top">← 返回街机</Link>
      </header>

      <section className="gm-panel sn-panel">
        <div className="sn-hud">
          <div className="sn-hud-score">
            <span className="sn-hud-label">分数</span>
            <span key={score} className="sn-hud-value">{score}</span>
          </div>
          <div className="sn-hud-score">
            <span className="sn-hud-label">最佳</span>
            <span className="sn-hud-value dim">{best}</span>
          </div>
          <div className="sn-hud-score">
            <span className="sn-hud-label">速度</span>
            <span className="sn-hud-value dim">Lv.{level}</span>
          </div>
          <div className="sn-hud-actions">
            <button
              type="button"
              className="ms-chip"
              onClick={() => {
                if (status === 'running') setStatus('paused')
                else if (status === 'paused') setStatus('running')
                else start()
              }}
            >
              {status === 'running' ? '暂停' : status === 'paused' ? '继续' : '开始'}
            </button>
            <button type="button" className={`ms-chip ${musicOn ? 'active' : ''}`} onClick={() => setMusicOn((v) => !v)} title="背景音乐">
              🎵 {musicOn ? 'ON' : 'OFF'}
            </button>
            <button type="button" className="ms-chip" onClick={() => setSoundOn((v) => !v)} title="音效开关">
              {soundOn ? '🔊' : '🔇'}
            </button>
          </div>
        </div>

        <div className="sn-shell" ref={shellRef}>
          <canvas
            ref={canvasRef}
            className="sn-canvas"
            style={{ touchAction: 'none' }}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
          />
          {overlay}
        </div>

        <div className="sn-pad" aria-hidden="true">
          <span />
          <button type="button" className="sn-pad-btn" onPointerDown={() => pushDir(DIRS.up)}>▲</button>
          <span />
          <button type="button" className="sn-pad-btn" onPointerDown={() => pushDir(DIRS.left)}>◀</button>
          <button type="button" className="sn-pad-btn" onPointerDown={() => pushDir(DIRS.down)}>▼</button>
          <button type="button" className="sn-pad-btn" onPointerDown={() => pushDir(DIRS.right)}>▶</button>
        </div>

        <p className="sn-tip">吃普通苹果 +1 分；金苹果 +3 分但会限时消失。撞墙或咬到自己即结束。</p>
      </section>
    </div>
  )
}
