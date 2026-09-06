import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { sfx } from '../../utils/sound'
import './games.css'
import './woodenfish.css'

const SKINS = [
  { id: 'loam', name: '原木', vars: { '--wf-wood1': '#c99468', '--wf-wood2': '#9c6a42', '--wf-wood3': '#6e4326', '--wf-scale': '#b27f55' } },
  { id: 'rosewood', name: '紫檀', vars: { '--wf-wood1': '#8a4b52', '--wf-wood2': '#5f3038', '--wf-wood3': '#3c1d24', '--wf-scale': '#77424b' } },
  { id: 'obsidian', name: '玄铁', vars: { '--wf-wood1': '#5d6470', '--wf-wood2': '#3b414c', '--wf-wood3': '#23272f', '--wf-scale': '#4c525e' } },
]

// 飘字文案：功德为主，偶尔整点别的
const FLOAT_TEXTS = [
  { text: '功德 +1', w: 82 },
  { text: '烦恼 -1', w: 6 },
  { text: '好运 +1', w: 5 },
  { text: '赛博真经 +1', w: 4 },
  { text: '心诚则灵', w: 3 },
]
const TEXT_POOL = FLOAT_TEXTS.flatMap((t) => Array(t.w).fill(t.text))

const COMBO_WINDOW = 1500

const todayKey = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const readNum = (key, fallback = 0) => {
  const v = Number(localStorage.getItem(key))
  return Number.isFinite(v) && v >= 0 ? v : fallback
}
const readToday = () => {
  try {
    const saved = JSON.parse(localStorage.getItem('muyu-day') ?? 'null')
    if (saved && saved.date === todayKey()) return saved.count
  } catch { /* 忽略 */ }
  return 0
}

function WoodenFishArt({ knocking }) {
  // 三排鳞片，用弧线循环生成
  const scales = []
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 6; col++) {
      scales.push({ x: 66 + col * 22 + (row % 2) * 11, y: 78 + row * 24 })
    }
  }
  return (
    <svg viewBox="0 0 280 190" className={`wf-fish ${knocking ? 'knocking' : ''}`} aria-hidden="true">
      <defs>
        <radialGradient id="wf-wood" cx="38%" cy="30%" r="85%">
          <stop offset="0%" stopColor="var(--wf-wood1)" />
          <stop offset="62%" stopColor="var(--wf-wood2)" />
          <stop offset="100%" stopColor="var(--wf-wood3)" />
        </radialGradient>
      </defs>
      {/* 尾巴卷曲 */}
      <path
        d="M212 96 q 44 -4 40 -34 q -3 -24 -28 -20 q 17 5 15 19 q -3 18 -36 20 z"
        fill="var(--wf-wood2)" stroke="var(--wf-wood3)" strokeWidth="5" strokeLinejoin="round"
      />
      {/* 鱼身 */}
      <ellipse cx="116" cy="102" rx="92" ry="64" fill="url(#wf-wood)" stroke="var(--wf-wood3)" strokeWidth="6" />
      <ellipse cx="116" cy="122" rx="72" ry="36" fill="rgba(0,0,0,0.14)" />
      {/* 顶部音槽 */}
      <rect x="62" y="44" width="108" height="13" rx="6.5" fill="var(--wf-wood3)" />
      {/* 鳞片 */}
      {scales.map((s, i) => (
        <path
          key={i}
          d={`M ${s.x} ${s.y} a 11 11 0 0 0 22 0`}
          fill="none" stroke="var(--wf-scale)" strokeWidth="3" strokeLinecap="round"
        />
      ))}
      {/* 眼睛 */}
      <circle cx="46" cy="94" r="8" fill="var(--wf-wood3)" />
      <circle cx="48.5" cy="91.5" r="2.6" fill="rgba(255,255,255,0.85)" />
    </svg>
  )
}

