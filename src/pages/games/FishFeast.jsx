import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { sfx } from '../../utils/sound'
import { useConfetti, ConfettiLayer } from '../../components/Confetti'
import './games.css'
import './fish.css'

// 大鱼吃小鱼：Kenney Fish Pack（CC0）精灵 + 自研成长规则
// 玩法：吃掉比你小的鱼会长大，体型解锁更大的猎物；比你大的鱼会吃掉你

const DIFFS = [
  { id: 'easy', name: '简单', desc: '猎物更密、天敌更慢' },
  { id: 'hard', name: '困难', desc: '天敌又快又多' },
]

const SPRITES = {
  fish: ['blue', 'brown', 'green', 'grey', 'orange', 'pink', 'red'],
  skeleton: ['blue', 'green', 'orange', 'pink', 'red'],
  long: ['grey_long_a', 'grey_long_b'],
}
const img = (name) => `/games/fish/${name}.png`
// drawImage 只接受 Image 对象：全部素材经统一缓存预加载，未加载完成时跳过绘制
const IMG_CACHE = {}
const loadImg = (src) => {
  if (!IMG_CACHE[src]) {
    const el = new Image()
    el.src = src
    IMG_CACHE[src] = el
  }
  return IMG_CACHE[src]
}
const FISH_SRC = Object.fromEntries(SPRITES.fish.map((c) => [c, loadImg(img(`fish_${c}`))]))
const LONG_SRC = Object.fromEntries(SPRITES.long.map((c) => [c, loadImg(img(`fish_${c}`))]))
const SKEL_SRC = Object.fromEntries(SPRITES.skeleton.map((c) => [c, loadImg(img(`fish_${c}_skeleton`))]))
const BUBBLE_SRC = [img('bubble_a'), img('bubble_b'), img('bubble_c')].map(loadImg)
const WEED_SRC = [img('seaweed_grass_a'), img('seaweed_grass_b')].map(loadImg)
const ROCK_SRC = [img('background_rock_a'), img('background_rock_b')].map(loadImg)

const ready = (el) => el.complete && el.naturalWidth > 0

// Kenney 鱼在 128×128 画布里的可见身体约 104×56（朝右）。
// 要让「可见身长 = len」，把整张精灵图按 1.23 倍 len 绘制。
const SPRITE_SCALE = 128 / 104

const STAGES = [
  { name: '鱼苗', len: 0 },
  { name: '小鱼', len: 62 },
  { name: '大鱼', len: 88 },
  { name: '深海霸主', len: 118 },
]
const LEN_MAX = 150
const START_LEN = 46

const CW = 800, CH = 520

const rand = (a, b) => a + Math.random() * (b - a)
const pick = (arr) => arr[(Math.random() * arr.length) | 0]

const LEVELS = {
  easy: { speed: 0.85, threat: 0.18, pop: 12, eatRatio: 0.92, dangerRatio: 1.12, threatSpread: 0.38 },
  hard: { speed: 1.12, threat: 0.3, pop: 13, eatRatio: 0.88, dangerRatio: 1.1, threatSpread: 0.5 },
}

// 底部装饰：岩石 + 水草（位置固定，绘制时随时间轻摆）
const ROCKS = Array.from({ length: 4 }, (_, i) => ({
  x: 70 + i * 215 + (i % 2) * 42,
  src: ROCK_SRC[i % 2],
  s: 74 + (i % 3) * 18,
}))
const WEEDS = Array.from({ length: 6 }, (_, i) => ({
  x: 34 + i * 138 + (i % 3) * 22,
  src: WEED_SRC[i % 2],
  s: 86 + (i % 3) * 22,
}))

function stageOf(len) {
  let s = 0
  for (let i = 0; i < STAGES.length; i++) if (len >= STAGES[i].len) s = i
  return s
}

function makePlayer() {
  return {
    x: CW / 2, y: CH / 2, vx: 0, vy: 0,
    len: START_LEN, facing: 1,
    gulpT: 0, hurtT: 0, invT: 0,
  }
}

