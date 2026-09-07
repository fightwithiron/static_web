import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { sfx } from '../utils/sound'
import { useConfetti, ConfettiLayer } from '../components/Confetti'
import './funclock.css'

// 趣味时钟：表盘 / 秒表 / 倒计时 三态切换
// 表盘：深夜机械腕表风格 Canvas 渲染（拉丝表圈 + 平滑扫秒 + 月相昼夜窗 + 日期窗 + 玻璃反光）
// 秒表：performance.now 增量计时，计次统计最佳/最差圈
// 倒计时：圆环进度 + 末 10 秒警示 + 完成撒花

const VIEWS = [
  { id: 'clock', name: '表盘' },
  { id: 'stopwatch', name: '秒表' },
  { id: 'countdown', name: '倒计时' },
]
const CD_PRESETS = [1, 3, 5, 10, 25, 45] // 分钟
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
const FC_COLORS = ['#fbbf24', '#38bdf8', '#e879f9', '#4ade80', '#fde68a']

const pad = (n, w = 2) => String(n).padStart(w, '0')

export default function FunClock() {
  const [view, setView] = useState('clock')
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem('funlock-sound') !== 'off')
  const [swLaps, setSwLaps] = useState([]) // { n, lap, total }
  const [swRunning, setSwRunning] = useState(false)
  const [cdPhase, setCdPhase] = useState('idle') // idle | running | paused | done
  const [cdInfo, setCdInfo] = useState(() => {
    const m = Number(localStorage.getItem('funlock-cd-min'))
    return { total: (Number.isFinite(m) && m > 0 ? m : 5) * 60, remain: (Number.isFinite(m) && m > 0 ? m : 5) * 60 }
  })

  const dialRef = useRef(null)
  const ringRef = useRef(null)
  const clockDigitsRef = useRef(null)
  const clockDateRef = useRef(null)
  const cdStateRef = useRef(null)
  const swDigitsRef = useRef(null)
  const cdDigitsRef = useRef(null)
  const viewRef = useRef(view)
  viewRef.current = view
  const soundRef = useRef(soundOn)
  soundRef.current = soundOn

  // 秒表：累计制（暂停不丢时间）
  const swRef = useRef({ running: false, acc: 0, lastMark: 0 })
  // 倒计时：剩余毫秒 + 运行标记
  const cdRef = useRef({ running: false, remain: 0, lastTs: 0, lastWholeSec: null })
  const { pieces: confetti, burst } = useConfetti({ colors: FC_COLORS })

  useEffect(() => {
    try { localStorage.setItem('funlock-sound', soundOn ? 'on' : 'off') } catch { /* 忽略 */ }
  }, [soundOn])

  // ---------- 秒表 ----------
  const swStartStop = useCallback(() => {
    const sw = swRef.current
    if (sw.running) {
      sw.acc += performance.now() - sw.lastMark
      sw.running = false
      setSwRunning(false)
    } else {
      sw.lastMark = performance.now()
      sw.running = true
      setSwRunning(true)
    }
    if (soundRef.current) sfx.ui()
  }, [])

  const swReset = useCallback(() => {
    const sw = swRef.current
    sw.running = false
    sw.acc = 0
    sw.lastMark = 0
    setSwRunning(false)
    setSwLaps([])
    if (soundRef.current) sfx.ui()
  }, [])

  const swLap = useCallback(() => {
    const sw = swRef.current
    if (!sw.running) return
    const total = sw.acc + (performance.now() - sw.lastMark)
    const prev = swLaps.length ? swLaps[swLaps.length - 1].total : 0
    setSwLaps((prevLaps) => [
      { n: prevLaps.length + 1, lap: total - prev, total },
      ...prevLaps,
    ])
    if (soundRef.current) sfx.ui()
  }, [swLaps])

  // ---------- 倒计时 ----------
  const cdSet = useCallback((deltaSec) => {
    const cd = cdRef.current
    if (cd.running) return
    cd.justDone = false
    setCdInfo((prev) => {
      const total = Math.max(10, Math.min(90 * 60, prev.total + deltaSec))
      try { localStorage.setItem('funlock-cd-min', String(Math.round(total / 60))) } catch { /* 忽略 */ }
      return { total, remain: total }
    })
    setCdPhase('idle')
    if (soundRef.current) sfx.ui()
  }, [])

  const cdApplyPreset = useCallback((min) => {
    if (cdRef.current.running) return
    cdRef.current.justDone = false
    setCdInfo({ total: min * 60, remain: min * 60 })
    try { localStorage.setItem('funlock-cd-min', String(min)) } catch { /* 忽略 */ }
    setCdPhase('idle')
    if (soundRef.current) sfx.ui()
  }, [])

  const cdStartStop = useCallback(() => {
    const cd = cdRef.current
    if (cd.running) {
      cd.running = false
      // cd.remain 内部毫秒制，同步回 React 态时换回秒
      setCdInfo((prev) => ({ ...prev, remain: Math.ceil(cd.remain / 1000) }))
      setCdPhase('paused')
    } else {
      const info = cdInfoRef.current
      const remain = info.remain <= 0 ? info.total : info.remain
      cd.remain = remain * 1000 // 内部一律毫秒
      cd.justDone = false
      cd.lastTs = performance.now()
      cd.lastWholeSec = null
      cd.running = true
      setCdInfo((prev) => ({ ...prev, remain }))
      setCdPhase('running')
    }
    if (soundRef.current) sfx.ui()
  }, [])

  const cdReset = useCallback(() => {
    const cd = cdRef.current
    cd.running = false
    cd.justDone = false
    cd.lastWholeSec = null
    setCdInfo((prev) => ({ ...prev, remain: prev.total }))
    setCdPhase('idle')
    if (soundRef.current) sfx.ui()
  }, [])

  // refs 镜像（RAF 里读最新状态）
  const cdInfoRef = useRef(cdInfo)
  cdInfoRef.current = cdInfo
  const cdPhaseRef = useRef(cdPhase)
  cdPhaseRef.current = cdPhase

  // ---------- 主循环 ----------
  useEffect(() => {
    const dial = dialRef.current
    const ring = ringRef.current
    const dctx = dial?.getContext('2d')
    const rctx = ring?.getContext('2d')
    if (!dial || !ring) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    dial.width = 560 * dpr
    dial.height = 560 * dpr
    ring.width = 420 * dpr
    ring.height = 420 * dpr
    let raf = 0

    // ===== 表盘渲染 =====
    const drawDial = () => {
      const ctx = dctx
      const C = 280 // 中心
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, 560, 560)

      const R = 252
      // 表圈（外抛光深边 + 拉丝金属环）
      ctx.beginPath()
      ctx.arc(C, C, R, 0, Math.PI * 2)
      ctx.fillStyle = '#0a0d15'
      ctx.fill()
      const bezel = ctx.createConicGradient
        ? ctx.createConicGradient(-Math.PI / 3, C, C)
        : null
      if (bezel) {
        const stops = ['#39415a', '#93a0bd', '#525c76', '#20263a', '#8b96b0', '#39415a', '#93a0bd', '#39415a']
        stops.forEach((c, i) => bezel.addColorStop(i / (stops.length - 1), c))
        ctx.fillStyle = bezel
      } else {
        ctx.fillStyle = '#525c76'
      }
      ctx.beginPath()
      ctx.arc(C, C, R * 0.955, 0, Math.PI * 2)
      ctx.fill()
      // 圈上细高光线
      ctx.strokeStyle = 'rgba(230, 238, 255, 0.18)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(C, C, R * 0.955, 0, Math.PI * 2)
      ctx.stroke()

      // 表盘漆面
      const face = ctx.createRadialGradient(C - R * 0.25, C - R * 0.3, R * 0.1, C, C, R * 0.9)
      face.addColorStop(0, '#1c2436')
      face.addColorStop(0.7, '#131a2a')
      face.addColorStop(1, '#0b101c')
      ctx.fillStyle = face
      ctx.beginPath()
      ctx.arc(C, C, R * 0.9, 0, Math.PI * 2)
      ctx.fill()

      // 同心圆纹（日内瓦纹质感）
      ctx.strokeStyle = 'rgba(190, 205, 235, 0.045)'
      ctx.lineWidth = 1
      for (const rr of [R * 0.34, R * 0.52, R * 0.7]) {
        ctx.beginPath()
        ctx.arc(C, C, rr, 0, Math.PI * 2)
        ctx.stroke()
      }

      // —— 刻度 ——
      for (let i = 0; i < 60; i++) {
        const a = (i / 60) * Math.PI * 2 - Math.PI / 2
        const hour = i % 5 === 0
        const r1 = R * (hour ? 0.78 : 0.83)
        const r2 = R * 0.86
        ctx.save()
        ctx.translate(C, C)
        ctx.rotate(a)
        ctx.strokeStyle = hour ? 'rgba(214, 224, 245, 0.85)' : 'rgba(190, 205, 235, 0.32)'
        ctx.lineWidth = hour ? 4 : 1.4
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(0, r1)
        ctx.lineTo(0, r2)
        ctx.stroke()
        ctx.restore()
      }

      // 数字（12 与 9；3 是日期窗、6 是月相窗，遵循真实腕表做法留空）
      ctx.fillStyle = '#dfe6f3'
      ctx.font = `600 ${Math.round(R * 0.105)}px 'JetBrains Mono', ui-monospace, monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('12', C, C - R * 0.66)
      ctx.fillText('9', C - R * 0.66, C)

      // 品牌铭牌
      ctx.fillStyle = 'rgba(251, 191, 36, 0.8)'
      ctx.font = `700 ${Math.round(R * 0.052)}px 'JetBrains Mono', ui-monospace, monospace`
      ctx.fillText('RUNE', C, C - R * 0.4)
      ctx.fillStyle = 'rgba(190, 205, 235, 0.5)'
      ctx.font = `400 ${Math.round(R * 0.033)}px 'JetBrains Mono', ui-monospace, monospace`
      ctx.fillText('玩物工坊 · AUTOMATIC', C, C - R * 0.33)

      // —— 日期窗（3 点位）——
      {
        const now = new Date()
        const wx = C + R * 0.56
        const wy = C
        const ww = R * 0.17, wh = R * 0.13
        ctx.fillStyle = '#070a12'
        ctx.strokeStyle = 'rgba(214, 224, 245, 0.35)'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        if (ctx.roundRect) ctx.roundRect(wx - ww / 2, wy - wh / 2, ww, wh, 4)
        else ctx.rect(wx - ww / 2, wy - wh / 2, ww, wh)
        ctx.fill()
        ctx.stroke()
        ctx.fillStyle = '#dfe6f3'
        ctx.font = `700 ${Math.round(R * 0.075)}px 'JetBrains Mono', ui-monospace, monospace`
        ctx.fillText(String(now.getDate()), wx, wy + 1)
      }

      // —— 月相昼夜窗（6 点位）——
      {
        const now = new Date()
        const hours = now.getHours() + now.getMinutes() / 60
        const wx = C
        const wy = C + R * 0.5
        const wr = R * 0.16
        ctx.save()
        // 半圆窗（开口朝上）
        ctx.beginPath()
        ctx.arc(wx, wy, wr, Math.PI, 0)
        ctx.closePath()
        ctx.clip()
        const isDay = hours >= 6 && hours < 18
        const sky = ctx.createLinearGradient(wx, wy - wr, wx, wy)
        if (isDay) {
          sky.addColorStop(0, '#3f6ea8')
          sky.addColorStop(1, '#a8c4e0')
        } else {
          sky.addColorStop(0, '#0a1030')
          sky.addColorStop(1, '#223058')
        }
        ctx.fillStyle = sky
        ctx.fillRect(wx - wr, wy - wr, wr * 2, wr)
        if (isDay) {
          // 太阳沿弧线走：6 点升起 → 18 点落下
          const k = (hours - 6) / 12
          const a = Math.PI - k * Math.PI
          const sx = wx + Math.cos(a) * wr * 0.62
          const sy = wy - Math.sin(a) * wr * 0.78
          const sun = ctx.createRadialGradient(sx, sy, 1, sx, sy, wr * 0.3)
          sun.addColorStop(0, '#ffe9a8')
          sun.addColorStop(0.55, '#fbbf24')
          sun.addColorStop(1, 'rgba(251, 191, 36, 0)')
          ctx.fillStyle = sun
          ctx.beginPath()
          ctx.arc(sx, sy, wr * 0.3, 0, Math.PI * 2)
          ctx.fill()
        } else {
          // 月亮 + 星星
          const k = hours >= 18 ? (hours - 18) / 12 : (hours + 6) / 12
          const a = Math.PI - k * Math.PI
          const mx = wx + Math.cos(a) * wr * 0.62
          const my = wy - Math.sin(a) * wr * 0.78
          for (let s = 0; s < 5; s++) {
            const ang = 0.6 + s * 1.05
            const sx = wx + Math.cos(ang) * wr * (0.45 + (s % 2) * 0.3)
            const sy = wy - Math.sin(ang) * wr * (0.5 + (s % 3) * 0.16)
            ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(now.getSeconds() * 1.7 + s * 2))
            ctx.fillStyle = '#dbeafe'
            ctx.beginPath()
            ctx.arc(sx, sy, 1.4, 0, Math.PI * 2)
            ctx.fill()
          }
          ctx.globalAlpha = 1
          ctx.fillStyle = '#e8ecf4'
          ctx.beginPath()
          ctx.arc(mx, my, wr * 0.17, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = 'rgba(180, 190, 210, 0.35)'
          ctx.beginPath()
          ctx.arc(mx - wr * 0.05, my - wr * 0.04, wr * 0.045, 0, Math.PI * 2)
          ctx.arc(mx + wr * 0.06, my + wr * 0.05, wr * 0.035, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.restore()
        // 窗框
        ctx.strokeStyle = 'rgba(214, 224, 245, 0.4)'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(wx, wy, wr, Math.PI, 0)
        ctx.closePath()
        ctx.stroke()
      }

      // —— 指针 ——
      const now = new Date()
      const ms = now.getMilliseconds()
      const sec = now.getSeconds() + ms / 1000
      const min = now.getMinutes() + sec / 60
      const hr = (now.getHours() % 12) + min / 60

      const hand = (angle, len, wid, tail, color, glow) => {
        ctx.save()
        ctx.translate(C, C)
        ctx.rotate(angle)
        // 剑形指针：0 角度必须指向 12 点（画布 -y 方向），尾部带配重
        ctx.beginPath()
        ctx.moveTo(-wid, -tail)
        ctx.lineTo(-wid * 0.35, -len * 0.92)
        ctx.lineTo(0, -len)
        ctx.lineTo(wid * 0.35, -len * 0.92)
        ctx.lineTo(wid, -tail)
        ctx.closePath()
        if (glow) {
          ctx.shadowColor = 'rgba(251, 191, 36, 0.55)'
          ctx.shadowBlur = 10
        }
        ctx.fillStyle = color
        ctx.fill()
        ctx.shadowBlur = 0
        ctx.strokeStyle = 'rgba(6, 9, 16, 0.5)'
        ctx.lineWidth = 1
        ctx.stroke()
        ctx.restore()
      }
      const shadowHand = (angle, len, wid, tail) => {
        ctx.save()
        ctx.translate(C + 3, C + 4)
        ctx.rotate(angle)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)'
        ctx.beginPath()
        ctx.moveTo(-wid, -tail)
        ctx.lineTo(0, -len)
        ctx.lineTo(wid, -tail)
        ctx.closePath()
        ctx.fill()
        ctx.restore()
      }

      const hrA = (hr / 12) * Math.PI * 2
      const minA = (min / 60) * Math.PI * 2
      const secA = (sec / 60) * Math.PI * 2
      shadowHand(hrA, R * 0.5, R * 0.038, R * 0.1)
      shadowHand(minA, R * 0.72, R * 0.028, R * 0.12)
      hand(hrA, R * 0.5, R * 0.038, R * 0.1, '#e8edf7', false)
      hand(minA, R * 0.72, R * 0.028, R * 0.12, '#e8edf7', false)
      hand(secA, R * 0.8, R * 0.009, R * 0.18, '#fbbf24', true)

      // 中心轴三环帽
      ctx.fillStyle = '#fbbf24'
      ctx.beginPath()
      ctx.arc(C, C, R * 0.032, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#0b101c'
      ctx.beginPath()
      ctx.arc(C, C, R * 0.018, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#e8edf7'
      ctx.beginPath()
      ctx.arc(C, C, R * 0.008, 0, Math.PI * 2)
      ctx.fill()

      // 玻璃反光（左上斜高光 + 边缘暗角）
      ctx.save()
      ctx.beginPath()
      ctx.arc(C, C, R * 0.9, 0, Math.PI * 2)
      ctx.clip()
      const glare = ctx.createLinearGradient(0, 0, R, R)
      glare.addColorStop(0, 'rgba(255, 255, 255, 0.09)')
      glare.addColorStop(0.4, 'rgba(255, 255, 255, 0.02)')
      glare.addColorStop(1, 'rgba(255, 255, 255, 0)')
      ctx.fillStyle = glare
      ctx.fillRect(0, 0, 560, 560)
      const vig = ctx.createRadialGradient(C, C, R * 0.6, C, C, R * 0.92)
      vig.addColorStop(0, 'rgba(0, 0, 0, 0)')
      vig.addColorStop(1, 'rgba(0, 0, 0, 0.28)')
      ctx.fillStyle = vig
      ctx.fillRect(0, 0, 560, 560)
      ctx.restore()
    }

    // ===== 倒计时圆环渲染 =====
    const drawRing = (remainMs, totalMs, urgent, running) => {
      const ctx = rctx
      const C = 210
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, 420, 420)
      const R = 172
      const k = totalMs > 0 ? Math.max(0, Math.min(1, remainMs / totalMs)) : 0
      // 底轨
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)'
      ctx.lineWidth = 14
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.arc(C, C, R, 0, Math.PI * 2)
      ctx.stroke()
      // 进度弧（剩余比例，顺时针从顶部）
      if (k > 0) {
        const col = urgent ? '#f87171' : '#38bdf8'
        const grad = ctx.createLinearGradient(C, C - R, C, C + R)
        grad.addColorStop(0, urgent ? '#fca5a5' : '#7dd3fc')
        grad.addColorStop(1, urgent ? '#ef4444' : '#fbbf24')
        ctx.strokeStyle = grad
        ctx.shadowColor = col
        ctx.shadowBlur = running ? 16 : 6
        ctx.lineWidth = 14
        ctx.beginPath()
        ctx.arc(C, C, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k)
        ctx.stroke()
        ctx.shadowBlur = 0
        // 弧端光点
        const ea = -Math.PI / 2 + Math.PI * 2 * k
        const ex = C + Math.cos(ea) * R
        const ey = C + Math.sin(ea) * R
        ctx.fillStyle = urgent ? '#fca5a5' : '#fde68a'
        ctx.shadowColor = ctx.fillStyle
        ctx.shadowBlur = 14
        ctx.beginPath()
        ctx.arc(ex, ey, 8, 0, Math.PI * 2)
        ctx.fill()
        ctx.shadowBlur = 0
      }
    }

    // ===== 数字格式化 =====
    const swText = (ms) => {
      const cs = Math.floor((ms % 1000) / 10)
      const s = Math.floor(ms / 1000)
      return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}.${pad(cs)}`
    }
    const cdText = (ms) => {
      const s = Math.ceil(ms / 1000)
      return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`
    }

    let lastCdSec = -1
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const v = viewRef.current

      if (v === 'clock') {
        drawDial()
        const now = new Date()
        if (clockDigitsRef.current) {
          clockDigitsRef.current.textContent =
            `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
        }
        if (clockDateRef.current) {
          clockDateRef.current.textContent =
            `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} 星期${WEEKDAYS[now.getDay()]}`
        }
      }

      if (v === 'stopwatch' && swDigitsRef.current) {
        const sw = swRef.current
        const cur = sw.running ? sw.acc + (performance.now() - sw.lastMark) : sw.acc
        swDigitsRef.current.textContent = swText(cur)
      }

      if (v === 'countdown') {
        const cd = cdRef.current
        const info = cdInfoRef.current
        if (cd.running) {
          const nowTs = performance.now()
          cd.remain = Math.max(0, cd.remain - (nowTs - cd.lastTs))
          cd.lastTs = nowTs
          if (cd.remain <= 0) {
            cd.running = false
            cd.justDone = true
            setCdInfo((prev) => ({ ...prev, remain: 0 }))
            setCdPhase('done')
            if (soundRef.current) sfx.chime()
            burst()
          }
        }
        // remMs 是唯一显示口径（毫秒）
        let remMs = cd.running ? cd.remain : info.remain * 1000
        if (!cd.running && cd.justDone) remMs = 0
        const urgent = remMs > 0 && remMs <= 10000
        drawRing(remMs, info.total * 1000, urgent, cd.running)
        if (cdDigitsRef.current) {
          cdDigitsRef.current.textContent = cdText(remMs)
          cdDigitsRef.current.classList.toggle('urgent', urgent)
        }
        if (cdStateRef.current) {
          cdStateRef.current.textContent =
            cdPhaseRef.current === 'running' ? (urgent ? '最后冲刺！' : '进行中')
            : cdPhaseRef.current === 'paused' ? '已暂停'
            : cdPhaseRef.current === 'done' ? '时间到！'
            : '待命'
        }
        // 末 10 秒滴答（每整秒一次）
        const whole = Math.ceil(remMs / 1000)
        if (cd.running && urgent && whole !== lastCdSec) {
          lastCdSec = whole
          if (soundRef.current) sfx.spinTick()
        } else if (!cd.running) {
          lastCdSec = -1
        }
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [burst])

  const now = new Date()
  const swCur = swRef.current
  const swMs = swCur.running ? swCur.acc + (performance.now() - swCur.lastMark) : swCur.acc
  const bestLap = swLaps.length >= 2 ? Math.min(...swLaps.map((l) => l.lap)) : null
  const worstLap = swLaps.length >= 2 ? Math.max(...swLaps.map((l) => l.lap)) : null
  const fmtLap = (ms) => {
    const cs = Math.floor((ms % 1000) / 10)
    const s = Math.floor(ms / 1000)
    return `${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}.${pad(cs)}`
  }

  return (
    <div className="gm-wrap">
      <header className="gm-header gm-header-row">
        <div>
          <p className="gm-kicker" style={{ color: 'rgba(251, 191, 36, 0.85)' }}>CHRONO LAB</p>
          <h1 className="gm-title gm-title-sm">趣味时钟</h1>
        </div>
        <Link to="/" className="gm-back gm-back-top">← 返回首页</Link>
      </header>

      <section className="gm-panel fc-panel">
        <div className="fc-toolbar">
          <div className="gm-seg">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                type="button"
                className={`gm-seg-btn ${view === v.id ? 'active' : ''}`}
                onClick={() => { setView(v.id); if (soundOn) sfx.ui() }}
              >
                {v.name}
              </button>
            ))}
          </div>
          <div className="fc-toolbar-right">
            <button type="button" className="ms-chip" onClick={() => setSoundOn((v) => !v)}>{soundOn ? '🔊' : '🔇'}</button>
          </div>
        </div>

        {/* —— 表盘（常驻挂载：RAF 循环需要两个 canvas 同时存在）—— */}
        <div className="fc-clockwrap" style={{ display: view === 'clock' ? undefined : 'none' }}>
            <canvas ref={dialRef} className="fc-dial" />
            <div className="fc-digital">
              <span className="fc-digital-time" ref={clockDigitsRef}>00:00:00</span>
              <span className="fc-digital-date" ref={clockDateRef}>----.--.--</span>
            </div>
            <p className="gk-tip">秒针按真实机械表 1/60Hz 连续扫动；6 点位月相窗随当地时刻昼夜流转。</p>
          </div>

        {/* —— 秒表 —— */}
        {view === 'stopwatch' && (
          <div className="fc-stopwatch">
            <div className={`fc-sw-digits ${swRunning ? 'running' : ''}`} ref={swDigitsRef}>00:00:00.00</div>
            <div className="fc-sw-actions">
              <button type="button" className="gm-btn-start" onClick={swStartStop}>{swRunning ? '暂停' : swCur.acc > 0 ? '继续' : '启动'}</button>
              <button type="button" className="ms-chip fc-chip-lg" disabled={!swRunning} onClick={swLap}>计次</button>
              <button type="button" className="ms-chip fc-chip-lg" disabled={swRunning || (!swCur.acc && !swLaps.length)} onClick={swReset}>复位</button>
            </div>
            {swLaps.length > 0 && (
              <div className="fc-laps">
                <div className="fc-laps-head">
                  <span>圈</span><span>单圈</span><span>累计</span>
                </div>
                <div className="fc-laps-list">
                  {swLaps.map((l) => (
                    <div key={l.n} className="fc-lap-row">
                      <span className="fc-lap-n">
                        {l.n === swLaps.length && <i className="fc-lap-dot" />}
                        #{l.n}
                      </span>
                      <span className={l.lap === bestLap ? 'good' : l.lap === worstLap ? 'bad' : ''}>{fmtLap(l.lap)}</span>
                      <span className="fc-lap-total">{fmtLap(l.total)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* —— 倒计时（常驻挂载）—— */}
        <div className="fc-countdown" style={{ display: view === 'countdown' ? undefined : 'none' }}>
            <div className="fc-cd-presets">
              {CD_PRESETS.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`ms-chip ${cdInfo.total === m * 60 ? 'fc-chip-active' : ''}`}
                  disabled={cdPhase === 'running'}
                  onClick={() => cdApplyPreset(m)}
                >
                  {m} 分钟
                </button>
              ))}
            </div>
            <div className="fc-ringwrap">
              <canvas ref={ringRef} className="fc-ring" />
              <div className="fc-ring-center">
                <span className={`fc-cd-digits ${cdInfo.remain <= 10 && cdInfo.remain > 0 ? 'urgent' : ''}`} ref={cdDigitsRef}>
                  {pad(Math.floor(cdInfo.remain / 60))}:{pad(cdInfo.remain % 60)}
                </span>
                <span className="fc-cd-state" ref={cdStateRef}>待命</span>
              </div>
            </div>
            <div className="fc-cd-actions">
              <button type="button" className="gm-btn-start" onClick={cdStartStop}>
                {cdPhase === 'running' ? '暂停' : cdPhase === 'paused' ? '继续' : cdPhase === 'done' ? '再来一轮' : '启动'}
              </button>
              <button type="button" className="ms-chip fc-chip-lg" disabled={cdPhase === 'running'} onClick={() => cdSet(-60)}>−1 分</button>
              <button type="button" className="ms-chip fc-chip-lg" disabled={cdPhase === 'running'} onClick={() => cdSet(-10)}>−10 秒</button>
              <button type="button" className="ms-chip fc-chip-lg" disabled={cdPhase === 'running'} onClick={() => cdSet(10)}>+10 秒</button>
              <button type="button" className="ms-chip fc-chip-lg" disabled={cdPhase === 'running'} onClick={() => cdSet(60)}>+1 分</button>
              <button type="button" className="ms-chip fc-chip-lg" disabled={cdPhase === 'idle' && cdInfo.remain === cdInfo.total} onClick={cdReset}>复位</button>
            </div>
            <p className="gk-tip">圆环显示剩余比例；最后 10 秒变红并滴答提示，归零时响铃撒花。上次选择的时长会记住。</p>
          </div>

        <ConfettiLayer pieces={confetti} />
      </section>
    </div>
  )
}
