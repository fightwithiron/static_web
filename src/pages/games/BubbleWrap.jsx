import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { sfx } from '../../utils/sound'
import './games.css'
import './bubblewrap.css'

const COLS_MOBILE = 8
const COLS_DESKTOP = 16
const ROWS = 11

const readTotal = () => {
  const v = Number(localStorage.getItem('bw-total'))
  return Number.isFinite(v) && v >= 0 ? v : 0
}
const readSheets = () => {
  const v = Number(localStorage.getItem('bw-sheets'))
  return Number.isFinite(v) && v >= 0 ? v : 1
}

const colsFor = () => (window.innerWidth < 640 ? COLS_MOBILE : COLS_DESKTOP)

const makeSheet = () => {
  const cols = colsFor()
  return Array.from({ length: cols * ROWS }, (_, i) => ({ id: i, popped: false }))
}

export default function BubbleWrap() {
  const [cols, setCols] = useState(colsFor)
  const [sheet, setSheet] = useState(makeSheet)
  const [sheetNo, setSheetNo] = useState(readSheets)
  const [total, setTotal] = useState(readTotal)
  const draggingRef = useRef(false)
  const soundRef = useRef(true)
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem('bw-sound') !== 'off')
  soundRef.current = soundOn

  const popped = sheet.filter((b) => b.popped).length
  const remaining = sheet.length - popped

  useEffect(() => {
    const onResize = () => {
      const c = colsFor()
      if (c !== cols) {
        setCols(c)
        setSheet(makeSheet())
      }
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [cols])

  useEffect(() => {
    try { localStorage.setItem('bw-sound', soundOn ? 'on' : 'off') } catch { /* 忽略 */ }
  }, [soundOn])

  const popAt = useCallback((el) => {
    const bubble = el?.closest?.('.bw-bubble')
    if (!bubble) return
    const idx = Number(bubble.dataset.idx)
    if (!Number.isFinite(idx)) return
    setSheet((prev) => {
      if (prev[idx]?.popped) return prev
      if (soundRef.current) sfx.pop()
      const next = [...prev]
      next[idx] = { ...next[idx], popped: true }
      // 累计与存档
      setTotal((t) => {
        const nt = t + 1
        try { localStorage.setItem('bw-total', String(nt)) } catch { /* 忽略 */ }
        return nt
      })
      // 捏完一整张，2 秒后自动换新
      if (next.every((b) => b.popped)) {
        setTimeout(() => {
          setSheet(makeSheet())
          setSheetNo((s) => {
            const ns = s + 1
            try { localStorage.setItem('bw-sheets', String(ns)) } catch { /* 忽略 */ }
            return ns
          })
          if (soundRef.current) sfx.chime()
        }, 900)
      }
      return next
    })
  }, [])

  // 按住拖动连破
  const onPointerDown = (e) => {
    draggingRef.current = true
    popAt(e.target)
  }
  const onPointerMove = (e) => {
    if (!draggingRef.current) return
    popAt(document.elementFromPoint(e.clientX, e.clientY))
  }
  const onPointerUp = () => {
    draggingRef.current = false
  }

  useEffect(() => {
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
    return () => {
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
    }
  }, [])

  const newSheet = () => {
    setSheet(makeSheet())
    sfx.ui()
  }

  return (
    <div className="gm-wrap">
      <header className="gm-header gm-header-row">
        <div>
          <p className="gm-kicker" style={{ color: 'rgba(125,211,252,0.85)' }}>BUBBLE WRAP</p>
          <h1 className="gm-title gm-title-sm">捏泡泡</h1>
        </div>
        <Link to="/games" className="gm-back gm-back-top">← 返回街机</Link>
      </header>

      <section className="gm-panel bw-panel">
        <div className="bw-hud">
          <span className="wf-stat">本张进度<b>{popped} / {sheet.length}</b></span>
          <span className="wf-stat">累计捏破<b>{total.toLocaleString()}</b></span>
          <span className="wf-stat">第<b>{sheetNo}</b>张</span>
          <div className="bw-hud-actions">
            <button type="button" className="ms-chip" onClick={newSheet}>换新的一张</button>
            <button type="button" className="ms-chip" onClick={() => setSoundOn((v) => !v)}>
              {soundOn ? '🔊' : '🔇'}
            </button>
          </div>
        </div>

        <div
          className="bw-sheet"
          style={{ '--bw-cols': cols }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          {sheet.map((b, i) => (
            <button
              key={b.id}
              type="button"
              data-idx={i}
              className={`bw-bubble ${b.popped ? 'popped' : ''}`}
              aria-label={b.popped ? '已破的泡泡' : '泡泡'}
            />
          ))}
        </div>

        <p className="bw-tip">点破单个泡泡，或按住不放拖过一整排。捏完一张会自动换新。</p>
      </section>
    </div>
  )
}
