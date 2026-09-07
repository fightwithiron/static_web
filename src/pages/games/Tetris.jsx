import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { sfx } from '../../utils/sound'
import { useConfetti, ConfettiLayer } from '../../components/Confetti'
import {
  COLS, ROWS, PIECES, KICKS_JLSTZ, KICKS_I,
  makePiece, newBag, collides, tryClearRows, rotCW, rotCCW,
} from '../../utils/tetris-core'
import './games.css'
import './tetris.css'

// 俄罗斯方块：自研引擎（纯逻辑在 utils/tetris-core.js，可独立单测）+ guideline 共识设计
// 7-bag 随机 / SRS 踢墙表 / 幽灵方块 / Hold / 锁定延迟 / 指南针重力曲线 / 连击计分
// 场景：霓虹夜色 CRT 机台（星空 + 城市剪影 + 扫描线 + 辉光方块）

const CELL = 26
const CW = 470, CH = 560
const BX = 105, BY = 20 // 棋盘原点

// 指南针重力：每行下落秒数按等级指数缩短
const gravitySec = (level) => Math.pow(0.8 - (level - 1) * 0.007, level - 1)

const LINE_SCORE = [0, 100, 300, 500, 800]
const LOCK_DELAY = 0.5
const MAX_LOCK_RESETS = 15

const rand = (a, b) => a + Math.random() * (b - a)

// 星空（固定伪随机）
const STARS = Array.from({ length: 36 }, (_, i) => ({
  x: (i * 113.7) % CW,
  y: (i * 71.3) % (CH - 60),
  r: 0.5 + ((i * 5) % 4) * 0.3,
  ph: (i * 1.9) % (Math.PI * 2),
}))
const skylineH = (n) => 34 + ((n * 67) % 6) * 12 + ((n * 29) % 5) * 5

const readBest = () => Number(localStorage.getItem('tetris-best')) || 0

