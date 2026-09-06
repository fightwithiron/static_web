import { useCallback, useEffect, useRef, useState } from 'react'
import './confetti.css'

const DEFAULT_COLORS = ['#f59e0b', '#34d399', '#60a5fa', '#f472b6', '#fbbf24', '#a78bfa']

let seq = 0

// 共享撒花层：useConfetti().burst() 触发一场纸屑，2.8s 后自动清理
export function useConfetti({ colors = DEFAULT_COLORS, count = 80 } = {}) {
  const [pieces, setPieces] = useState([])
  const timer = useRef(null)

  const burst = useCallback((customCount) => {
    const n = customCount ?? count
    const next = Array.from({ length: n }, () => ({
      id: ++seq,
      left: Math.random() * 100,
      delay: Math.random() * 0.6,
      dur: 1.7 + Math.random() * 1.4,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 6 + Math.random() * 7,
      drift: (Math.random() - 0.5) * 160,
    }))
    setPieces(next)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setPieces([]), 3600)
  }, [colors, count])

  useEffect(() => () => clearTimeout(timer.current), [])

  return { pieces, burst }
}

export function ConfettiLayer({ pieces }) {
  if (!pieces.length) return null
  return (
    <div className="confetti-layer" aria-hidden="true">
      {pieces.map((p) => (
        <i
          key={p.id}
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 0.46,
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.dur}s`,
            '--drift': `${p.drift}px`,
          }}
        />
      ))}
    </div>
  )
}