function makeFish(len, opts = {}) {
  const isLong = !!opts.threat && Math.random() < 0.35
  const dir = Math.random() < 0.5 ? 1 : -1
  const baseSpeed = isLong ? rand(105, 150) : rand(38, 92)
  return {
    x: dir > 0 ? -len : CW + len,
    y: rand(46, CH - 60),
    vx: dir * baseSpeed * (opts.speedMul ?? 1),
    len,
    color: isLong ? pick(SPRITES.long) : pick(SPRITES.fish),
    isLong,
    wob: rand(0, Math.PI * 2),
    bobA: rand(4, 12),
    bobF: rand(0.8, 1.8),
  }
}

const readRecord = (diff) => {
  try {
    const r = JSON.parse(localStorage.getItem(`fish-record-${diff}`) ?? 'null')
    return r ?? { best: 0, wins: 0 }
  } catch { return { best: 0, wins: 0 } }
}

export default function FishFeast() {
  const canvasRef = useRef(null)
  const [difficulty, setDifficulty] = useState(() => localStorage.getItem('fish-diff') ?? 'easy')
  const [status, setStatus] = useState('idle') // idle | playing | over
  const [result, setResult] = useState(null) // 'win' | 'lose'
  const [hud, setHud] = useState({ score: 0, combo: 1, lives: 3, stage: 0, progress: 0 })
  const [records, setRecords] = useState(() => ({ easy: readRecord('easy'), hard: readRecord('hard') }))
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem('fish-sound') !== 'off')
  const { pieces: confetti, burst } = useConfetti({
    colors: ['#4ade80', '#60a5fa', '#7dd3fc', '#fbbf24', '#f472b6'],
  })

  const worldRef = useRef(null)
  const pointerRef = useRef(null)
  const keysRef = useRef(new Set())
  const soundRef = useRef(soundOn)
  soundRef.current = soundOn
  const diffRef = useRef(difficulty)
  diffRef.current = difficulty
  const statusRef = useRef(status)
  statusRef.current = status
  const hudTimerRef = useRef(0)

  useEffect(() => {
    try {
      localStorage.setItem('fish-diff', difficulty)
      localStorage.setItem('fish-sound', soundOn ? 'on' : 'off')
    } catch { /* 忽略 */ }
  }, [difficulty, soundOn])

  // ---------- 世界 ----------
  const resetWorld = useCallback(() => {
    const lv = LEVELS[diffRef.current]
    const fishes = []
    // 开局池不放假天敌，让玩家有几秒安全熟悉期
    for (let i = 0; i < lv.pop; i++) fishes.push(makeFish(rand(26, 50), { speedMul: lv.speed }))
    worldRef.current = {
      player: makePlayer(),
      fishes,
      corpses: [], // 吃掉后上浮的骨架
      bubbles: [],
      flashes: [],
      t: 0,
      lives: 3,
      score: 0, combo: 1, comboT: 0, eaten: 0, apexEaten: 0,
      lastStage: 0,
      spawnT: 0,
      shake: 0,
    }
    setHud({ score: 0, combo: 1, lives: 3, stage: 0, progress: 0 })
  }, [])

  const finish = useCallback((res) => {
    setStatus('over')
    setResult(res)
    const w = worldRef.current
    const diff = diffRef.current
    // 结算瞬间把 HUD 同步到终值（生命/分数不再等节拍器）
    const st = stageOf(w.player.len)
    const lo = st === 0 ? START_LEN : STAGES[st].len
    const hi = st < STAGES.length - 1 ? STAGES[st + 1].len : LEN_MAX
    setHud({
      score: w.score, combo: w.combo,
      lives: Math.max(0, w.lives), stage: st,
      progress: Math.min(1, (w.player.len - lo) / (hi - lo)),
    })
    setRecords((prev) => {
      const rec = {
        best: Math.max(prev[diff].best, w.score),
        wins: prev[diff].wins + (res === 'win' ? 1 : 0),
      }
      try { localStorage.setItem(`fish-record-${diff}`, JSON.stringify(rec)) } catch { /* 忽略 */ }
      return { ...prev, [diff]: rec }
    })
    if (res === 'win') {
      if (soundRef.current) sfx.win()
      burst()
    } else if (soundRef.current) {
      sfx.over()
    }
  }, [burst])

  // ---------- 生成 ----------
  const spawnOne = useCallback(() => {
    const w = worldRef.current
    const lv = LEVELS[diffRef.current]
    const p = w.player
    let len
    if (Math.random() < lv.threat) {
      // 天敌：比玩家大一圈，其中部分是长条掠食鱼
      len = p.len * rand(lv.dangerRatio, lv.dangerRatio + lv.threatSpread)
    } else {
      // 猎物：多半明显更小，少数接近可吃上限
      len = p.len * (Math.random() < 0.72 ? rand(0.32, 0.72) : rand(0.7, lv.eatRatio + 0.02))
    }
    len = Math.max(24, Math.min(len, 170))
    w.fishes.push(makeFish(len, { threat: len > p.len * lv.dangerRatio, speedMul: lv.speed }))
  }, [])

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

    const drawSprite = (src, x, y, len, facing, rot = 0, alpha = 1) => {
      if (!ready(src)) return
      const s = len * SPRITE_SCALE
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(rot)
      ctx.scale(facing * (s / 128), s / 128)
      ctx.globalAlpha = alpha
      ctx.drawImage(src, -64, -64)
      ctx.restore()
    }

    const step = (now) => {
      raf = requestAnimationFrame(step)
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      const w = worldRef.current
      if (!w) {
        // idle 兜底：画一帧静水
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        const g = ctx.createLinearGradient(0, 0, 0, CH)
        g.addColorStop(0, '#14375c')
        g.addColorStop(1, '#081827')
        ctx.fillStyle = g
        ctx.fillRect(0, 0, CW, CH)
        return
      }
      w.t += dt

      // ===== 更新 =====
      if (statusRef.current === 'playing') {
        const p = w.player
        const lv = LEVELS[diffRef.current]

        // 玩家操控：指针目标 + 键盘速度
        const keys = keysRef.current
        let kx = 0, ky = 0
        if (keys.has('ArrowLeft') || keys.has('a')) kx -= 1
        if (keys.has('ArrowRight') || keys.has('d')) kx += 1
        if (keys.has('ArrowUp') || keys.has('w')) ky -= 1
        if (keys.has('ArrowDown') || keys.has('s')) ky += 1
        const maxV = 340
        if (kx || ky) {
          const m = Math.hypot(kx, ky)
          p.vx += (kx / m) * maxV * 4 * dt
          p.vy += (ky / m) * maxV * 4 * dt
        } else if (pointerRef.current) {
          const tx = pointerRef.current.x - p.x
          const ty = pointerRef.current.y - p.y
          const d = Math.hypot(tx, ty)
          if (d > 6) {
            const sp = Math.min(maxV, d * 5)
            p.vx += (tx / d) * sp * 6 * dt
            p.vy += (ty / d) * sp * 6 * dt
          }
        }
        p.vx *= Math.pow(0.0018, dt)
        p.vy *= Math.pow(0.0018, dt)
        const v = Math.hypot(p.vx, p.vy)
        if (v > maxV) { p.vx *= maxV / v; p.vy *= maxV / v }
        p.x = Math.max(24, Math.min(CW - 24, p.x + p.vx * dt))
        p.y = Math.max(30, Math.min(CH - 34, p.y + p.vy * dt))
        if (Math.abs(p.vx) > 12) p.facing = p.vx > 0 ? 1 : -1
        p.gulpT = Math.max(0, p.gulpT - dt)
        p.hurtT = Math.max(0, p.hurtT - dt)
        p.invT = Math.max(0, p.invT - dt)
        w.comboT = Math.max(0, w.comboT - dt)
        if (w.comboT <= 0) w.combo = 1
        w.shake = Math.max(0, w.shake - dt * 3.4)

        // NPC 游动
        for (const f of w.fishes) {
          f.x += f.vx * dt
          f.wob += dt * f.bobF * 2
          f.y += Math.sin(f.wob) * f.bobA * dt
        }
        w.fishes = w.fishes.filter((f) => (f.vx > 0 ? f.x < CW + f.len * 1.4 : f.x > -f.len * 1.4))

        // 补充生成
        w.spawnT -= dt
        if (w.spawnT <= 0 && w.fishes.length < lv.pop + 4) {
          spawnOne()
          w.spawnT = rand(0.35, 1.0)
        }

        // 吞咬判定
        const eatR = p.len * lv.eatRatio
        const dangerR = p.len * lv.dangerRatio
        for (let i = w.fishes.length - 1; i >= 0; i--) {
          const f = w.fishes[i]
          const dx = f.x - p.x
          const dy = f.y - p.y
          const dist = Math.hypot(dx, dy) || 1
          if (dist > (p.len + f.len) * 0.34) continue
          if (f.len < eatR) {
            // 吃掉：成长 + 分数 + 骨架上浮
            w.fishes.splice(i, 1)
            w.eaten++
            w.combo = Math.min(w.combo + 1, 5)
            w.comboT = 2.5
            w.score += Math.round(f.len * (1 + w.combo * 0.2))
            p.len = Math.min(LEN_MAX, p.len + f.len * 0.1)
            p.gulpT = 0.18
            const st = stageOf(p.len)
            if (st > w.lastStage && st > 0) {
              if (soundRef.current) sfx.evolve()
              w.flashes.push({ x: p.x, y: p.y, t: 0, kind: 'evolve', text: `进化 · ${STAGES[st].name}` })
            }
            w.lastStage = st
            if (p.len >= STAGES[3].len) {
              w.apexEaten++
              if (w.apexEaten >= 8) { finish('win') }
            }
            if (soundRef.current) sfx.gulp(Math.round(f.len / 20))
            const sk = SKEL_SRC[f.color] ?? SKEL_SRC[f.color.split('_')[0]]
            if (sk) w.corpses.push({ x: f.x, y: f.y, len: f.len, src: sk, facing: f.vx > 0 ? 1 : -1, t: 0 })
            w.flashes.push({ x: f.x, y: f.y, t: 0, kind: 'eat', text: `+${Math.round(f.len)}` })
            for (let b = 0; b < 4; b++) w.bubbles.push({ x: f.x + rand(-8, 8), y: f.y, r: rand(3, 7), vy: rand(-46, -22), t: 0 })
          } else if (f.len > dangerR && p.invT <= 0) {
            // 被吃：掉命
            w.fishes.splice(i, 1)
            w.lives--
            p.invT = 2.2
            p.hurtT = 0.5
            w.shake = 1
            p.len = Math.max(START_LEN * 0.9, p.len * 0.9)
            p.x -= (dx / dist) * (p.len + f.len) * 0.3
            p.y -= (dy / dist) * (p.len + f.len) * 0.3
            if (soundRef.current) sfx.bite()
            if (w.lives <= 0) { finish('lose') }
          } else if (dist < (p.len + f.len) * 0.3) {
            // 体型接近：互相推开
            const push = 60 * dt
            p.x -= (dx / dist) * push
            p.y -= (dy / dist) * push
          }
        }

        // 骨架与特效
        for (const c of w.corpses) { c.t += dt; c.y -= 26 * dt }
        w.corpses = w.corpses.filter((c) => c.t < 1.6)
        for (const b of w.bubbles) { b.t += dt; b.y += b.vy * dt; b.x += Math.sin(b.t * 5 + b.r) * 10 * dt }
        w.bubbles = w.bubbles.filter((b) => b.y > -12)
        for (const fl of w.flashes) fl.t += dt
        w.flashes = w.flashes.filter((fl) => fl.t < 1)

        // HUD 节流同步
        hudTimerRef.current += dt
        if (hudTimerRef.current > 0.12) {
          hudTimerRef.current = 0
          const st = stageOf(p.len)
          const lo = st === 0 ? START_LEN : STAGES[st].len
          const hi = st < STAGES.length - 1 ? STAGES[st + 1].len : LEN_MAX
          setHud({
            score: w.score, combo: w.combo,
            lives: Math.max(0, w.lives), stage: st,
            progress: Math.min(1, (p.len - lo) / (hi - lo)),
          })
        }
      }

      // ===== 绘制 =====
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const shk = w.shake
      if (shk > 0) ctx.translate(rand(-7, 7) * shk, rand(-5, 5) * shk)

      // 水体渐变
      const grad = ctx.createLinearGradient(0, 0, 0, CH)
      grad.addColorStop(0, '#14375c')
      grad.addColorStop(0.55, '#0d2740')
      grad.addColorStop(1, '#081827')
      ctx.fillStyle = grad
      ctx.fillRect(-10, -10, CW + 20, CH + 20)

      // 光柱
      ctx.save()
      ctx.globalAlpha = 0.07
      ctx.fillStyle = '#bfe3ff'
      for (let i = 0; i < 4; i++) {
        const rx = (i * 230 + w.t * 9) % (CW + 300) - 150
        ctx.beginPath()
        ctx.moveTo(rx, -10)
        ctx.lineTo(rx + 90, -10)
        ctx.lineTo(rx + 210, CH + 10)
        ctx.lineTo(rx + 40, CH + 10)
        ctx.closePath()
        ctx.fill()
      }
      ctx.restore()

      // 环境气泡
      ctx.fillStyle = 'rgba(190, 225, 255, 0.16)'
      for (let i = 0; i < 14; i++) {
        const bx = (i * 173.3) % CW
        const by = CH - ((w.t * (14 + (i % 5) * 7) + i * 97) % (CH + 30))
        ctx.beginPath()
        ctx.arc(bx + Math.sin(w.t + i) * 8, by, 2 + (i % 3), 0, Math.PI * 2)
        ctx.fill()
      }

      // 底部岩石与水草
      for (const r of ROCKS) if (ready(r.src)) ctx.drawImage(r.src, r.x - r.s / 2, CH - r.s * 0.62, r.s, r.s)
      for (let i = 0; i < WEEDS.length; i++) {
        const wd = WEEDS[i]
        if (!ready(wd.src)) continue
        const sway = Math.sin(w.t * 1.2 + i * 1.4) * 0.06
        ctx.save()
        ctx.translate(wd.x, CH - 8)
        ctx.rotate(sway)
        ctx.drawImage(wd.src, -wd.s / 2, -wd.s * 0.9, wd.s, wd.s)
        ctx.restore()
      }

      // 骨架上浮
      for (const c of w.corpses) {
        drawSprite(c.src, c.x, c.y, c.len, c.facing, 0, Math.max(0, 0.9 - c.t * 0.6))
      }

      // NPC 鱼
      for (const f of w.fishes) {
        const rot = Math.sin(f.wob) * 0.05
        drawSprite(FISH_SRC[f.color] ?? LONG_SRC[f.color], f.x, f.y, f.len, f.vx > 0 ? 1 : -1, rot)
        // 天敌警示：体型显著大于玩家时描红圈
        if (statusRef.current === 'playing' && f.len > w.player.len * LEVELS[diffRef.current].dangerRatio) {
          ctx.strokeStyle = 'rgba(248, 113, 113, 0.4)'
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.arc(f.x, f.y, f.len * 0.42, 0, Math.PI * 2)
          ctx.stroke()
        }
      }

      // 玩家
      {
        const p = w.player
        const blink = p.invT > 0 && Math.floor(p.invT * 8) % 2 === 0
        const gulp = 1 + p.gulpT * 0.9
        const swim = Math.sin(w.t * 6) * 0.04 * Math.min(1, Math.hypot(p.vx, p.vy) / 200)
        ctx.save()
        if (p.hurtT > 0) ctx.filter = 'brightness(1.6) sepia(0.5) hue-rotate(-30deg)'
        drawSprite(FISH_SRC.blue, p.x, p.y, p.len * gulp, p.facing, swim, blink ? 0.35 : 1)
        ctx.restore()
      }

      // 进食/进化飘字
      for (const fl of w.flashes) {
        const a = 1 - fl.t
        ctx.save()
        ctx.globalAlpha = a
        ctx.fillStyle = fl.kind === 'evolve' ? '#fbbf24' : '#a5f3fc'
        ctx.font = `700 ${fl.kind === 'evolve' ? 20 : 14}px 'JetBrains Mono', monospace`
        ctx.textAlign = 'center'
        ctx.fillText(fl.text, fl.x, fl.y - 14 - fl.t * 34)
        ctx.restore()
      }

      // 气泡粒子
      for (const b of w.bubbles) {
        ctx.strokeStyle = 'rgba(190, 225, 255, 0.5)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2)
        ctx.stroke()
      }
    }

    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [difficulty, finish, spawnOne])

  // ---------- 输入 ----------
  const toCanvasXY = (clientX, clientY) => {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((clientX - rect.left) / rect.width) * CW,
      y: ((clientY - rect.top) / rect.height) * CH,
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current
    const move = (e) => {
      const t = e.touches ? e.touches[0] : e
      if (t) pointerRef.current = toCanvasXY(t.clientX, t.clientY)
    }
    const touch = (e) => {
      if (e.touches && e.touches.length) {
        e.preventDefault()
        pointerRef.current = toCanvasXY(e.touches[0].clientX, e.touches[0].clientY)
      }
    }
    canvas.addEventListener('mousemove', move)
    canvas.addEventListener('touchstart', touch, { passive: false })
    canvas.addEventListener('touchmove', touch, { passive: false })
    return () => {
      canvas.removeEventListener('mousemove', move)
      canvas.removeEventListener('touchstart', touch)
      canvas.removeEventListener('touchmove', touch)
    }
  }, [])

  useEffect(() => {
    const down = (e) => keysRef.current.add(e.key.length === 1 ? e.key.toLowerCase() : e.key)
    const up = (e) => keysRef.current.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  // ---------- 开局 ----------
  const start = useCallback(() => {
    resetWorld()
    setStatus('playing')
    setResult(null)
    if (soundRef.current) sfx.ui()
  }, [resetWorld])

  const stageName = STAGES[hud.stage].name
  const record = records[difficulty]

  return (
    <div className="gm-wrap">
      <header className="gm-header gm-header-row">
        <div>
          <p className="gm-kicker" style={{ color: 'rgba(125, 211, 252, 0.85)' }}>FISH FEAST</p>
          <h1 className="gm-title gm-title-sm">大鱼吃小鱼</h1>
        </div>
        <Link to="/games" className="gm-back gm-back-top">← 返回街机</Link>
      </header>

      <section className="gm-panel ff-panel">
        <div className="ff-toolbar">
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
          <div className="ff-toolbar-right">
            <button type="button" className="ms-chip" onClick={start}>{status === 'playing' ? '重新开始' : '开始游戏'}</button>
            <button type="button" className="ms-chip" onClick={() => setSoundOn((v) => !v)}>{soundOn ? '🔊' : '🔇'}</button>
          </div>
        </div>

        <div className="ff-hud">
          <span className="wf-stat">分数<b>{hud.score}</b></span>
          <span className="wf-stat">连击<b>×{hud.combo}</b></span>
          <span className="wf-stat">生命<b>{'❤'.repeat(hud.lives) || '—'}</b></span>
          <span className="wf-stat">成长<b>{stageName}</b></span>
          <span className="wf-stat">{difficulty === 'hard' ? '困难' : '简单'}战绩<b>最高 {record.best} · 制霸 {record.wins}</b></span>
        </div>

        <div className="ff-growth">
          <span className="ff-growth-label">体型</span>
          <div className="ff-growth-track">
            {STAGES.slice(1).map((s) => (
              <i key={s.name} className="ff-growth-mark" style={{ left: `${(s.len / LEN_MAX) * 100}%` }} title={s.name} />
            ))}
            <i className="ff-growth-fill" style={{ width: `${hud.progress * 100}%` }} data-stage={hud.stage} />
          </div>
        </div>

        <div className="gk-shell ff-shell">
          <canvas ref={canvasRef} className="ff-canvas" />
          {status === 'idle' && (
            <div className="gk-overlay">
              <p className="gk-overlay-title">大鱼吃小鱼 · 深海食记</p>
              <p className="gk-overlay-sub">
                吃掉比你小的鱼会慢慢长大，体型够大才能咬动更大的猎物。<br />
                带红圈的鱼比你大——被咬到会掉一颗生命。升到「深海霸主」再吃 8 条即制霸。
              </p>
              <div className="gk-overlay-actions">
                <button type="button" className="gm-btn-start" onClick={start}>入水觅食</button>
              </div>
            </div>
          )}
          {status === 'over' && (
            <div className="gk-overlay gk-overlay-lite">
              <p className="gk-overlay-title">
                {result === 'win' ? '制霸深海！' : '葬身鱼腹…'}
              </p>
              <p className="gk-overlay-sub">
                最终分数 {hud.score} · 吃掉 {worldRef.current?.eaten ?? 0} 条 · 体型 {stageName}
              </p>
              <div className="gk-overlay-actions">
                <button type="button" className="gm-btn-start" onClick={start}>再来一局</button>
              </div>
            </div>
          )}
          <ConfettiLayer pieces={confetti} />
        </div>

        <p className="gk-tip">鼠标 / 手指拖动控鱼，方向键或 WASD 也能游。连击吃得越快，分数倍率越高（最高 ×5）。</p>
      </section>
    </div>
  )
}
