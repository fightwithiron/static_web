import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { sfx } from '../../utils/sound'
import { useConfetti, ConfettiLayer } from '../../components/Confetti'
import './games.css'
import './duel.css'

// 剑客对决：1v1 剑斗（玩家 vs AI）
// 素材：HTML5_Platformer（MIT）英雄精灵 + Ansimuz 山景视差（CC0）
// 设计参考格斗游戏帧数据共识：启动/判定/收招三段 + hitstop 顿帧 + 防御削减

const DIFFS = [
  { id: 'easy', name: '简单', desc: '青岚：反应慢，出招随意' },
  { id: 'hard', name: '困难', desc: '玄影：会格挡、会惩罚你的收招' },
]
const AI_NAME = { easy: '青岚', hard: '玄影' }

const CW = 960, CH = 540
const GROUND_Y = 470
const WALL_L = 56, WALL_R = CW - 56
const SCALE = 2.3
const FW = 100, FH = 59 // 精灵帧原始尺寸

// —— 帧数据（秒）——
// 轻斩：快启动短距离；重斩：慢启动长距离大伤害（节奏刻意拉开）
const MOVES = {
  s1: { startup: 0.1, active: 0.07, recovery: 0.15, dmg: 8, range: 104, kb: 70, hitstun: 0.24, blockstun: 0.16, hitstop: 0.06,
    plan: { startup: [0, 1], active: [2, 3], recovery: [4] } },
  s2: { startup: 0.18, active: 0.08, recovery: 0.3, dmg: 16, range: 122, kb: 210, hitstun: 0.38, blockstun: 0.26, hitstop: 0.11,
    plan: { startup: [0, 1, 2], active: [3, 4], recovery: [0, 1] } },
}
const CHIP = 0.15
const MAX_HP = 100
const WALK_FWD = 250, WALK_BACK = 198
const JUMP_VY = -650, GRAVITY = 1750

// —— 精灵装载（右/左各一套；AI 一套红色调变体）+ 视差背景层 ——
const SHEETS = {
  idleR: '/games/fight/hero-idle-right.png', idleL: '/games/fight/hero-idle-left.png',
  runR: '/games/fight/hero-run-right.png', runL: '/games/fight/hero-run-left.png',
  atkR: '/games/fight/hero-attack-right.png', atkL: '/games/fight/hero-attack-left.png',
  jumpR: '/games/fight/hero-jump-right.png', jumpL: '/games/fight/hero-jump-left.png',
  hurtR: '/games/fight/hero-hurt-right.png', hurtL: '/games/fight/hero-hurt-left.png',
  guardR: '/games/fight/hero-crouch-right.png', guardL: '/games/fight/hero-crouch-left.png',
  bgL: '/games/fight/parallax-mountain-bg.png',
  farL: '/games/fight/parallax-mountain-montain-far.png',
  mtsL: '/games/fight/parallax-mountain-mountains.png',
  treesL: '/games/fight/parallax-mountain-trees.png',
  ftreesL: '/games/fight/parallax-mountain-foreground-trees.png',
}
const FRAME_COUNT = { idle: 4, run: 6, atk: 5, jump: 4, hurt: 1, guard: 1 }

const IMG = {}
const TINTED = {}
function loadSprites() {
  for (const [k, src] of Object.entries(SHEETS)) {
    if (!IMG[k]) {
      const el = new Image()
      el.src = src
      IMG[k] = el
    }
  }
}
// AI 调色：整体色相偏移 + 压暗，与玩家区分
function tintedVariant(key) {
  if (TINTED[key]) return TINTED[key]
  const base = IMG[key]
  if (!base || !base.complete || !base.naturalWidth) return null
  const c = document.createElement('canvas')
  c.width = base.naturalWidth
  c.height = base.naturalHeight
  const g = c.getContext('2d')
  g.drawImage(base, 0, 0)
  g.globalCompositeOperation = 'source-atop'
  g.fillStyle = 'rgba(226, 74, 74, 0.42)'
  g.fillRect(0, 0, c.width, c.height)
  g.globalCompositeOperation = 'source-atop'
  g.fillStyle = 'rgba(20, 8, 24, 0.25)'
  g.fillRect(0, 0, c.width, c.height)
  TINTED[key] = c
  return c
}
loadSprites()

const rand = (a, b) => a + Math.random() * (b - a)

function makeFighter(side, x) {
  return {
    side, x, y: GROUND_Y, vx: 0, vy: 0,
    hp: MAX_HP, facing: side > 0 ? 1 : -1,
    state: 'idle', // idle | run | jump | attack | hurt | guard | ko
    t: 0, // 当前状态计时
    anim: 0,
    moveDir: 0, // -1/0/1 本次 update 的移动意图
    guardHold: false,
    attack: null, // { type, t, phase, hitDone }
    buffer: null, // 缓存的下一招 { type, t }
    flash: 0,
    onGround: true,
    aiTimer: 0, aiGuardT: 0, aiRetreatT: 0, aiPlan: null,
  }
}

