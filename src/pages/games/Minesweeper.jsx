import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { sfx } from '../../utils/sound'
import { useConfetti, ConfettiLayer } from '../../components/Confetti'
import './games.css'
import './minesweeper.css'

const DIFFS = [
  { id: 'beginner', name: '初级', cols: 9, rows: 9, mines: 10, cell: 44 },
  { id: 'intermediate', name: '中级', cols: 16, rows: 16, mines: 40, cell: 34 },
  { id: 'expert', name: '高级', cols: 30, rows: 16, mines: 99, cell: 30 },
]

const NUMBER_COLORS = [null, 'n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8']

const bestKey = (id) => `ms-best-${id}`
const readBest = (id) => {
  try {
    const v = Number(localStorage.getItem(bestKey(id)))
    return Number.isFinite(v) && v > 0 ? v : null
  } catch {
    return null
  }
}

function blankBoard({ cols, rows }) {
  return Array.from({ length: cols * rows }, () => ({
    mine: false,
    adj: 0,
    revealed: false,
    flagged: false,
    boom: false,
    wrong: false,
    delay: 0,
  }))
}

function neighborsOf(idx, cols, rows) {
  const x = idx % cols
  const y = Math.floor(idx / cols)
  const out = []
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue
      const nx = x + dx
      const ny = y + dy
      if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) out.push(ny * cols + nx)
    }
  }
  return out
}

// 首击安全：以点击点为中心的 3×3 区域都不放雷
function placeMines(board, { cols, rows, mines }, safeIdx) {
  const forbidden = new Set([safeIdx, ...neighborsOf(safeIdx, cols, rows)])
  const pool = []
  for (let i = 0; i < board.length; i++) {
    if (!forbidden.has(i)) pool.push(i)
  }
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  const mineIdx = pool.slice(0, Math.min(mines, pool.length))
  for (const i of mineIdx) board[i].mine = true
  for (let i = 0; i < board.length; i++) {
    board[i].adj = neighborsOf(i, cols, rows).filter((n) => board[n].mine).length
  }
  return board
}

// 泛洪展开：BFS，delay 用于波浪式入场动画
function floodReveal(board, { cols, rows }, startIdx) {
  const queue = [{ idx: startIdx, depth: 0 }]
  const seen = new Set([startIdx])
  let count = 0
  while (queue.length) {
    const { idx, depth } = queue.shift()
    const cell = board[idx]
    if (cell.revealed || cell.flagged) continue
    cell.revealed = true
    cell.delay = depth * 16
    count++
    if (cell.adj === 0 && !cell.mine) {
      for (const n of neighborsOf(idx, cols, rows)) {
        if (!seen.has(n) && !board[n].revealed && !board[n].flagged) {
          seen.add(n)
          queue.push({ idx: n, depth: depth + 1 })
        }
      }
    }
  }
  return count
}

function FlagIcon() {
  return (
    <svg viewBox="0 0 24 24" width="62%" height="62%" aria-hidden="true">
      <path d="M7 3.5v17" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round" />
      <path d="M7 4.5h9.5l-2.6 3.4 2.6 3.4H7z" fill="#f59e0b" />
      <circle cx="7" cy="3.6" r="1.4" fill="#fbbf24" />
    </svg>
  )
}

function MineIcon({ boom }) {
  return (
    <svg viewBox="0 0 24 24" width="68%" height="68%" aria-hidden="true" className={boom ? 'ms-mine-boom' : ''}>
      {[
        [12, 2.6, 12, 21.4], [2.6, 12, 21.4, 12],
        [5.2, 5.2, 18.8, 18.8], [18.8, 5.2, 5.2, 18.8],
      ].map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      ))}
      <circle cx="12" cy="12" r="6.2" fill="currentColor" />
      <circle cx="9.8" cy="9.8" r="1.7" fill="#fff" opacity="0.85" />
    </svg>
  )
}

