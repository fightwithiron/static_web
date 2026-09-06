import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { sfx } from '../../utils/sound'
import { useConfetti, ConfettiLayer } from '../../components/Confetti'
import { SIZE, EMPTY, BLACK, WHITE, findWinLine } from '../../utils/gomoku-engine'
import './games.css'
import './gomoku.css'
const DIFFS = [
  { id: 'easy', name: '简单', desc: '浅层思考，偶尔放水' },
  { id: 'hard', name: '困难', desc: '深度搜索，步步紧逼' },
]

// 撒花配色必须是稳定引用：内联数组会让 burst 每次渲染重建，
// 连带 worker 的 useEffect 反复 terminate/重建，丢掉在途的 AI 回包
const GK_CONFETTI_COLORS = ['#fbbf24', '#4ade80', '#60a5fa', '#f472b6', '#fde68a']

const readRecord = (diff) => {
  try {
    const r = JSON.parse(localStorage.getItem(`gomoku-record-${diff}`) ?? 'null')
    return r ?? { w: 0, l: 0, d: 0 }
  } catch {
    return { w: 0, l: 0, d: 0 }
  }
}

const CSS_SIZE = 560
const PAD_RATIO = 0.06

export default function Gomoku() {
  const canvasRef = useRef(null)
  const shellRef = useRef(null)
  const workerRef = useRef(null)
  const boardRef = useRef(new Int8Array(SIZE * SIZE))
  const historyRef = useRef([])
  const hoverRef = useRef(null) // 鼠标悬停的格子
  const hintRef = useRef(null) // 提示点
  const winLineRef = useRef(null)
  const drawRef = useRef(() => {})

  const [difficulty, setDifficulty] = useState(() => localStorage.getItem('gomoku-diff') ?? 'hard')
  const [playerColor, setPlayerColor] = useState(BLACK)
  const [status, setStatus] = useState('idle') // idle | playerTurn | aiThinking | over
  const [winner, setWinner] = useState(null) // 'player' | 'ai' | 'draw'
  const [moveCount, setMoveCount] = useState(0)
  const [lastMove, setLastMove] = useState(null)
  const [aiDepth, setAiDepth] = useState(null)
  const [advantage, setAdvantage] = useState(0) // -1(AI 优) ~ 1(玩家优)
  const [records, setRecords] = useState({ easy: readRecord('easy'), hard: readRecord('hard') })
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem('gomoku-sound') !== 'off')
  const { pieces: confetti, burst } = useConfetti({ colors: GK_CONFETTI_COLORS })

  const soundRef = useRef(soundOn)
  soundRef.current = soundOn
  const diffRef = useRef(difficulty)
  diffRef.current = difficulty
  const colorRef = useRef(playerColor)
  colorRef.current = playerColor
  const statusRef = useRef(status)
  statusRef.current = status

  useEffect(() => {
    try {
      localStorage.setItem('gomoku-diff', difficulty)
      localStorage.setItem('gomoku-sound', soundOn ? 'on' : 'off')
    } catch { /* 忽略 */ }
  }, [difficulty, soundOn])

  // ---------- 棋盘绘制 ----------
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    if (canvas.width !== CSS_SIZE * dpr) {
      canvas.width = CSS_SIZE * dpr
      canvas.height = CSS_SIZE * dpr
    }
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const pad = CSS_SIZE * PAD_RATIO
    const cell = (CSS_SIZE - pad * 2) / (SIZE - 1)
    const px = (i) => pad + i * cell

    // 底色
    const bg = ctx.createRadialGradient(CSS_SIZE / 2, CSS_SIZE / 2, 40, CSS_SIZE / 2, CSS_SIZE / 2, CSS_SIZE * 0.75)
    bg.addColorStop(0, '#141824')
    bg.addColorStop(1, '#0b0d14')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, CSS_SIZE, CSS_SIZE)

    // 网格
    ctx.strokeStyle = 'rgba(200, 210, 235, 0.16)'
    ctx.lineWidth = 1
    for (let i = 0; i < SIZE; i++) {
      ctx.beginPath()
      ctx.moveTo(px(0), px(i))
      ctx.lineTo(px(SIZE - 1), px(i))
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(px(i), px(0))
      ctx.lineTo(px(i), px(SIZE - 1))
      ctx.stroke()
    }
    // 外框略亮
    ctx.strokeStyle = 'rgba(200, 210, 235, 0.32)'
    ctx.lineWidth = 1.5
    ctx.strokeRect(px(0), px(0), cell * (SIZE - 1), cell * (SIZE - 1))

    // 星位
    ctx.fillStyle = 'rgba(200, 210, 235, 0.4)'
    for (const [sx, sy] of [[3, 3], [3, 11], [7, 7], [11, 3], [11, 11]]) {
      ctx.beginPath()
      ctx.arc(px(sx), px(sy), 3.2, 0, Math.PI * 2)
      ctx.fill()
    }

    // 棋子
    const board = boardRef.current
    const radius = cell * 0.44
    for (let idx = 0; idx < board.length; idx++) {
      const v = board[idx]
      if (!v) continue
      const x = px(idx % SIZE)
      const y = px((idx / SIZE) | 0)
      const grad = ctx.createRadialGradient(x - radius * 0.35, y - radius * 0.4, radius * 0.15, x, y, radius)
      if (v === BLACK) {
        grad.addColorStop(0, '#4a4f5e')
        grad.addColorStop(1, '#08090d')
      } else {
        grad.addColorStop(0, '#ffffff')
        grad.addColorStop(1, '#b6bcc9')
      }
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(x, y, radius, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = v === BLACK ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.25)'
      ctx.lineWidth = 1
      ctx.stroke()
      // 最后一手标记
      if (idx === lastMove) {
        ctx.fillStyle = v === BLACK ? '#fbbf24' : '#d97706'
        ctx.beginPath()
        ctx.arc(x, y, radius * 0.28, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // 提示点
    if (hintRef.current !== null && statusRef.current === 'playerTurn') {
      const idx = hintRef.current
      const x = px(idx % SIZE)
      const y = px((idx / SIZE) | 0)
      ctx.strokeStyle = 'rgba(74, 222, 128, 0.9)'
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.arc(x, y, radius * 0.75, 0, Math.PI * 2)
      ctx.stroke()
      ctx.strokeStyle = 'rgba(74, 222, 128, 0.35)'
      ctx.beginPath()
      ctx.arc(x, y, radius * 1.05, 0, Math.PI * 2)
      ctx.stroke()
    }

    // 悬停幽灵子
    if (hoverRef.current !== null && statusRef.current === 'playerTurn') {
      const idx = hoverRef.current
      if (board[idx] === EMPTY) {
        const x = px(idx % SIZE)
        const y = px((idx / SIZE) | 0)
        ctx.globalAlpha = 0.4
        ctx.fillStyle = colorRef.current === BLACK ? '#14161c' : '#f4f6fb'
        ctx.beginPath()
        ctx.arc(x, y, radius, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
      }
    }

    // 胜利连线
    if (winLineRef.current) {
      const line = winLineRef.current
      const [sx, sy] = line[0]
      const [ex, ey] = line[line.length - 1]
      ctx.save()
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.9)'
      ctx.shadowColor = 'rgba(251, 191, 36, 0.9)'
      ctx.shadowBlur = 14
      ctx.lineWidth = 4
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(px(sx), px(sy))
      ctx.lineTo(px(ex), px(ey))
      ctx.stroke()
      ctx.restore()
    }
  }, [lastMove])

  useEffect(() => {
    draw()
  }, [draw, status])
  drawRef.current = draw

  // ---------- 尺寸自适应 ----------
  useEffect(() => {
    const onResize = () => draw()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [draw])

  // ---------- 结束结算 ----------
  const finish = useCallback((who) => {
    setStatus('over')
    setWinner(who)
    const diff = diffRef.current
    setRecords((prev) => {
      const next = {
        ...prev,
        [diff]: {
          ...prev[diff],
          w: prev[diff].w + (who === 'player' ? 1 : 0),
          l: prev[diff].l + (who === 'ai' ? 1 : 0),
          d: prev[diff].d + (who === 'draw' ? 1 : 0),
        },
      }
      try { localStorage.setItem(`gomoku-record-${diff}`, JSON.stringify(next[diff])) } catch { /* 忽略 */ }
      return next
    })
    if (who === 'player') {
      if (soundRef.current) sfx.win()
      burst()
    } else if (who === 'ai') {
      if (soundRef.current) sfx.over()
    } else if (soundRef.current) {
      sfx.chime()
    }
  }, [burst])

  // ---------- AI 落子 ----------
  const applyAiMove = useCallback((data) => {
    const { move, depth, advantage } = data
    const board = boardRef.current
    const aiColor = colorRef.current === BLACK ? WHITE : BLACK
    if (board[move] !== EMPTY) return
    board[move] = aiColor
    historyRef.current.push({ idx: move, role: aiColor })
    setMoveCount(historyRef.current.length)
    setLastMove(move)
    setAiDepth(depth ?? null)
    setAdvantage(advantage != null ? -advantage : 0) // AI 视角转玩家视角
    hintRef.current = null
    if (soundRef.current) sfx.stone()

    const line = findWinLine(board, move % SIZE, (move / SIZE) | 0, aiColor)
    if (line) {
      winLineRef.current = line
      drawRef.current()
      finish('ai')
      return
    }
    if (historyRef.current.length >= SIZE * SIZE) {
      finish('draw')
      return
    }
    setStatus('playerTurn')
    drawRef.current()
  }, [finish])

  // ---------- Worker ----------
  const applyAiMoveRef = useRef(null)

  useEffect(() => {
    let worker
    try {
      worker = new Worker(new URL('../../utils/gomoku-ai.worker.js', import.meta.url), { type: 'module' })
      worker.onmessage = (e) => {
        if (statusRef.current !== 'aiThinking') return
        applyAiMoveRef.current?.(e.data)
      }
      worker.onerror = () => setStatus('playerTurn')
      workerRef.current = worker
    } catch {
      workerRef.current = null
    }
    return () => workerRef.current?.terminate()
  }, []) // 空依赖：worker 全生命周期只建一次，回调经 ref 转发

  const scheduleAi = useCallback(() => {
    setStatus('aiThinking')
    statusRef.current = 'aiThinking' // 立即同步：防 AI 极速回包赶在 React 提交前被守卫丢弃
    const aiColor = colorRef.current === BLACK ? WHITE : BLACK
    const payload = {
      board: Array.from(boardRef.current),
      role: aiColor,
      difficulty: diffRef.current,
    }
    const worker = workerRef.current
    if (worker) {
      worker.postMessage(payload)
    } else {
      // Worker 不可用时的兜底：主线程同步算
      import('../../utils/gomoku-engine').then(({ searchBestMove }) => {
        setTimeout(() => {
          if (statusRef.current === 'aiThinking') applyAiMove(searchBestMove(payload.board, payload.role, payload.difficulty))
        }, 120)
      })
    }
  }, [applyAiMove])

  // ---------- 开局 ----------
  const start = useCallback((color = colorRef.current) => {
    boardRef.current = new Int8Array(SIZE * SIZE)
    historyRef.current = []
    winLineRef.current = null
    hintRef.current = null
    hoverRef.current = null
    setLastMove(null)
    setMoveCount(0)
    setAiDepth(null)
    setAdvantage(0)
    setWinner(null)
    setPlayerColor(color)
    colorRef.current = color
    if (soundRef.current) sfx.ui()
    if (color === BLACK) {
      setStatus('playerTurn')
    } else {
      setStatus('aiThinking')
      // AI 执黑先行：直接走天元，省一次计算
      setTimeout(() => {
        if (statusRef.current !== 'aiThinking') return
        applyAiMove({ move: 7 * SIZE + 7, depth: 0, advantage: 0 })
      }, 350)
    }
    drawRef.current()
  }, [applyAiMove])

  // ---------- 玩家落子 ----------
  const tryPlace = useCallback((idx) => {
    if (statusRef.current !== 'playerTurn') return
    const board = boardRef.current
    if (board[idx] !== EMPTY) return
    const color = colorRef.current
    board[idx] = color
    historyRef.current.push({ idx, role: color })
    setMoveCount(historyRef.current.length)
    setLastMove(idx)
    hintRef.current = null
    if (soundRef.current) sfx.stone()

    const line = findWinLine(board, idx % SIZE, (idx / SIZE) | 0, color)
    if (line) {
      winLineRef.current = line
      drawRef.current()
      finish('player')
      return
    }
    if (historyRef.current.length >= SIZE * SIZE) {
      finish('draw')
      return
    }
    drawRef.current()
    scheduleAi()
  }, [finish, scheduleAi])
  applyAiMoveRef.current = applyAiMove

  // ---------- 悔棋（悔一对手） ----------
  const undoPair = useCallback(() => {
    if (statusRef.current !== 'playerTurn') return
    const history = historyRef.current
    if (history.length < 2) return
    for (let k = 0; k < 2; k++) {
      const last = history.pop()
      boardRef.current[last.idx] = EMPTY
    }
    setMoveCount(history.length)
    setLastMove(history.length ? history[history.length - 1].idx : null)
    hintRef.current = null
    setAdvantage(0)
    drawRef.current()
    sfx.ui()
  }, [])

  // ---------- 提示 ----------
  const askHint = useCallback(() => {
    if (statusRef.current !== 'playerTurn') return
    const worker = workerRef.current
    const color = colorRef.current
    if (!worker) return
    setStatus('aiThinking') // 复用思考锁
    worker.onmessage = (e) => {
      worker.onmessage = (ev) => {
        if (statusRef.current !== 'aiThinking') return
        applyAiMove(ev.data)
      }
      setStatus('playerTurn')
      hintRef.current = e.data.move
      drawRef.current()
      sfx.ui()
    }
    worker.postMessage({ board: Array.from(boardRef.current), role: color, difficulty: 'hard' })
  }, [applyAiMove])

  // ---------- 指针交互 ----------
  const hitTest = useCallback((e) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * CSS_SIZE
    const y = ((e.clientY - rect.top) / rect.height) * CSS_SIZE
    const pad = CSS_SIZE * PAD_RATIO
    const cell = (CSS_SIZE - pad * 2) / (SIZE - 1)
    const i = Math.round((x - pad) / cell)
    const j = Math.round((y - pad) / cell)
    if (i < 0 || i >= SIZE || j < 0 || j >= SIZE) return null
    const dist = Math.hypot(x - (pad + i * cell), y - (pad + j * cell))
    if (dist > cell * 0.55) return null
    return j * SIZE + i
  }, [])

  const onClick = (e) => {
    const idx = hitTest(e)
    if (idx !== null) tryPlace(idx)
  }

  const onHover = (e) => {
    const idx = hitTest(e)
    if (idx !== hoverRef.current) {
      hoverRef.current = idx
      drawRef.current()
    }
  }

  const statusText =
    status === 'idle' ? '选择执子颜色开始对局'
    : status === 'playerTurn' ? '轮到你落子'
    : status === 'aiThinking' ? 'AI 思考中…'
    : winner === 'player' ? '你赢了！五连达成'
    : winner === 'ai' ? 'AI 获胜，再来一局？'
    : '和棋——棋盘满了'

  const playerPct = Math.round(50 + advantage * 46)
  const record = records[difficulty]
  const aiColorName = playerColor === BLACK ? '白' : '黑'

  return (
    <div className="gm-wrap">
      <header className="gm-header gm-header-row">
        <div>
          <p className="gm-kicker" style={{ color: 'rgba(251,191,36,0.85)' }}>GOMOKU AI</p>
          <h1 className="gm-title gm-title-sm">五子棋</h1>
        </div>
        <Link to="/games" className="gm-back gm-back-top">← 返回街机</Link>
      </header>

      <section className="gm-panel gk-panel">
        <div className="gk-toolbar">
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
          <div className="gm-seg">
            <button type="button" className={`gm-seg-btn ${playerColor === BLACK ? 'active' : ''}`} onClick={() => start(BLACK)}>
              执黑先行
            </button>
            <button type="button" className={`gm-seg-btn ${playerColor === WHITE ? 'active' : ''}`} onClick={() => start(WHITE)}>
              执白后行
            </button>
          </div>
          <div className="gk-toolbar-right">
            <button type="button" className="ms-chip" onClick={() => start()}>重新开始</button>
            <button type="button" className="ms-chip" disabled={status !== 'playerTurn'} onClick={undoPair}>悔棋</button>
            <button type="button" className="ms-chip" disabled={status !== 'playerTurn'} onClick={askHint}>提示</button>
            <button type="button" className="ms-chip" onClick={() => setSoundOn((v) => !v)}>{soundOn ? '🔊' : '🔇'}</button>
          </div>
        </div>

        <div className="gk-hud">
          <span className={`wf-stat ${status === 'playerTurn' ? 'gk-turn-player' : ''}`}>
            {status === 'over' ? (winner === 'player' ? '结果' : '结果') : '回合'}
            <b>{statusText}</b>
          </span>
          <span className="wf-stat">手数<b>{moveCount}</b></span>
          {aiDepth !== null && <span className="wf-stat">AI 深度<b>{aiDepth}</b></span>}
          <span className="wf-stat">{difficulty === 'hard' ? '困难' : '简单'}战绩<b>{record.w}胜 {record.l}负 {record.d}和</b></span>
        </div>

        <div className="gk-advantage">
          <span className="gk-adv-side">你</span>
          <div className="gk-adv-track">
            <i style={{ left: `${Math.min(Math.max(playerPct, 4), 96)}%` }} className={advantage > 0.15 ? 'good' : advantage < -0.15 ? 'bad' : ''} />
          </div>
          <span className="gk-adv-side">AI</span>
        </div>

        <div className="gk-shell" ref={shellRef}>
          <canvas
            ref={canvasRef}
            className="gk-canvas"
            onClick={onClick}
            onMouseMove={onHover}
            onMouseLeave={() => { hoverRef.current = null; drawRef.current() }}
          />
          {status === 'idle' && (
            <div className="gk-overlay">
              <p className="gk-overlay-title">五子棋 · 人机对弈</p>
              <p className="gk-overlay-sub">五连即胜，无禁手规则。AI 在后台多线程思考。</p>
              <div className="gk-overlay-actions">
                <button type="button" className="gm-btn-start" onClick={() => start(BLACK)}>执黑先行</button>
                <button type="button" className="gm-btn-start" onClick={() => start(WHITE)}>执白后行</button>
              </div>
            </div>
          )}
          {status === 'over' && (
            <div className="gk-overlay gk-overlay-lite">
              <p className="gk-overlay-title">
                {winner === 'player' ? '五连达成！' : winner === 'ai' ? 'AI 笑到了最后' : '平分秋色'}
              </p>
              <div className="gk-overlay-actions">
                <button type="button" className="gm-btn-start" onClick={() => start()}>再来一局</button>
              </div>
            </div>
          )}
          <ConfettiLayer pieces={confetti} />
        </div>

        <p className="gk-tip">
          你执{playerColor === BLACK ? '黑' : '白'}，AI 执{aiColorName}。点选交叉点落子；「提示」让 AI 替你算一手，「悔棋」会撤回一整回合。
        </p>
      </section>
    </div>
  )
}