const readRecord = (diff) => {
  try {
    const r = JSON.parse(localStorage.getItem(`duel-record-${diff}`) ?? 'null')
    return r ?? { w: 0, l: 0 }
  } catch { return { w: 0, l: 0 } }
}

export default function Duel() {
  const canvasRef = useRef(null)
  const [difficulty, setDifficulty] = useState(() => localStorage.getItem('duel-diff') ?? 'easy')
  const [status, setStatus] = useState('idle') // idle | intro | fight | over
  const [hud, setHud] = useState({ p1: MAX_HP, p2: MAX_HP, round: 1, wins1: 0, wins2: 0, time: 60 })
  const [matchResult, setMatchResult] = useState(null) // 'win' | 'lose'
  const [records, setRecords] = useState(() => ({ easy: readRecord('easy'), hard: readRecord('hard') }))
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem('duel-sound') !== 'off')
  const { pieces: confetti, burst } = useConfetti({
    colors: ['#fbbf24', '#60a5fa', '#f87171', '#4ade80', '#fde68a'],
  })

  const worldRef = useRef(null)
  const inputRef = useRef({ left: false, right: false, jump: false, s1: false, s2: false, guard: false })
  const pressRef = useRef({ s1: 0, s2: 0 }) // 按键边沿时间戳
  const soundRef = useRef(soundOn)
  soundRef.current = soundOn
  const diffRef = useRef(difficulty)
  diffRef.current = difficulty
  const statusRef = useRef(status)
  statusRef.current = status
  const hudTimerRef = useRef(0)
  const touchRef = useRef({})

  useEffect(() => {
    try {
      localStorage.setItem('duel-diff', difficulty)
      localStorage.setItem('duel-sound', soundOn ? 'on' : 'off')
    } catch { /* 忽略 */ }
  }, [difficulty, soundOn])

  // ---------- 回合 ----------
  const startRound = useCallback((round, wins1, wins2) => {
    worldRef.current = {
      p1: makeFighter(1, 300),
      p2: makeFighter(-1, 660),
      round, wins1, wins2,
      banner: { text: `ROUND ${round}`, t: 0 },
      introT: 1.25,
      fightT: 60,
      hitstop: 0,
      slowmo: 0,
      shake: 0,
      sparks: [],
      drift: 0,
      koT: 0,
      over: null, // 'p1' | 'p2' 回合胜者
    }
  }, [])

  const startMatch = useCallback(() => {
    startRound(1, 0, 0)
    setStatus('intro')
    setMatchResult(null)
    if (soundRef.current) { sfx.roundBell() }
  }, [startRound])

  const endMatch = useCallback((res) => {
    setStatus('over')
    setMatchResult(res)
    const diff = diffRef.current
    setRecords((prev) => {
      const rec = { w: prev[diff].w + (res === 'win' ? 1 : 0), l: prev[diff].l + (res === 'lose' ? 1 : 0) }
      try { localStorage.setItem(`duel-record-${diff}`, JSON.stringify(rec)) } catch { /* 忽略 */ }
      return { ...prev, [diff]: rec }
    })
    if (res === 'win') {
      if (soundRef.current) sfx.win()
      burst()
    } else if (soundRef.current) sfx.over()
  }, [burst])

  // ---------- 判定 ----------
  const bodyRect = (f) => ({ x: f.x - 38, y: f.y - 122, w: 76, h: 122 })
  const attackRect = (f) => {
    const m = MOVES[f.attack.type]
    const reach = m.range
    return f.facing > 0
      ? { x: f.x + 18, y: f.y - 108, w: reach, h: 78 }
      : { x: f.x - 18 - reach, y: f.y - 108, w: reach, h: 78 }
  }
  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

  const applyHit = useCallback((att, def, m) => {
    const w = worldRef.current
    const blocked = def.state === 'guard' && ((def.x - att.x) * att.facing > 0)
    const sparkX = def.x - att.facing * 26
    const sparkY = def.y - 74
    w.sparks.push({ x: sparkX, y: sparkY, t: 0, kind: blocked ? 'block' : 'hit' })
    w.hitstop = m.hitstop
    w.shake = Math.min(1, (blocked ? 4 : m.dmg) / 14)
    if (blocked) {
      const chip = Math.max(1, Math.round(m.dmg * CHIP))
      def.hp = Math.max(0, def.hp - chip)
      def.vx = att.facing * m.kb * 0.55
      def.lockT = m.blockstun // 防御硬直：短暂不能撤销格挡/移动
      if (soundRef.current) sfx.clank()
    } else {
      def.hp = Math.max(0, def.hp - m.dmg)
      def.state = 'hurt'
      def.t = 0
      def.hurtDur = m.hitstun
      def.attack = null
      def.vx = att.facing * m.kb
      def.flash = 0.18
      if (def.onGround && def.hp > 0) def.vy = -80
      if (soundRef.current) sfx.hitHeavy()
    }
    if (def.hp <= 0) {
      def.state = 'ko'
      def.vx = att.facing * 240
      def.vy = -330
      def.onGround = false
      w.banner = { text: 'K.O.', t: 0 }
      w.slowmo = 0.9
      w.koT = 0.001
      if (soundRef.current) sfx.koGong()
    }
  }, [])

  // ---------- 单帧更新 ----------
  const updateFighter = useCallback((f, foe, dt, isPlayer) => {
    const w = worldRef.current
    const fighting = statusRef.current === 'fight' && w.introT <= 0 && w.koT === 0

    // 面向对手（攻击/倒地中不转）
    if (f.state !== 'attack' && f.state !== 'ko' && f.state !== 'hurt') {
      f.facing = foe.x >= f.x ? 1 : -1
    }
    f.flash = Math.max(0, f.flash - dt)
    f.anim += dt

    // 状态推进
    f.t += dt
    f.lockT = Math.max(0, (f.lockT ?? 0) - dt)
    if (f.state === 'hurt' && f.t >= (f.hurtDur ?? 0.24)) { f.state = 'idle'; f.t = 0 }

    // —— 意图输入 ——
    let wantMove = 0
    let wantJump = false
    let wantGuard = false
    let wantAttack = null
    let consumed = null

    if (isPlayer) {
      const inp = inputRef.current
      wantMove = (inp.right ? 1 : 0) - (inp.left ? 1 : 0)
      wantJump = inp.jump
      wantGuard = inp.guard
      // 边沿触发的攻击 + 120ms 输入缓冲
      const now = performance.now()
      if (now - pressRef.current.s1 < 130) wantAttack = 's1'
      if (now - pressRef.current.s2 < 130) wantAttack = 's2'
    } else {
      // —— AI 决策 ——
      const lv = diffRef.current
      const react = lv === 'hard' ? 0.15 : 0.38
      const thinkEvery = lv === 'hard' ? 0.22 : 0.5
      const dist = Math.abs(foe.x - f.x)
      f.aiTimer -= dt
      f.aiGuardT = Math.max(0, f.aiGuardT - dt)
      f.aiRetreatT = Math.max(0, f.aiRetreatT - dt)

      // 反应性格挡：对手攻击还在启动段且够得着自己
      if (foe.state === 'attack' && foe.attack && dist < MOVES[foe.attack.type].range + 70) {
        const m = MOVES[foe.attack.type]
        if (foe.attack.t < m.startup && f.aiTimer <= 0) {
          const prob = lv === 'hard' ? 0.72 : 0.18
          if (Math.random() < prob) f.aiGuardT = react + m.blockstun + 0.1
          f.aiTimer = react
        }
      }

      if (f.aiTimer <= 0) {
        f.aiTimer = thinkEvery * rand(0.8, 1.25)
        f.aiPlan = null
        // 惩罚：对手在收招段且在射程内
        const foeRecovering = foe.state === 'attack' && foe.attack &&
          foe.attack.t > MOVES[foe.attack.type].startup + MOVES[foe.attack.type].active
        if (foe.state === 'hurt' || (foeRecovering && dist < 130)) {
          f.aiPlan = { kind: 'attack', type: dist < 115 ? 's1' : 's2' }
        } else if (dist > 150) {
          f.aiPlan = { kind: 'approach' }
        } else if (dist < 92) {
          f.aiPlan = { kind: Math.random() < (lv === 'hard' ? 0.55 : 0.3) ? 'retreat' : 'attack', type: 's1' }
        } else {
          const r = Math.random()
          if (lv === 'hard' && r < 0.55) f.aiPlan = { kind: 'attack', type: r < 0.3 ? 's2' : 's1' }
          else if (r < 0.7) f.aiPlan = { kind: 'attack', type: r < 0.35 ? 's2' : 's1' }
          else f.aiPlan = { kind: 'spacing' }
        }
        if (lv === 'hard' && f.aiPlan.kind === 'approach' && dist > 300 && Math.random() < 0.18) {
          f.aiPlan = { kind: 'jumpIn' }
        }
      }

      const plan = f.aiPlan
      if (f.aiGuardT > 0) wantGuard = true
      else if (plan) {
        const fwd = foe.x > f.x ? 1 : -1
        if (plan.kind === 'approach') wantMove = fwd
        else if (plan.kind === 'retreat') { wantMove = -fwd; f.aiRetreatT = 0.25 }
        else if (plan.kind === 'spacing') wantMove = dist > 130 ? fwd : 0
        else if (plan.kind === 'jumpIn') { wantJump = true; wantMove = fwd }
        else if (plan.kind === 'attack' && fighting) wantAttack = plan.type
      }
      if (f.aiRetreatT > 0) wantAttack = null
    }

    // 非战斗阶段（开场演出 / 回合间歇）锁操作
    if (!fighting) {
      wantMove = 0
      wantJump = false
      wantGuard = false
      wantAttack = null
    }
    // 防御硬直：锁定在格挡上
    if (f.lockT > 0 && f.onGround) {
      wantMove = 0
      wantJump = false
      wantAttack = null
      wantGuard = true
    }
    f.moveIntent = wantMove

    // —— 状态机 ——
    if (f.state === 'ko') {
      // 倒地滑行
      f.vx *= Math.pow(0.02, dt)
    } else if (f.state === 'hurt') {
      f.vx *= Math.pow(0.05, dt)
    } else if (f.state === 'attack' && f.attack) {
      const m = MOVES[f.attack.type]
      f.attack.t += dt
      f.vx *= Math.pow(0.001, dt)
      const ph = f.attack.t
      if (ph < m.startup) f.attack.phase = 'startup'
      else if (ph < m.startup + m.active) f.attack.phase = 'active'
      else if (ph < m.startup + m.active + m.recovery) f.attack.phase = 'recovery'
      else {
        f.state = 'idle'
        f.t = 0
        f.attack = null
      }
      // 缓冲招：收招后半段接下一招（连段手感）
      if (f.attack && f.attack.phase === 'recovery' && wantAttack && wantAttack !== f.attack.type) {
        f.buffer = { type: wantAttack, t: 0 }
      }
    } else {
      // idle / run / jump / guard
      const guarding = wantGuard && f.onGround
      if (guarding) {
        if (f.state !== 'guard') { f.state = 'guard'; f.t = 0 }
        wantMove = 0
      } else if (f.state === 'guard') {
        f.state = 'idle'
        f.t = 0
      }

      if (f.onGround && wantJump && fighting) {
        f.vy = JUMP_VY
        f.onGround = false
        f.state = 'jump'
        f.t = 0
        if (soundRef.current) sfx.whoosh()
      }

      if (f.state !== 'jump') {
        if (wantAttack && fighting) {
          f.state = 'attack'
          f.attack = { type: wantAttack, t: 0, phase: 'startup', hitDone: false }
          f.t = 0
          f.buffer = null
          consumed = wantAttack
          if (soundRef.current) sfx.slash()
        } else if (!guarding) {
          const dirSign = f.facing > 0 ? 1 : -1
          const isFwd = wantMove * dirSign > 0
          f.vx = wantMove !== 0 ? wantMove * (isFwd ? WALK_FWD : WALK_BACK) : 0
          f.state = wantMove !== 0 ? 'run' : 'idle'
        } else {
          f.vx = 0
        }
      } else {
        // 空中可出招
        if (wantAttack && fighting) {
          f.state = 'attack'
          f.attack = { type: wantAttack, t: 0, phase: 'startup', hitDone: false, air: true }
          f.t = 0
          consumed = wantAttack
          if (soundRef.current) sfx.slash()
        }
      }
    }

    // 收招后半段释放缓冲招
    if (f.buffer && f.state === 'idle' && fighting) {
      f.state = 'attack'
      f.attack = { type: f.buffer.type, t: 0, phase: 'startup', hitDone: false }
      f.t = 0
      consumed = f.buffer.type
      f.buffer = null
      if (soundRef.current) sfx.slash()
    }
    // 已消费的按键边沿清零，防止 130ms 缓冲窗口内自动连发
    if (consumed && isPlayer) pressRef.current[consumed] = 0

    // —— 物理 ——
    // 空中微操控（跳跃移形）
    if (!f.onGround && (f.state === 'jump' || f.state === 'idle')) {
      f.vx = Math.max(-WALK_FWD, Math.min(WALK_FWD, f.vx + (f.moveIntent ?? 0) * 1500 * dt))
    }
    f.x += f.vx * dt
    f.x = Math.max(WALL_L, Math.min(WALL_R, f.x))
    if (!f.onGround) {
      f.vy += GRAVITY * dt
      f.y += f.vy * dt
      if (f.y >= GROUND_Y) {
        f.y = GROUND_Y
        f.vy = 0
        f.onGround = true
        if (f.state === 'jump' || (f.state === 'attack' && f.attack?.air)) {
          f.state = 'idle'
          f.t = 0
          f.attack = null
        }
      }
    }
  }, [])

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
      let dt = Math.min((now - last) / 1000, 0.04)
      last = now
      const w = worldRef.current

      // ===== 流程 =====
      if (w) {
        if (statusRef.current === 'intro') {
          w.introT -= dt
          if (w.introT <= 0) {
            w.banner = { text: 'FIGHT!', t: 0 }
            setStatus('fight')
            if (soundRef.current) sfx.roundBell()
          }
        }
        if (statusRef.current === 'fight' && w.koT === 0) {
          w.fightT -= dt
          if (w.fightT <= 0) {
            // 时间到：血多者胜该回合
            w.over = w.p1.hp >= w.p2.hp ? 'p1' : 'p2'
            w.banner = { text: 'TIME UP', t: 0 }
            w.koT = 0.001
            w.slowmo = 0.6
            if (w.over === 'p1') {
              w.p2.state = 'ko'
              w.p2.vy = -240
              w.p2.onGround = false
            } else {
              w.p1.state = 'ko'
              w.p1.vy = -240
              w.p1.onGround = false
            }
            if (soundRef.current) sfx.koGong()
          }
        }

        // ===== 更新（hitstop / slowmo）=====
        const slow = w.slowmo > 0 ? 0.3 : 1
        w.slowmo = Math.max(0, w.slowmo - dt)
        const sdt = dt * slow
        w.drift += sdt * 6
        w.shake = Math.max(0, w.shake - dt * 3)
        for (const s of w.sparks) s.t += dt * 3
        w.sparks = w.sparks.filter((s) => s.t < 1)
        if (w.banner) {
          w.banner.t += dt
          if (w.banner.t > 1.4 && w.banner.text !== 'K.O.') w.banner = null
        }

        if (w.hitstop > 0) {
          w.hitstop -= dt // 顿帧：角色冻结，特效照常
        } else if (w.koT === 0) {
          const running = statusRef.current === 'intro' || statusRef.current === 'fight'
          if (running) {
            updateFighter(w.p1, w.p2, sdt, true)
            updateFighter(w.p2, w.p1, sdt, false)
            // 攻击判定
            for (const [att, def] of [[w.p1, w.p2], [w.p2, w.p1]]) {
              if (att.state === 'attack' && att.attack?.phase === 'active' && !att.attack.hitDone) {
                if (overlap(attackRect(att), bodyRect(def))) {
                  att.attack.hitDone = true
                  applyHit(att, def, MOVES[att.attack.type])
                }
              }
            }
            // 身体互推
            const a = w.p1, b = w.p2
            if (Math.abs(a.x - b.x) < 66 && a.state !== 'ko' && b.state !== 'ko') {
              const push = (66 - Math.abs(a.x - b.x)) / 2
              const dir = a.x <= b.x ? -1 : 1
              a.x = Math.max(WALL_L, Math.min(WALL_R, a.x + dir * push))
              b.x = Math.max(WALL_L, Math.min(WALL_R, b.x - dir * push))
            }
          }
          // KO 后倒地滑行
        } else {
          // KO 演出：败者继续飞
          for (const f of [w.p1, w.p2]) {
            if (f.state === 'ko' && !f.onGround) {
              f.vy += GRAVITY * sdt
              f.y += f.vy * sdt
              f.x += f.vx * sdt
              f.x = Math.max(WALL_L, Math.min(WALL_R, f.x))
              if (f.y >= GROUND_Y) {
                f.y = GROUND_Y
                f.onGround = true
                w.shake = 0.7
              }
            }
          }
          w.koT += dt
          if (w.koT > 1.7 && !w.settled) {
            w.settled = true
            // 回合结算
            const winner = w.over ?? (w.p2.hp <= 0 ? 'p1' : 'p2')
            if (winner === 'p1') w.wins1++
            else w.wins2++
            if (w.wins1 >= 2 || w.wins2 >= 2) {
              endMatch(w.wins1 >= 2 ? 'win' : 'lose')
            } else {
              startRound(w.round + 1, w.wins1, w.wins2)
              setStatus('intro')
              if (soundRef.current) sfx.roundBell()
            }
          }
        }

        // HUD 节流
        hudTimerRef.current += dt
        if (hudTimerRef.current > 0.1) {
          hudTimerRef.current = 0
          setHud({ p1: w.p1.hp, p2: w.p2.hp, round: w.round, wins1: w.wins1, wins2: w.wins2, time: Math.ceil(Math.max(0, w.fightT)) })
        }
      }

      // ===== 绘制 =====
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (w && w.shake > 0) ctx.translate(rand(-8, 8) * w.shake, rand(-5, 5) * w.shake)

      // —— 背景（视差山景）——
      const sky = ctx.createLinearGradient(0, 0, 0, CH)
      sky.addColorStop(0, '#2b3560')
      sky.addColorStop(0.55, '#3d4a78')
      sky.addColorStop(1, '#252e50')
      ctx.fillStyle = sky
      ctx.fillRect(-10, -10, CW + 20, CH + 20)
      const drift = w ? w.drift : 0
      const layer = (key, ox, y, h, alpha = 1) => {
        const img = IMG[key]
        if (!img?.complete || !img.naturalWidth) return
        const lw = h * (img.naturalWidth / img.naturalHeight)
        let x = ((ox - drift * 0.4) % lw) - lw
        ctx.globalAlpha = alpha
        while (x < CW) {
          ctx.drawImage(img, x, y, lw, h)
          x += lw
        }
        ctx.globalAlpha = 1
      }
      layer('bgL', 0, 0, CH)
      ctx.fillStyle = 'rgba(37, 46, 80, 0.35)'
      ctx.fillRect(0, 0, CW, CH)
      layer('farL', drift * 0.5, CH - 330, 330, 0.9)
      layer('mtsL', drift * 1.2, CH - 320, 320, 0.95)
      layer('treesL', drift * 2.2, CH - 260, 260, 0.96)
      layer('ftreesL', drift * 3.6, CH - 200, 200)

      // —— 地面 ——
      const gy = GROUND_Y
      const fg = ctx.createLinearGradient(0, gy, 0, CH)
      fg.addColorStop(0, '#232c47')
      fg.addColorStop(1, '#141a30')
      ctx.fillStyle = fg
      ctx.fillRect(0, gy, CW, CH - gy)
      ctx.strokeStyle = 'rgba(190, 205, 235, 0.5)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(0, gy + 1)
      ctx.lineTo(CW, gy + 1)
      ctx.stroke()
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)'
      ctx.lineWidth = 1
      for (let x = ((drift * 2) % 64) - 64; x < CW; x += 64) {
        ctx.beginPath()
        ctx.moveTo(x, gy + 6)
        ctx.lineTo(x - 14, CH)
        ctx.stroke()
      }

      // —— 火把光斑（氛围）——
      for (const tx of [120, CW - 120]) {
        const flick = 0.75 + Math.sin((w ? w.drift : 0) * 3.1 + tx) * 0.12
        const glow = ctx.createRadialGradient(tx, gy - 130, 8, tx, gy - 130, 130)
        glow.addColorStop(0, `rgba(251, 191, 36, ${0.16 * flick})`)
        glow.addColorStop(1, 'rgba(251, 191, 36, 0)')
        ctx.fillStyle = glow
        ctx.fillRect(tx - 130, gy - 260, 260, 260)
      }

      // —— 精灵 ——
      const drawFighter = (f, tinted) => {
        const facing = f.facing
        let key, frame
        const sheetFor = (k) => {
          const dir = facing > 0 ? 'R' : 'L'
          const kk = k + dir
          const base = IMG[kk]
          if (!base?.complete || !base.naturalWidth) return null
          return tinted ? (tintedVariant(kk) ?? base) : base
        }
        if (f.state === 'ko') {
          // 倒地：hurt 帧旋转躺平
          const img = sheetFor('hurt')
          if (!img) return
          const fall = Math.min(1, (f.vy > 0 ? 1 : 0.4))
          ctx.save()
          ctx.translate(f.x, f.y - 20)
          ctx.rotate((f.side > 0 ? -1 : 1) * 1.35 * fall)
          ctx.drawImage(img, 0, 0, FW, FH, -FW * SCALE / 2, -FH * SCALE / 2, FW * SCALE, FH * SCALE)
          ctx.restore()
          return
        }
        if (f.state === 'attack' && f.attack) {
          const m = MOVES[f.attack.type]
          const ph = f.attack.phase
          const plan = m.plan[ph]
          const segT = ph === 'startup' ? f.attack.t
            : ph === 'active' ? f.attack.t - m.startup
            : f.attack.t - m.startup - m.active
          const segDur = ph === 'startup' ? m.startup
            : ph === 'active' ? m.active
            : m.recovery
          frame = plan[Math.min(plan.length - 1, Math.floor((segT / Math.max(segDur, 0.001)) * plan.length))]
          key = 'atk'
        } else if (f.state === 'hurt') {
          key = 'hurt'; frame = 0
        } else if (f.state === 'guard') {
          key = 'guard'; frame = 0
        } else if (f.state === 'jump' || !f.onGround) {
          key = 'jump'
          frame = f.vy < -260 ? 0 : f.vy < 0 ? 1 : f.vy < 220 ? 2 : 3
        } else if (f.state === 'run') {
          key = 'run'
          frame = Math.floor(f.anim * 11) % FRAME_COUNT.run
        } else {
          key = 'idle'
          frame = Math.floor(f.anim * 7) % FRAME_COUNT.idle
        }
        const img = sheetFor(key)
        if (!img) return
        const sx = frame * FW
        ctx.save()
        if (f.flash > 0) ctx.filter = 'brightness(2.2)'
        ctx.drawImage(img, sx, 0, FW, FH, f.x - FW * SCALE / 2, f.y - FH * SCALE, FW * SCALE, FH * SCALE)
        ctx.restore()
        // 格挡护罩
        if (f.state === 'guard') {
          ctx.save()
          ctx.strokeStyle = 'rgba(96, 165, 250, 0.75)'
          ctx.lineWidth = 3
          ctx.shadowColor = 'rgba(96, 165, 250, 0.8)'
          ctx.shadowBlur = 12
          ctx.beginPath()
          ctx.arc(f.x + f.facing * 26, f.y - 62, 46, f.facing > 0 ? -1.1 : Math.PI - 1.1, f.facing > 0 ? 1.1 : Math.PI + 1.1)
          ctx.stroke()
          ctx.restore()
        }
      }
      if (w) {
        drawFighter(w.p2, true)
        drawFighter(w.p1, false)
      }

      // —— 打击火花 ——
      if (w) {
        for (const s of w.sparks) {
          const a = 1 - s.t
          ctx.save()
          ctx.globalAlpha = a
          if (s.kind === 'block') {
            ctx.strokeStyle = '#93c5fd'
            ctx.lineWidth = 3
            for (let i = 0; i < 5; i++) {
              const ang = -Math.PI / 2 + (i - 2) * 0.5
              const r1 = 10 + s.t * 30
              ctx.beginPath()
              ctx.arc(s.x, s.y, r1, ang - 0.2, ang + 0.2)
              ctx.stroke()
            }
          } else {
            ctx.fillStyle = '#fde68a'
            for (let i = 0; i < 7; i++) {
              const ang = (i / 7) * Math.PI * 2 + s.t * 2
              const r = 8 + s.t * 46
              ctx.beginPath()
              ctx.arc(s.x + Math.cos(ang) * r, s.y + Math.sin(ang) * r * 0.7, 3.4 * a + 1, 0, Math.PI * 2)
              ctx.fill()
            }
            ctx.strokeStyle = 'rgba(254, 243, 199, 0.9)'
            ctx.lineWidth = 2.5
            ctx.beginPath()
            ctx.arc(s.x, s.y, 14 + s.t * 40, 0, Math.PI * 2)
            ctx.stroke()
          }
          ctx.restore()
        }
      }

      // —— 横幅 ——
      if (w && w.banner) {
        const b = w.banner
        const a = b.t < 0.15 ? b.t / 0.15 : b.t > 1 ? Math.max(0, 1 - (b.t - 1) / 0.4) : 1
        const zoom = 1 + Math.max(0, 0.25 - b.t) * 1.2
        ctx.save()
        ctx.globalAlpha = a
        ctx.translate(CW / 2, CH * 0.38)
        ctx.scale(zoom, zoom)
        ctx.textAlign = 'center'
        ctx.font = "700 58px 'JetBrains Mono', ui-monospace, monospace"
        ctx.lineWidth = 8
        ctx.strokeStyle = 'rgba(8, 10, 16, 0.75)'
        ctx.strokeText(b.text, 0, 0)
        const gold = b.text === 'K.O.' || b.text === 'FIGHT!'
        ctx.fillStyle = gold ? '#fbbf24' : '#e2e8f0'
        ctx.fillText(b.text, 0, 0)
        ctx.restore()
      }
    }

    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [applyHit, endMatch, startRound, updateFighter])

  // ---------- 键盘 ----------
  useEffect(() => {
    const inp = inputRef.current
    const press = (code) => {
      if (code === 'KeyA' || code === 'ArrowLeft') inp.left = true
      else if (code === 'KeyD' || code === 'ArrowRight') inp.right = true
      else if (code === 'KeyW' || code === 'ArrowUp') inp.jump = true
      else if (code === 'KeyS' || code === 'ArrowDown') inp.guard = true
      else if (code === 'KeyJ') pressRef.current.s1 = performance.now()
      else if (code === 'KeyK') pressRef.current.s2 = performance.now()
    }
    const release = (code) => {
      if (code === 'KeyA' || code === 'ArrowLeft') inp.left = false
      else if (code === 'KeyD' || code === 'ArrowRight') inp.right = false
      else if (code === 'KeyW' || code === 'ArrowUp') inp.jump = false
      else if (code === 'KeyS' || code === 'ArrowDown') inp.guard = false
    }
    const down = (e) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault()
      if (!e.repeat) press(e.code)
    }
    const up = (e) => release(e.code)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  // ---------- 触控 ----------
  const bindTouch = (name) => ({
    onPointerDown: (e) => {
      e.preventDefault()
      touchRef.current[name] = true
      const inp = inputRef.current
      if (name === 's1') pressRef.current.s1 = performance.now()
      else if (name === 's2') pressRef.current.s2 = performance.now()
      else inp[name] = true
    },
    onPointerUp: () => {
      touchRef.current[name] = false
      const inp = inputRef.current
      if (name !== 's1' && name !== 's2') inp[name] = false
    },
    onPointerLeave: () => {
      touchRef.current[name] = false
      const inp = inputRef.current
      if (name !== 's1' && name !== 's2') inp[name] = false
    },
  })

  const record = records[difficulty]

  return (
    <div className="gm-wrap">
      <header className="gm-header gm-header-row">
        <div>
          <p className="gm-kicker" style={{ color: 'rgba(248, 113, 113, 0.85)' }}>SWORD DUEL</p>
          <h1 className="gm-title gm-title-sm">剑客对决</h1>
        </div>
        <Link to="/games" className="gm-back gm-back-top">← 返回街机</Link>
      </header>

      <section className="gm-panel dl-panel">
        <div className="dl-toolbar">
          <div className="gm-seg">
            {DIFFS.map((d) => (
              <button
                key={d.id}
                type="button"
                className={`gm-seg-btn ${difficulty === d.id ? 'active' : ''}`}
                onClick={() => { setDifficulty(d.id); if (soundRef.current) sfx.ui() }}
                title={d.desc}
              >
                {d.name} · {AI_NAME[d.id]}
              </button>
            ))}
          </div>
          <div className="dl-toolbar-right">
            <button type="button" className="ms-chip" onClick={startMatch}>
              {status === 'idle' ? '开始对决' : status === 'over' ? '再战' : '重赛'}
            </button>
            <button type="button" className="ms-chip" onClick={() => setSoundOn((v) => !v)}>{soundOn ? '🔊' : '🔇'}</button>
          </div>
        </div>

        <div className="dl-bars">
          <div className="dl-side">
            <span className="dl-name">你 · P1</span>
            <div className="dl-hp"><i className="dl-hp-lag" style={{ width: `${hud.p1}%` }} /><i className="dl-hp-fill p1" style={{ width: `${hud.p1}%` }} /></div>
            <span className="dl-rounds">{'◆'.repeat(hud.wins1)}{'◇'.repeat(2 - hud.wins1)}</span>
          </div>
          <div className="dl-mid">
            <span className="dl-round">R{hud.round}</span>
            <span className="dl-time">{hud.time}</span>
          </div>
          <div className="dl-side right">
            <span className="dl-name">{AI_NAME[difficulty]} · AI</span>
            <div className="dl-hp"><i className="dl-hp-fill p2" style={{ width: `${hud.p2}%` }} /></div>
            <span className="dl-rounds">{'◆'.repeat(hud.wins2)}{'◇'.repeat(2 - hud.wins2)}</span>
          </div>
        </div>

        <div className="gk-shell dl-shell">
          <canvas ref={canvasRef} className="dl-canvas" />
          {status === 'idle' && (
            <div className="gk-overlay">
              <p className="gk-overlay-title">剑客对决 · 三局两胜</p>
              <p className="gk-overlay-sub">
                A/D 移动 · W 跳 · J 轻斩（快）· K 重斩（慢但痛）· S 格挡（持刀减免 85%）<br />
                {AI_NAME[difficulty]}会试探距离、格挡反击。重斩被挡住会被惩罚——收招就是破绽。
              </p>
              <div className="gk-overlay-actions">
                <button type="button" className="gm-btn-start" onClick={startMatch}>开始对决</button>
              </div>
            </div>
          )}
          {status === 'over' && (
            <div className="gk-overlay gk-overlay-lite">
              <p className="gk-overlay-title">{matchResult === 'win' ? '胜负已分 · 你赢了！' : '技不如人 · 再练练'}</p>
              <p className="gk-overlay-sub">
                {hud.wins1} 比 {hud.wins2} · 对手 {AI_NAME[difficulty]} · 战绩 {record.w} 胜 {record.l} 负
              </p>
              <div className="gk-overlay-actions">
                <button type="button" className="gm-btn-start" onClick={startMatch}>再战</button>
              </div>
            </div>
          )}
          <ConfettiLayer pieces={confetti} />
        </div>

        {/* 触屏按钮（粗指针设备显示） */}
        <div className="dl-touch" aria-hidden="true">
          <div className="dl-touch-group">
            <button type="button" className="dl-key" {...bindTouch('left')}>◀</button>
            <button type="button" className="dl-key" {...bindTouch('right')}>▶</button>
          </div>
          <div className="dl-touch-group">
            <button type="button" className="dl-key" {...bindTouch('guard')}>🛡</button>
            <button type="button" className="dl-key" {...bindTouch('jump')}>↑</button>
            <button type="button" className="dl-key atk1" {...bindTouch('s1')}>斩</button>
            <button type="button" className="dl-key atk2" {...bindTouch('s2')}>重</button>
          </div>
        </div>

        <p className="gk-tip">
          轻斩 8 伤出手快，重斩 16 伤有破绽；格挡只吃 15% 削减但会被推后。60 秒未分胜负按血量判回合。
        </p>
      </section>
    </div>
  )
}