export default function WoodenFish() {
  const [skin, setSkin] = useState(() => localStorage.getItem('muyu-skin') ?? 'loam')
  const [total, setTotal] = useState(() => readNum('muyu-total'))
  const [today, setToday] = useState(readToday)
  const [bestCombo, setBestCombo] = useState(() => readNum('muyu-best-combo'))
  const [combo, setCombo] = useState(0)
  const [knocking, setKnocking] = useState(false)
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem('muyu-sound') !== 'off')
  const [auto, setAuto] = useState(false)
  const [speed, setSpeed] = useState(2)
  const [floats, setFloats] = useState([])
  const [ripples, setRipples] = useState([])

  const lastKnockRef = useRef(0)
  const comboRef = useRef(0)
  const floatSeq = useRef(0)
  const soundRef = useRef(soundOn)
  soundRef.current = soundOn
  const todayRef = useRef(today)
  todayRef.current = today

  const skinVars = (SKINS.find((s) => s.id === skin) ?? SKINS[0]).vars

  useEffect(() => {
    try {
      localStorage.setItem('muyu-skin', skin)
      localStorage.setItem('muyu-sound', soundOn ? 'on' : 'off')
    } catch { /* 忽略 */ }
  }, [skin, soundOn])

  const knock = useCallback((fromAuto = false) => {
    const now = Date.now()
    comboRef.current = now - lastKnockRef.current < COMBO_WINDOW ? comboRef.current + 1 : 1
    lastKnockRef.current = now
    const c = comboRef.current

    setCombo(c)
    if (c > bestCombo) {
      setBestCombo(c)
      try { localStorage.setItem('muyu-best-combo', String(c)) } catch { /* 忽略 */ }
    }
    setTotal((v) => {
      const next = v + 1
      try { localStorage.setItem('muyu-total', String(next)) } catch { /* 忽略 */ }
      return next
    })
    setToday((v) => {
      const next = v + 1
      try { localStorage.setItem('muyu-day', JSON.stringify({ date: todayKey(), count: next })) } catch { /* 忽略 */ }
      return next
    })

    if (soundRef.current) sfx.muyu(Math.min(c, 10))

    setKnocking(true)
    setTimeout(() => setKnocking(false), 130)

    const id = ++floatSeq.current
    const text = TEXT_POOL[Math.floor(Math.random() * TEXT_POOL.length)]
    setFloats((arr) => [
      ...arr.slice(-14),
      { id, text, x: 38 + Math.random() * 24, y: 14 + Math.random() * 16 },
    ])
    setTimeout(() => setFloats((arr) => arr.filter((f) => f.id !== id)), 1150)

    const rid = ++floatSeq.current + 10000
    setRipples((arr) => [...arr.slice(-4), { id: rid }])
    setTimeout(() => setRipples((arr) => arr.filter((r) => r.id !== rid)), 620)

    if (!fromAuto && c > 0 && c % 50 === 0 && soundRef.current) sfx.chime()
  }, [bestCombo])

  // 自动敲击
  useEffect(() => {
    if (!auto) return undefined
    const t = setInterval(() => knock(true), 1000 / speed)
    return () => clearInterval(t)
  }, [auto, speed, knock])

  // 空格敲击
  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault()
        knock()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [knock])

  return (
    <div className="gm-wrap">
      <header className="gm-header gm-header-row">
        <div>
          <p className="gm-kicker" style={{ color: 'rgba(214,163,115,0.85)' }}>CYBER WOODEN FISH</p>
          <h1 className="gm-title gm-title-sm">电子木鱼</h1>
        </div>
        <Link to="/games" className="gm-back gm-back-top">← 返回街机</Link>
      </header>

      <section className="gm-panel wf-panel">
        <div className="wf-hud">
          <span className="wf-stat">总功德<b>{total.toLocaleString()}</b></span>
          <span className="wf-stat">今日<b>{today}</b></span>
          <span className="wf-stat">最高连击<b>{bestCombo}</b></span>
          <span className={`wf-stat wf-combo ${combo > 1 ? 'hot' : ''}`}>连击<b>×{combo}</b></span>
        </div>

        <div className="wf-scene" style={skinVars}>
          <i className="wf-smoke s1" aria-hidden="true" />
          <i className="wf-smoke s2" aria-hidden="true" />
          <i className="wf-smoke s3" aria-hidden="true" />
          <div className="wf-stage">
            {ripples.map((r) => <i key={r.id} className="wf-ripple" aria-hidden="true" />)}
            <button type="button" className="wf-fish-btn" onClick={() => knock()} aria-label="敲木鱼">
              <WoodenFishArt knocking={knocking} />
            </button>
            <svg viewBox="0 0 90 150" className={`wf-mallet ${knocking ? 'knocking' : ''}`} aria-hidden="true">
              <rect x="41" y="42" width="9" height="102" rx="4.5" fill="#7a4a2b" stroke="#4c2c17" strokeWidth="2.5" />
              <circle cx="45.5" cy="28" r="21" fill="#a5613a" stroke="#5e3319" strokeWidth="3" />
              <circle cx="39" cy="21" r="6" fill="rgba(255,255,255,0.28)" />
            </svg>
            {floats.map((f) => (
              <span key={f.id} className="wf-float" style={{ left: `${f.x}%`, top: `${f.y}%` }}>
                {f.text}
              </span>
            ))}
          </div>
          <p className="wf-tip">点击木鱼或按空格敲击 · 连击不断功德涨得快</p>
        </div>

        <div className="wf-controls">
          <div className="wf-skins">
            {SKINS.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`ms-chip ${skin === s.id ? 'active' : ''}`}
                style={s.vars}
                data-skin={s.id}
                onClick={() => { setSkin(s.id); if (soundOn) sfx.ui() }}
              >
                {s.name}
              </button>
            ))}
          </div>
          <div className="wf-toggle-row">
            <button type="button" className={`ms-chip ${auto ? 'active' : ''}`} onClick={() => setAuto((v) => !v)}>
              自动 {auto ? 'ON' : 'OFF'}
            </button>
            <label className="wf-speed">
              <input
                type="range" min="1" max="4" step="1" value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                disabled={!auto}
              />
              <span>{speed} 次/秒</span>
            </label>
            <button type="button" className="ms-chip" onClick={() => setSoundOn((v) => !v)}>
              {soundOn ? '🔊' : '🔇'}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