export default function Tetris() {
  const canvasRef = useRef(null)
  const [status, setStatus] = useState('idle') // idle | playing | paused | over
  const [result, setResult] = useState(null) // { score, lines, level, isBest }
  const [best, setBest] = useState(readBest)
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem('tetris-sound') !== 'off')
  const { pieces: confetti, burst } = useConfetti({
    colors: ['#38bdf8', '#e879f9', '#4ade80', '#fbbf24', '#60a5fa'],
  })

  const worldRef = useRef(null)
  const soundRef = useRef(soundOn)
  soundRef.current = soundOn
  const statusRef = useRef(status)
  statusRef.current = status
  const inputRef = useRef({ left: false, right: false, soft: false, dasT: 0, dasDir: 0 })
  const pressRef = useRef({})

  useEffect(() => {
    try { localStorage.setItem('tetris-sound', soundOn ? 'on' : 'off') } catch { /* 忽略 */ }
  }, [soundOn])

  // ---------- 世界 ----------
  const resetWorld = useCallback(() => {
    const next = [...newBag(), ...newBag()]
    const first = next.shift()
    worldRef.current = {
      grid: Array.from({ length: ROWS }, () => new Array(COLS).fill(0)),
      cur: makePiece(first),
      queue: next,
      hold: null,
      holdUsed: false,
      score: 0, lines: 0, level: 1, combo: 0,
      gravT: 0, lockT: 0, lockResets: 0,
      clearAnim: null, // { rows: [], t }
      shake: 0, banner: null, // { text, color, t }
      t: 0, softRow: false,
    }
  }, [])

  const finish = useCallback(() => {
    const w = worldRef.current
    const prevBest = readBest()
    const isBest = w.score > prevBest && w.score > 0
    if (isBest) {
      try { localStorage.setItem('tetris-best', String(w.score)) } catch { /* 忽略 */ }
      setBest(w.score)
    }
    setResult({ score: w.score, lines: w.lines, level: w.level, isBest })
    setStatus('over')
    if (soundRef.current) sfx.over()
    if (w.lines >= 20) burst()
  }, [burst])

  // ---------- 操作 ----------
  const tryMove = (w, dx, dy) => {
    if (!collides(w.grid, w.cur.cells, w.cur.x + dx, w.cur.y + dy)) {
      w.cur.x += dx
      w.cur.y += dy
      return true
    }
    return false
  }

  const tryRotate = (w, dir) => {
    const p = w.cur
    if (p.type === 'O') return true
    const from = p.rot
    const to = (p.rot + (dir > 0 ? 1 : 3)) % 4
    const cells = dir > 0 ? rotCW(p.cells, p.n) : rotCCW(p.cells, p.n)
    const table = p.type === 'I' ? KICKS_I : KICKS_JLSTZ
    const kicks = table[`${from}${to}`] ?? [[0, 0]]
    for (const [kx, ky] of kicks) {
      if (!collides(w.grid, cells, p.x + kx, p.y + ky)) {
        p.cells = cells
        p.rot = to
        p.x += kx
        p.y += ky
        return true
      }
    }
    return false
  }

  const ghostY = (w) => {
    let gy = w.cur.y
    while (!collides(w.grid, w.cur.cells, w.cur.x, gy + 1)) gy++
    return gy
  }

  const lockPiece = useCallback((w) => {
    for (const [cx, cy] of w.cur.cells) {
      const y = w.cur.y + cy
      const x = w.cur.x + cx
      if (y < 0) { finish(); return } // 锁在可见区外：顶死
      w.grid[y][x] = w.cur.color
    }

    // 消行（tryClearRows 返回新网格，动画结束后再替换）
    const cleared = tryClearRows(w.grid)
    const rows = cleared ? cleared.rows : []
    if (rows.length) {
      w.combo++
      const pts = LINE_SCORE[rows.length] * w.level + (w.combo > 1 ? 50 * (w.combo - 1) * w.level : 0)
      w.score += pts
      w.lines += rows.length
      const newLevel = Math.min(20, 1 + Math.floor(w.lines / 10))
      if (newLevel > w.level) {
        w.level = newLevel
        w.banner = { text: `LEVEL ${newLevel}`, color: '#4ade80', t: 0 }
        if (soundRef.current) sfx.evolve()
      } else if (rows.length === 4) {
        w.banner = { text: 'TETRIS!', color: '#e879f9', t: 0 }
        w.shake = 1
        if (soundRef.current) sfx.golden()
      } else if (soundRef.current) {
        sfx.ding()
      }
      w.clearAnim = { rows, grid: cleared.grid, t: 0, pts }
    } else {
      w.combo = 0
      spawnNext(w)
    }
    if (soundRef.current) sfx.muyu(1)
  }, [finish])

  const spawnNext = useCallback((w) => {
    const type = w.queue.shift()
    while (w.queue.length < 5) w.queue.push(...newBag())
    w.cur = makePiece(type)
    w.holdUsed = false
    w.gravT = 0
    w.lockT = 0
    w.lockResets = 0
    if (collides(w.grid, w.cur.cells, w.cur.x, w.cur.y)) {
      finish()
    }
  }, [finish])

  const doHold = useCallback((w) => {
    if (w.holdUsed) return
    const curType = w.cur.type
    if (w.hold) {
      const h = w.hold
      w.hold = curType
      w.cur = makePiece(h)
    } else {
      w.hold = curType
      spawnNext(w)
    }
    w.holdUsed = true
    w.gravT = 0
    w.lockT = 0
    w.lockResets = 0
    if (soundRef.current) sfx.ui()
  }, [spawnNext])

  const hardDrop = useCallback((w) => {
    let rows = 0
    while (!collides(w.grid, w.cur.cells, w.cur.x, w.cur.y + 1)) {
      w.cur.y++
      rows++
    }
    w.score += rows * 2
    w.shake = Math.min(0.6, rows * 0.06)
    if (rows > 0 && soundRef.current) sfx.whoosh()
    lockPiece(w)
  }, [lockPiece])

  // ---------- 主循环 ----------
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = CW * dpr
    canvas.height = CH * dpr
    let raf = 0
    let last = performance.now()

    const step = (now) => {
      raf = requestAnimationFrame(step)
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      const w = worldRef.current

      // ===== 更新 =====
      if (w && statusRef.current === 'playing') {
        w.t += dt
        w.shake = Math.max(0, w.shake - dt * 3)
        if (w.banner) {
          w.banner.t += dt
          if (w.banner.t > 1.3) w.banner = null
        }

        if (w.clearAnim) {
          w.clearAnim.t += dt
          if (w.clearAnim.t >= 0.26) {
            // 新网格在锁定时已由 tryClearRows 算好，这里只收动画
            w.grid = w.clearAnim.grid
            w.clearAnim = null
            spawnNext(w)
          }
        } else {
          const p = w.cur
          // —— 横移（DAS：150ms 延迟 + 40ms 连发）——
          const inp = inputRef.current
          const dir = inp.right ? 1 : inp.left ? -1 : 0
          if (dir !== 0) {
            if (inp.dasDir !== dir) {
              inp.dasDir = dir
              inp.dasT = 0
              if (tryMove(w, dir, 0)) {
                w.lockT = 0
                if (w.lockResets < MAX_LOCK_RESETS) { w.lockResets++ }
              }
            } else {
              inp.dasT += dt
              if (inp.dasT > 0.15) {
                // 连发阶段
                if (!w.dasRepeat) w.dasRepeat = 0
                w.dasRepeat += dt
                while (w.dasRepeat > 0.04) {
                  w.dasRepeat -= 0.04
                  if (tryMove(w, dir, 0)) {
                    w.lockT = 0
                    if (w.lockResets < MAX_LOCK_RESETS) w.lockResets++
                  }
                }
              }
            }
          } else {
            inp.dasDir = 0
            w.dasRepeat = 0
          }

          // —— 重力 ——
          const grounded = collides(w.grid, p.cells, p.x, p.y + 1)
          const g = gravitySec(w.level) / (inp.soft ? 20 : 1)
          if (grounded) {
            w.lockT += dt
            if (w.lockT >= LOCK_DELAY) {
              lockPiece(w)
            }
          } else {
            w.lockT = 0
            w.gravT += dt
            while (w.gravT >= g) {
              w.gravT -= g
              if (!tryMove(w, 0, 1)) break
              if (inp.soft) w.score += 1
            }
          }
        }
      }

      // ===== 绘制 =====
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (w && w.shake > 0) ctx.translate(rand(-6, 6) * w.shake, rand(-4, 4) * w.shake)

      // —— 背景：夜色 + 星空 + 城市剪影 ——
      const sky = ctx.createLinearGradient(0, 0, 0, CH)
      sky.addColorStop(0, '#0a1124')
      sky.addColorStop(1, '#141b36')
      ctx.fillStyle = sky
      ctx.fillRect(-10, -10, CW + 20, CH + 20)
      const t = w ? w.t : performance.now() / 1000
      for (const s of STARS) {
        ctx.globalAlpha = 0.3 + 0.4 * Math.abs(Math.sin(t * 1.2 + s.ph))
        ctx.fillStyle = '#dbeafe'
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
      for (let n = 0; n < CW / 44 + 1; n++) {
        const bx = n * 44 - 8
        const bh = skylineH(n * 7 + 3)
        ctx.fillStyle = 'rgba(15, 21, 40, 0.9)'
        ctx.fillRect(bx, CH - bh, 40, bh)
        if ((n * 11) % 3 === 0) {
          ctx.fillStyle = 'rgba(251, 191, 36, 0.2)'
          ctx.fillRect(bx + 7, CH - bh + 8, 5, 7)
          ctx.fillRect(bx + 23, CH - bh + 22, 5, 7)
        }
      }

      const font = (size, weight = 600) => `${weight} ${size}px 'JetBrains Mono', ui-monospace, monospace`

      // —— 侧面板（HOLD / 统计 / NEXT）——
      ctx.textAlign = 'left'
      const panelLabel = (text, x, y) => {
        ctx.fillStyle = 'rgba(148, 163, 184, 0.75)'
        ctx.font = font(10)
        ctx.fillText(text, x, y)
      }
      const drawMini = (type, x, y, cell, alpha = 1) => {
        if (!type) return
        const def = PIECES[type]
        const minX = Math.min(...def.cells.map((c) => c[0]))
        const maxX = Math.max(...def.cells.map((c) => c[0]))
        const off = (4 - (maxX - minX + 1)) * cell / 2
        ctx.globalAlpha = alpha
        for (const [cx, cy] of def.cells) {
          drawBlock(x + (cx - minX) * cell + off, y + cy * cell, cell, def.color, false)
        }
        ctx.globalAlpha = 1
      }

      panelLabel('HOLD', 16, 34)
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)'
      ctx.lineWidth = 1
      ctx.strokeRect(14.5, 42.5, 84, 60)
      if (w) drawMini(w.hold, 24, 51, 16, w.holdUsed ? 0.35 : 1)

      if (w) {
        panelLabel('SCORE', 16, 140)
        ctx.fillStyle = '#e2e8f0'
        ctx.font = font(17, 700)
        ctx.fillText(String(w.score), 16, 162)
        panelLabel('BEST', 16, 190)
        ctx.fillStyle = 'rgba(251, 191, 36, 0.85)'
        ctx.font = font(13, 700)
        ctx.fillText(String(Math.max(best, w.score)), 16, 210)
        panelLabel('LEVEL', 16, 240)
        ctx.fillStyle = '#4ade80'
        ctx.font = font(15, 700)
        ctx.fillText(String(w.level), 16, 260)
        panelLabel('LINES', 16, 290)
        ctx.fillStyle = '#93c5fd'
        ctx.font = font(15, 700)
        ctx.fillText(String(w.lines), 16, 310)
        if (w.combo > 1) {
          ctx.fillStyle = '#e879f9'
          ctx.font = font(12, 700)
          ctx.fillText(`COMBO ×${w.combo}`, 16, 340)
        }
      }

      panelLabel('NEXT', 386, 34)
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)'
      ctx.strokeRect(384.5, 42.5, 72, 190)
      if (w) {
        for (let i = 0; i < 3 && i < w.queue.length; i++) {
          drawMini(w.queue[i], 392, 56 + i * 62, i === 0 ? 16 : 14, i === 0 ? 1 : 0.7)
        }
      }

      // —— 井（CRT 玻璃罩）——
      ctx.fillStyle = 'rgba(6, 10, 20, 0.88)'
      ctx.fillRect(BX, BY, COLS * CELL, ROWS * CELL)
      ctx.fillStyle = 'rgba(56, 189, 248, 0.03)'
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          if ((x + y) % 2 === 0) ctx.fillRect(BX + x * CELL, BY + y * CELL, CELL, CELL)
        }
      }
      // 井口霓虹描边（呼吸）
      const pulse = 0.55 + 0.3 * Math.sin(t * 2)
      ctx.strokeStyle = `rgba(56, 189, 248, ${pulse})`
      ctx.lineWidth = 2
      ctx.shadowColor = 'rgba(56, 189, 248, 0.7)'
      ctx.shadowBlur = 12
      ctx.strokeRect(BX - 1, BY - 1, COLS * CELL + 2, ROWS * CELL + 2)
      ctx.shadowBlur = 0

      if (w) {
        // 已锁定的块
        for (let y = 0; y < ROWS; y++) {
          for (let x = 0; x < COLS; x++) {
            const c = w.grid[y][x]
            if (c) {
              const clearing = w.clearAnim?.rows.includes(y)
              if (clearing) {
                // 消行闪白
                const k = w.clearAnim.t / 0.26
                drawBlock(BX + x * CELL, BY + y * CELL, CELL, '#ffffff', false, 0.4 + 0.6 * Math.abs(Math.sin(k * Math.PI * 3)))
              } else {
                drawBlock(BX + x * CELL, BY + y * CELL, CELL, c)
              }
            }
          }
        }
        // 幽灵 + 当前块
        if (!w.clearAnim && (statusRef.current === 'playing' || statusRef.current === 'paused')) {
          const gy = ghostY(w)
          for (const [cx, cy] of w.cur.cells) {
            const y = gy + cy
            if (y >= 0) {
              ctx.strokeStyle = w.cur.color
              ctx.globalAlpha = 0.35
              ctx.lineWidth = 1.5
              ctx.strokeRect(BX + (w.cur.x + cx) * CELL + 2.5, BY + y * CELL + 2.5, CELL - 5, CELL - 5)
              ctx.globalAlpha = 1
            }
          }
          for (const [cx, cy] of w.cur.cells) {
            const y = w.cur.y + cy
            if (y >= 0) drawBlock(BX + (w.cur.x + cx) * CELL, BY + y * CELL, CELL, w.cur.color)
          }
        }
      }

      // —— 扫描线（CRT 质感，只盖井口）——
      ctx.fillStyle = 'rgba(2, 6, 14, 0.16)'
      for (let sy = BY; sy < BY + ROWS * CELL; sy += 3) {
        ctx.fillRect(BX, sy, COLS * CELL, 1)
      }

      // —— 横幅 ——
      if (w && w.banner) {
        const b = w.banner
        const a = b.t < 0.12 ? b.t / 0.12 : b.t > 0.9 ? Math.max(0, 1 - (b.t - 0.9) / 0.4) : 1
        ctx.save()
        ctx.globalAlpha = a
        ctx.translate(BX + (COLS * CELL) / 2, BY + ROWS * CELL * 0.35)
        ctx.scale(1 + Math.max(0, 0.2 - b.t), 1 + Math.max(0, 0.2 - b.t))
        ctx.textAlign = 'center'
        ctx.font = font(26, 800)
        ctx.lineWidth = 6
        ctx.strokeStyle = 'rgba(8, 10, 16, 0.8)'
        ctx.strokeText(b.text, 0, 0)
        ctx.fillStyle = b.color
        ctx.fillText(b.text, 0, 0)
        ctx.restore()
      }
    }

    // 单个发光方块
    const rr = (x, y, w2, h2, r) => {
      if (ctx.roundRect) ctx.roundRect(x, y, w2, h2, r)
      else ctx.rect(x, y, w2, h2)
    }
    const drawBlock = (x, y, size, color, _glow = true, alpha = 1) => {
      ctx.globalAlpha = alpha
      ctx.fillStyle = color
      ctx.beginPath()
      rr(x + 1, y + 1, size - 2, size - 2, 4)
      ctx.fill()
      // 顶部高光
      ctx.fillStyle = 'rgba(255, 255, 255, 0.22)'
      ctx.beginPath()
      rr(x + 3, y + 3, size - 6, (size - 6) * 0.42, 3)
      ctx.fill()
      // 描边
      ctx.strokeStyle = 'rgba(8, 10, 16, 0.45)'
      ctx.lineWidth = 1
      ctx.beginPath()
      rr(x + 1, y + 1, size - 2, size - 2, 4)
      ctx.stroke()
      ctx.globalAlpha = 1
    }

    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [best, finish, hardDrop, lockPiece, spawnNext])

  // ---------- 操作入口（键盘/触屏共用） ----------
  const act = useCallback((name) => {
    const w = worldRef.current
    if (!w || statusRef.current !== 'playing') return
    if (name === 'left' || name === 'right') {
      // 只置方向，第一格与连发统一由主循环 DAS 分支处理，避免双步进
    } else if (name === 'rotate') {
      if (tryRotate(w, 1)) {
        w.lockT = 0
        if (w.lockResets < MAX_LOCK_RESETS) w.lockResets++
        if (soundRef.current) sfx.spinTick()
      }
    } else if (name === 'rotateCCW') {
      if (tryRotate(w, -1)) {
        w.lockT = 0
        if (w.lockResets < MAX_LOCK_RESETS) w.lockResets++
        if (soundRef.current) sfx.spinTick()
      }
    } else if (name === 'hard') {
      hardDrop(w)
    } else if (name === 'hold') {
      doHold(w)
    }
  }, [doHold, hardDrop])

  // ---------- 键盘 ----------
  useEffect(() => {
    const inp = inputRef.current
    const down = (e) => {
      const codes = ['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'Space', 'KeyA', 'KeyD', 'KeyS', 'KeyW', 'KeyZ', 'KeyX', 'KeyC', 'ShiftLeft', 'KeyP', 'Enter']
      if (!codes.includes(e.code)) return
      e.preventDefault()
      if (e.repeat) return
      if (e.code === 'KeyP' && (statusRef.current === 'playing' || statusRef.current === 'paused')) {
        setStatus((s) => (s === 'playing' ? 'paused' : 'playing'))
        sfx.ui()
        return
      }
      if (e.code === 'Enter' && (statusRef.current === 'idle' || statusRef.current === 'over')) {
        startGame()
        return
      }
      if (statusRef.current !== 'playing') return
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') { inp.left = true; act('left') }
      else if (e.code === 'ArrowRight' || e.code === 'KeyD') { inp.right = true; act('right') }
      else if (e.code === 'ArrowDown' || e.code === 'KeyS') inp.soft = true
      else if (e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'KeyX') act('rotate')
      else if (e.code === 'KeyZ') act('rotateCCW')
      else if (e.code === 'Space') act('hard')
      else if (e.code === 'KeyC' || e.code === 'ShiftLeft') act('hold')
    }
    const up = (e) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') inp.left = false
      else if (e.code === 'ArrowRight' || e.code === 'KeyD') inp.right = false
      else if (e.code === 'ArrowDown' || e.code === 'KeyS') inp.soft = false
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [act])

  const startGame = useCallback(() => {
    resetWorld()
    inputRef.current = { left: false, right: false, soft: false, dasT: 0, dasDir: 0 }
    setStatus('playing')
    setResult(null)
    if (soundRef.current) sfx.roundBell()
  }, [resetWorld])

  // ---------- 触屏 ----------
  const bindTouch = (name, isHold = false) => ({
    onPointerDown: (e) => {
      e.preventDefault()
      if (isHold) inputRef.current[name] = true
      act(name)
    },
    onPointerUp: () => {
      if (isHold) inputRef.current[name] = false
    },
    onPointerLeave: () => {
      if (isHold) inputRef.current[name] = false
    },
  })

  return (
    <div className="gm-wrap">
      <header className="gm-header gm-header-row">
        <div>
          <p className="gm-kicker" style={{ color: 'rgba(56, 189, 248, 0.85)' }}>NEON TETRIS</p>
          <h1 className="gm-title gm-title-sm">霓虹方块</h1>
        </div>
        <Link to="/games" className="gm-back gm-back-top">← 返回街机</Link>
      </header>

      <section className="gm-panel tt-panel">
        <div className="tt-toolbar">
          <div className="tt-keys">
            <span>◀ ▶ 移动</span>
            <span>▼ 软降</span>
            <span>↑/X 旋</span>
            <span>Z 反旋</span>
            <span>空格 落</span>
            <span>C 暂存</span>
            <span>P 暂停</span>
          </div>
          <div className="tt-toolbar-right">
            <span className="wf-stat">最高<b>{best} 分</b></span>
            <button type="button" className="ms-chip" onClick={() => setSoundOn((v) => !v)}>{soundOn ? '🔊' : '🔇'}</button>
            <button type="button" className="ms-chip" onClick={startGame}>{status === 'idle' ? '开始' : status === 'over' ? '再来一局' : '重开'}</button>
          </div>
        </div>

        <div className="gk-shell tt-shell">
          <canvas ref={canvasRef} className="tt-canvas" />
          {status === 'idle' && (
            <div className="gk-overlay">
              <p className="gk-overlay-title">霓虹方块 · 深夜机台</p>
              <p className="gk-overlay-sub">
                标准规则：7-bag 发牌、踢墙旋转、幽灵落点、Hold 暂存、连击加分。<br />
                每消 10 行提速一级，四连消有惊喜。键位见上方；手机用下方触控键。
              </p>
              <div className="gk-overlay-actions">
                <button type="button" className="gm-btn-start" onClick={startGame}>投币开机</button>
              </div>
            </div>
          )}
          {status === 'paused' && (
            <div className="gk-overlay">
              <p className="gk-overlay-title">暂停中</p>
              <div className="gk-overlay-actions">
                <button type="button" className="gm-btn-start" onClick={() => setStatus('playing')}>继续 (P)</button>
              </div>
            </div>
          )}
          {status === 'over' && result && (
            <div className="gk-overlay gk-overlay-lite">
              <p className="gk-overlay-title">
                {result.isBest ? '新纪录！' : 'GAME OVER'}
                <span className="sn-record-tag" style={{ marginLeft: 10 }}>{result.score} 分</span>
              </p>
              <p className="gk-overlay-sub">
                消行 {result.lines} · 等级 {result.level}
                {result.isBest ? ' —— 机器都为你亮灯。' : ` · 距最高 ${best} 分还差一点。`}
              </p>
              <div className="gk-overlay-actions">
                <button type="button" className="gm-btn-start" onClick={startGame}>再来一局</button>
              </div>
            </div>
          )}
          <ConfettiLayer pieces={confetti} />
        </div>

        {/* 触屏按键 */}
        <div className="dl-touch tt-touch" aria-hidden="true">
          <div className="dl-touch-group">
            <button type="button" className="dl-key" {...bindTouch('left', true)}>◀</button>
            <button type="button" className="dl-key" {...bindTouch('right', true)}>▶</button>
            <button type="button" className="dl-key" {...bindTouch('soft', true)}>▼</button>
          </div>
          <div className="dl-touch-group">
            <button type="button" className="dl-key" {...bindTouch('hold')}>存</button>
            <button type="button" className="dl-key atk1" {...bindTouch('rotate')}>旋</button>
            <button type="button" className="dl-key atk2" {...bindTouch('hard')}>落</button>
          </div>
        </div>

        <p className="gk-tip">连击不断加成 50×等级/次；四连消 TETRIS ×800 分。落到底有 0.5 秒锁定延迟，来得及微调。</p>
      </section>
    </div>
  )
}