export default function Minesweeper() {
  const [diff, setDiff] = useState(DIFFS[0])
  const [board, setBoard] = useState(() => blankBoard(DIFFS[0]))
  const [status, setStatus] = useState('ready') // ready | playing | won | lost
  const [flags, setFlags] = useState(0)
  const [time, setTime] = useState(0)
  const [flagMode, setFlagMode] = useState(false)
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem('ms-sound') !== 'off')
  const [best, setBest] = useState(() => readBest(DIFFS[0].id))
  const [shake, setShake] = useState(false)
  const { pieces: confetti, burst } = useConfetti({
    colors: ['#f59e0b', '#34d399', '#60a5fa', '#f472b6', '#fbbf24', '#a78bfa'],
  })

  const minesPlaced = useRef(false)
  const soundRef = useRef(soundOn)
  soundRef.current = soundOn

  const play = useCallback((fn, ...args) => {
    if (soundRef.current) fn(...args)
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem('ms-sound', soundOn ? 'on' : 'off')
    } catch { /* 忽略隐私模式 */ }
  }, [soundOn])

  // 计时器
  useEffect(() => {
    if (status !== 'playing') return undefined
    const t = setInterval(() => setTime((v) => Math.min(v + 1, 999)), 1000)
    return () => clearInterval(t)
  }, [status])

  const reset = useCallback((d = diff) => {
    setDiff(d)
    setBoard(blankBoard(d))
    setStatus('ready')
    setFlags(0)
    setTime(0)
    setShake(false)
    minesPlaced.current = false
  }, [diff])

  const finished = status === 'won' || status === 'lost'

  const checkWin = useCallback((next, revealedCount) => {
    const hiddenSafe = next.length - diff.mines
    if (revealedCount > 0 && next.filter((c) => c.revealed).length >= hiddenSafe) {
      setStatus('won')
      play(sfx.win)
      burst()
      const prevBest = readBest(diff.id)
      if (prevBest === null || time < prevBest) {
        try {
          localStorage.setItem(bestKey(diff.id), String(time))
        } catch { /* 忽略 */ }
        setBest(time)
      }
      return true
    }
    return false
  }, [diff, time, play, burst])

  const lose = useCallback((boomIdx) => {
    setBoard((prev) => {
      const next = prev.map((c) => ({ ...c }))
      for (const c of next) {
        if (c.mine) c.revealed = true
        if (!c.mine && c.flagged) c.wrong = true
      }
      next[boomIdx].boom = true
      return next
    })
    setStatus('lost')
    setShake(true)
    setTimeout(() => setShake(false), 600)
    play(sfx.explode)
  }, [play])

  const revealCells = useCallback((startIdx) => {
    const next = board.map((c) => ({ ...c }))
    const count = floodReveal(next, diff, startIdx)
    setBoard(next)
    play(sfx.reveal, next[startIdx].adj)
    checkWin(next, count)
  }, [board, diff, checkWin, play])

  const chord = useCallback((idx) => {
    const cell = board[idx]
    if (!cell.revealed || cell.adj === 0) return
    const nbs = neighborsOf(idx, diff.cols, diff.rows)
    const flagged = nbs.filter((n) => board[n].flagged).length
    if (flagged !== cell.adj) return
    const targets = nbs.filter((n) => !board[n].flagged && !board[n].revealed)
    if (!targets.length) return
    const boomAt = targets.find((n) => board[n].mine)
    if (boomAt !== undefined) {
      lose(boomAt)
      return
    }
    const next = board.map((c) => ({ ...c }))
    let count = 0
    for (const t of targets) count += floodReveal(next, diff, t)
    setBoard(next)
    play(sfx.reveal, 2)
    checkWin(next, count)
  }, [board, diff, lose, checkWin, play])

  const toggleFlag = useCallback((idx) => {
    if (finished) return
    const cell = board[idx]
    if (cell.revealed) return
    const next = board.map((c) => ({ ...c }))
    next[idx].flagged = !next[idx].flagged
    setBoard(next)
    setFlags(next.filter((c) => c.flagged).length)
    play(next[idx].flagged ? sfx.flag : sfx.unflag)
  }, [board, finished, play])

  const handleCell = useCallback((idx) => {
    if (finished) return
    const cell = board[idx]
    if (flagMode) {
      if (!cell.revealed) toggleFlag(idx)
      return
    }
    if (cell.flagged) return
    if (cell.revealed) {
      chord(idx)
      return
    }
    if (!minesPlaced.current) {
      // 首击：布置雷区（首击 3×3 必安全），再展开
      minesPlaced.current = true
      setStatus('playing')
      const seeded = placeMines(board.map((c) => ({ ...c })), diff, idx)
      const count = floodReveal(seeded, diff, idx)
      setBoard(seeded)
      play(sfx.reveal, 0)
      checkWin(seeded, count)
      return
    }
    if (cell.mine) {
      lose(idx)
      return
    }
    revealCells(idx)
  }, [finished, board, flagMode, diff, chord, lose, revealCells, toggleFlag, play, checkWin])

  const minesLeft = diff.mines - flags
  const face = status === 'lost' ? '😵' : status === 'won' ? '😎' : '🙂'
  const hint = useMemo(() => {
    if (status === 'won') return '排雷成功！雷区已安全。'
    if (status === 'lost') return '踩到雷了，再开一局？'
    return '左键翻开 · 右键插旗 · 点已翻开的数字快速展开'
  }, [status])

  return (
    <div className="gm-wrap">
      <header className="gm-header gm-header-row">
        <div>
          <p className="gm-kicker" style={{ color: 'rgba(245,158,11,0.8)' }}>MINESWEEPER</p>
          <h1 className="gm-title gm-title-sm">扫雷</h1>
        </div>
        <Link to="/games" className="gm-back gm-back-top">← 返回街机</Link>
      </header>

      <section className="gm-panel">
        <div className="ms-toolbar">
          <div className="gm-seg">
            {DIFFS.map((d) => (
              <button
                key={d.id}
                type="button"
                className={`gm-seg-btn ${d.id === diff.id ? 'active' : ''}`}
                onClick={() => { play(sfx.ui); reset(d) }}
              >
                {d.name}
                <small>{d.cols}×{d.rows}</small>
              </button>
            ))}
          </div>
          <div className="ms-toolbar-right">
            <button
              type="button"
              className={`ms-chip ${flagMode ? 'active' : ''}`}
              onClick={() => { play(sfx.ui); setFlagMode((v) => !v) }}
              title="开启后点击格子 = 插旗（触屏友好）"
            >
              旗 {flagMode ? 'ON' : 'OFF'}
            </button>
            <button
              type="button"
              className="ms-chip"
              onClick={() => setSoundOn((v) => !v)}
              title="音效开关"
            >
              {soundOn ? '🔊' : '🔇'}
            </button>
            <button type="button" className="gm-btn-start" onClick={() => { play(sfx.ui); reset() }}>
              开始新局
            </button>
          </div>
        </div>

        <div className="ms-statusbar">
          <span className="ms-led" title="剩余雷数">{minesLeft < 0 ? 0 : String(minesLeft).padStart(3, '0')}</span>
          <button type="button" className="ms-face" onClick={() => { play(sfx.ui); reset() }} title="重新开始">
            {face}
          </button>
          <span className="ms-led" title="用时">{String(time).padStart(3, '0')}</span>
        </div>

        <div className={`ms-board-shell ${shake ? 'shake' : ''}`}>
          <div className="ms-scroll">
            <div
              className="ms-board"
              style={{
                '--ms-cols': diff.cols,
                '--ms-cell': `min(${diff.cell}px, calc((100vw - 64px) / ${diff.cols}))`,
              }}
            >
              {board.map((cell, idx) => (
                <button
                  key={idx}
                  type="button"
                  className={[
                    'ms-cell',
                    cell.revealed ? 'revealed' : 'hidden',
                    cell.boom ? 'boom' : '',
                    cell.wrong ? 'wrong' : '',
                    !cell.revealed && cell.flagged ? 'flagged' : '',
                  ].join(' ')}
                  style={cell.revealed && cell.delay ? { animationDelay: `${cell.delay}ms` } : undefined}
                  onClick={() => handleCell(idx)}
                  onContextMenu={(e) => { e.preventDefault(); toggleFlag(idx) }}
                  aria-label={`第 ${Math.floor(idx / diff.cols) + 1} 行第 ${(idx % diff.cols) + 1} 列`}
                >
                  {cell.revealed && !cell.mine && cell.adj > 0 && (
                    <span className={`ms-num ${NUMBER_COLORS[cell.adj]}`}>{cell.adj}</span>
                  )}
                  {cell.revealed && cell.mine && <MineIcon boom={cell.boom} />}
                  {!cell.revealed && cell.flagged && <FlagIcon />}
                  {cell.wrong && <span className="ms-cross">✕</span>}
                </button>
              ))}
            </div>
          </div>
          <ConfettiLayer pieces={confetti} />
        </div>

        <div className="ms-infobar">
          <span className={`ms-hint ${status}`}>{hint}</span>
          <span className="ms-best">
            {diff.name}最佳战绩
            <b>{best === null ? ' —' : ` ${best}s`}</b>
          </span>
        </div>
      </section>
    </div>
  )
}
