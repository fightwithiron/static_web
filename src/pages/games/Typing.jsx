import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { sfx } from '../../utils/sound'
import { ZH_PASSAGES, EN_PASSAGES } from '../../data/passages'
import './games.css'
import './typing.css'

const MODES = [
  { id: 'timed', name: '限时 60 秒' },
  { id: 'passage', name: '整段挑战' },
]
const LANGS = [
  { id: 'zh', name: '中文', pool: ZH_PASSAGES },
  { id: 'en', name: '英文', pool: EN_PASSAGES },
]
const TIMED_SECONDS = 60

const bestKey = (mode, lang) => `typing-best-${mode}-${lang}`
const readBest = (mode, lang) => {
  const v = Number(localStorage.getItem(bestKey(mode, lang)))
  return Number.isFinite(v) && v > 0 ? v : null
}

const pickPassage = (lang) => {
  const pool = LANGS.find((l) => l.id === lang).pool
  return pool[Math.floor(Math.random() * pool.length)]
}

export default function Typing() {
  const [mode, setMode] = useState('timed')
  const [lang, setLang] = useState('zh')
  const [passage, setPassage] = useState(() => pickPassage('zh'))
  const [typed, setTyped] = useState('')
  const [phase, setPhase] = useState('ready') // ready | running | done
  const [elapsed, setElapsed] = useState(0)
  const [result, setResult] = useState(null)
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem('typing-sound') !== 'off')

  const taRef = useRef(null)
  const caretRef = useRef(null)
  const composingRef = useRef(false)
  const typedRef = useRef('')
  const startedAtRef = useRef(0)
  const soundRef = useRef(soundOn)
  soundRef.current = soundOn

  useEffect(() => {
    try { localStorage.setItem('typing-sound', soundOn ? 'on' : 'off') } catch { /* 忽略 */ }
  }, [soundOn])

  const correctCount = useMemo(() => {
    let n = 0
    for (let i = 0; i < typed.length; i++) {
      if (typed[i] === passage[i]) n++
    }
    return n
  }, [typed, passage])

  const elapsedMin = Math.max(elapsed, 1.5) / 60
  const speed = lang === 'en'
    ? Math.round((correctCount / 5) / elapsedMin)
    : Math.round(correctCount / elapsedMin)
  const accuracy = typed.length ? Math.round((correctCount / typed.length) * 100) : 100

  // ---------- 成绩结算 ----------
  const finish = useCallback(() => {
    setPhase('done')
    const el = mode === 'timed' ? TIMED_SECONDS : (Date.now() - startedAtRef.current) / 1000
    const minutes = Math.max(el, 1.5) / 60
    let correct = 0
    for (let i = 0; i < typedRef.current.length; i++) {
      if (typedRef.current[i] === passage[i]) correct++
    }
    const spd = lang === 'en'
      ? Math.round((correct / 5) / minutes)
      : Math.round(correct / minutes)
    const acc = typedRef.current.length ? Math.round((correct / typedRef.current.length) * 100) : 0
    const prevBest = readBest(mode, lang)
    const isRecord = spd > 0 && (prevBest === null || spd > prevBest)
    if (isRecord) {
      try { localStorage.setItem(bestKey(mode, lang), String(spd)) } catch { /* 忽略 */ }
    }
    setResult({ speed: spd, acc, time: Math.round(el), correct, isRecord })
    if (soundRef.current) (spd > 0 ? sfx.win : sfx.over)()
  }, [mode, lang, passage])

  // ---------- 计时器 ----------
  useEffect(() => {
    if (phase !== 'running') return undefined
    const iv = setInterval(() => {
      const el = (Date.now() - startedAtRef.current) / 1000
      setElapsed(el)
      if (mode === 'timed' && el >= TIMED_SECONDS) {
        finish()
      } else if (mode === 'passage' && typedRef.current.length >= passage.length) {
        finish()
      }
    }, 100)
    return () => clearInterval(iv)
  }, [phase, mode, passage, finish])

  // ---------- 输入同步（含中文输入法） ----------
  const syncTyped = (value) => {
    if (phase === 'done') return
    const clean = value.slice(0, passage.length)
    if (phase === 'ready') {
      startedAtRef.current = Date.now()
      setPhase('running')
    }
    typedRef.current = clean
    setTyped(clean)
  }

  const onInput = (e) => {
    // 中文输入法拼音上屏过程中不计入
    if (e.nativeEvent.isComposing || composingRef.current) return
    syncTyped(e.target.value)
  }

  const onCompositionStart = () => {
    composingRef.current = true
  }

  const onCompositionEnd = (e) => {
    composingRef.current = false
    syncTyped(e.target.value)
  }

  // ---------- 光标跟随滚动 ----------
  useEffect(() => {
    caretRef.current?.scrollIntoView({ block: 'nearest' })
  }, [typed.length])

  const reset = useCallback((nextLang = lang, nextMode = mode) => {
    setLang(nextLang)
    setMode(nextMode)
    setPassage(pickPassage(nextLang))
    setTyped('')
    typedRef.current = ''
    setPhase('ready')
    setElapsed(0)
    setResult(null)
    composingRef.current = false
    if (taRef.current) taRef.current.value = ''
    taRef.current?.focus()
    sfx.ui()
  }, [lang, mode])

  const remaining = Math.max(TIMED_SECONDS - elapsed, 0)
  const progress = mode === 'passage'
    ? Math.min(typed.length / Math.max(passage.length, 1), 1)
    : Math.min(elapsed / TIMED_SECONDS, 1)
  const best = readBest(mode, lang)

  return (
    <div className="gm-wrap">
      <header className="gm-header gm-header-row">
        <div>
          <p className="gm-kicker" style={{ color: 'rgba(129,230,217,0.85)' }}>TYPE RACING</p>
          <h1 className="gm-title gm-title-sm">打字测速场</h1>
        </div>
        <Link to="/games" className="gm-back gm-back-top">← 返回街机</Link>
      </header>

      <section className="gm-panel tp-panel">
        <div className="tp-toolbar">
          <div className="gm-seg">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`gm-seg-btn ${mode === m.id ? 'active' : ''}`}
                onClick={() => reset(lang, m.id)}
              >
                {m.name}
              </button>
            ))}
          </div>
          <div className="gm-seg">
            {LANGS.map((l) => (
              <button
                key={l.id}
                type="button"
                className={`gm-seg-btn ${lang === l.id ? 'active' : ''}`}
                onClick={() => reset(l.id, mode)}
              >
                {l.name}
              </button>
            ))}
          </div>
          <div className="tp-toolbar-right">
            <span className="wf-stat">最佳<b>{best === null ? '—' : `${best}${lang === 'en' ? ' WPM' : ' 字/分'}`}</b></span>
            <button type="button" className="ms-chip" onClick={() => setSoundOn((v) => !v)}>
              {soundOn ? '🔊' : '🔇'}
            </button>
            <button type="button" className="ms-chip" onClick={() => reset()}>换一段</button>
          </div>
        </div>

        <div className="tp-live">
          <span className="tp-live-item">
            <small>{lang === 'en' ? 'WPM' : '速度'}</small>
            <b>{phase === 'ready' ? '—' : speed}</b>
          </span>
          <span className="tp-live-item">
            <small>正确率</small>
            <b>{phase === 'ready' ? '—' : `${accuracy}%`}</b>
          </span>
          <span className="tp-live-item">
            <small>{mode === 'timed' ? '剩余' : '用时'}</small>
            <b>{phase === 'ready' ? (mode === 'timed' ? '60s' : '0s') : `${Math.ceil(mode === 'timed' ? remaining : elapsed)}s`}</b>
          </span>
        </div>

        <div className="tp-progress">
          <i style={{ width: `${progress * 100}%`, background: mode === 'timed' && remaining < 10 ? '#f87171' : '#38bdf8' }} />
        </div>

        <div
          className={`tp-display ${phase === 'done' ? 'locked' : ''}`}
          onClick={() => phase !== 'done' && taRef.current?.focus()}
        >
          {passage.split('').map((ch, i) => {
            const t = typed[i]
            const cls = t === undefined ? 'pending' : t === ch ? 'correct' : 'wrong'
            return (
              <span
                key={i}
                ref={i === typed.length ? caretRef : undefined}
                className={`tp-ch ${cls} ${i === typed.length ? 'current' : ''}`}
              >
                {ch}
              </span>
            )
          })}
          <textarea
            ref={taRef}
            className="tp-input"
            onChange={onInput}
            onCompositionStart={onCompositionStart}
            onCompositionEnd={onCompositionEnd}
            onPaste={(e) => e.preventDefault()}
            onKeyDown={(e) => { if (e.key === 'Tab') e.preventDefault() }}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            aria-label="打字输入区"
          />
          {phase === 'ready' && (
            <div className="tp-ready">
              <p>点击此处开始，输入第一个字即计时</p>
              <p className="tp-ready-sub">手机上点击后直接用输入法打字；拼音上屏过程中不计错</p>
            </div>
          )}
        </div>

        {phase === 'done' && result && (
          <div className="tp-result">
            <p className="tp-result-title">
              {result.speed > 0 ? '本段成绩' : '时间到'}
              {result.isRecord && <span className="sn-record-tag">NEW RECORD</span>}
            </p>
            <div className="tp-result-grid">
              <span><small>速度</small><b>{result.speed}<i>{lang === 'en' ? ' WPM' : ' 字/分'}</i></b></span>
              <span><small>正确率</small><b>{result.acc}<i>%</i></b></span>
              <span><small>用时</small><b>{result.time}<i>s</i></b></span>
              <span><small>正确字数</small><b>{result.correct}<i>/{typed.length}</i></b></span>
            </div>
            <button type="button" className="gm-btn-start" onClick={() => reset()}>再来一段</button>
          </div>
        )}
      </section>
    </div>
  )
}
