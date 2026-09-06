// 网页音效引擎：全部用 WebAudio 现场合成，不依赖任何音频资源文件。
// 音效按需触发；音乐用简易步进音序器生成芯片风格循环乐。

let ctx = null

export function audioCtx() {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

// 单音：freq 起始频率，end 结束频率（默认相同），可制造滑音
function tone({ freq = 440, end, dur = 0.15, type = 'sine', vol = 0.2, delay = 0, at = 0 }) {
  const ac = audioCtx()
  if (!ac) return
  const t0 = at || ac.currentTime + delay
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(Math.max(freq, 1), t0)
  osc.frequency.exponentialRampToValueAtTime(Math.max(end ?? freq, 1), t0 + dur)
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(gain).connect(ac.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.06)
}

// 噪声爆发（爆炸、打击乐）
function noise({ dur = 0.4, vol = 0.3, delay = 0, lowpass = 1000 }) {
  const ac = audioCtx()
  if (!ac) return
  const t0 = ac.currentTime + delay
  const len = Math.max(1, Math.floor(ac.sampleRate * dur))
  const buffer = ac.createBuffer(1, len, ac.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len)
  const src = ac.createBufferSource()
  src.buffer = buffer
  const filter = ac.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = lowpass
  const gain = ac.createGain()
  gain.gain.setValueAtTime(vol, t0)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  src.connect(filter).connect(gain).connect(ac.destination)
  src.start(t0)
}

// —— 游戏音效 ——
export const sfx = {
  // 扫雷：翻开（pitch 随数字升高）、插旗/拔旗、踩雷、胜利
  reveal(pitch = 0) {
    tone({ freq: 460 + pitch * 46, dur: 0.07, type: 'triangle', vol: 0.1 })
  },
  flag() {
    tone({ freq: 760, end: 1020, dur: 0.09, type: 'square', vol: 0.07 })
  },
  unflag() {
    tone({ freq: 1020, end: 760, dur: 0.09, type: 'square', vol: 0.07 })
  },
  explode() {
    noise({ dur: 0.75, vol: 0.5, lowpass: 850 })
    tone({ freq: 150, end: 36, dur: 0.65, type: 'sawtooth', vol: 0.32 })
  },
  win() {
    ;[523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) =>
      tone({ freq: f, dur: 0.2, type: 'triangle', vol: 0.2, delay: i * 0.09 })
    )
    tone({ freq: 1568, dur: 0.5, type: 'sine', vol: 0.12, delay: 0.48 })
  },
  // 贪吃蛇：吃到食物（音高随长度上升）、死亡
  eat(step = 0) {
    const k = Math.min(step, 12)
    tone({ freq: 500 + k * 34, end: 900 + k * 34, dur: 0.09, type: 'square', vol: 0.1 })
  },
  golden() {
    ;[880, 1174.7, 1568].forEach((f, i) => tone({ freq: f, dur: 0.1, type: 'triangle', vol: 0.12, delay: i * 0.05 }))
  },
  over() {
    ;[392, 311.1, 261.6, 196].forEach((f, i) =>
      tone({ freq: f, dur: 0.24, type: 'sawtooth', vol: 0.13, delay: i * 0.13 })
    )
    noise({ dur: 0.3, vol: 0.18, lowpass: 500, delay: 0.5 })
  },
  ui() {
    tone({ freq: 640, dur: 0.05, type: 'triangle', vol: 0.07 })
  },

  // —— 新街机音效 ——

  // 五子棋落子：清脆的石子声
  stone() {
    tone({ freq: 720 + Math.random() * 160, end: 240, dur: 0.06, type: 'sine', vol: 0.3 })
    noise({ dur: 0.03, vol: 0.14, lowpass: 3600 })
  },

  // 电子木鱼：木质"笃"声（正弦速降 + 短促敲击瞬态）
  muyu(pitch = 0) {
    const k = 1 + pitch * 0.06
    tone({ freq: 950 * k, end: 320 * k, dur: 0.11, type: 'sine', vol: 0.34 })
    noise({ dur: 0.05, vol: 0.16, lowpass: 2600 })
  },

  // 捏泡泡：随机音高的"啵"声
  pop() {
    const f = 420 + Math.random() * 380
    tone({ freq: f * 1.7, end: f * 0.5, dur: 0.07, type: 'triangle', vol: 0.22 })
    noise({ dur: 0.04, vol: 0.1, lowpass: 3200 })
  },

  // 烟花升空：气流哨声
  whoosh() {
    const ac = audioCtx()
    if (!ac) return
    noise({ dur: 0.5, vol: 0.1, lowpass: 1800 })
    tone({ freq: 300, end: 900, dur: 0.45, type: 'sine', vol: 0.05 })
  },

  // 烟花炸裂：低频轰鸣 + 高频噼啪
  burstBoom() {
    noise({ dur: 0.45, vol: 0.34, lowpass: 1400 })
    for (let i = 0; i < 5; i++) {
      tone({
        freq: 1400 + Math.random() * 2200,
        dur: 0.04,
        type: 'square',
        vol: 0.05,
        delay: 0.08 + Math.random() * 0.5,
      })
    }
  },

  // 许愿成功：风铃
  chime() {
    ;[1318.5, 1568, 2093].forEach((f, i) =>
      tone({ freq: f, dur: 0.5, type: 'sine', vol: 0.1, delay: i * 0.1 })
    )
  },

  // 大转盘：格子咔哒声
  spinTick() {
    tone({ freq: 1800, end: 1200, dur: 0.03, type: 'square', vol: 0.06 })
  },

  // —— 大鱼吃小鱼 ——

  // 吞咽：水声"咕嘟"，pitch 随猎物大小
  gulp(step = 0) {
    const k = 1 + Math.min(step, 6) * 0.08
    tone({ freq: 340 * k, end: 90, dur: 0.16, type: 'sine', vol: 0.3 })
    tone({ freq: 170 * k, end: 60, dur: 0.22, type: 'sine', vol: 0.16, delay: 0.06 })
    noise({ dur: 0.08, vol: 0.1, lowpass: 900 })
  },

  // 被咬：闷响 + 低鸣
  bite() {
    noise({ dur: 0.3, vol: 0.32, lowpass: 700 })
    tone({ freq: 190, end: 55, dur: 0.35, type: 'sawtooth', vol: 0.26 })
  },

  // 升级/进化：上行琶音
  evolve() {
    ;[392, 523.25, 659.25, 880].forEach((f, i) =>
      tone({ freq: f, dur: 0.12, type: 'triangle', vol: 0.14, delay: i * 0.07 })
    )
  },

  // —— 笨鸟先飞 ——

  // 振翅：短促气声
  flap() {
    noise({ dur: 0.09, vol: 0.16, lowpass: 2200 })
    tone({ freq: 480, end: 700, dur: 0.06, type: 'triangle', vol: 0.08 })
  },

  // 过柱得分
  ding() {
    tone({ freq: 1174.7, dur: 0.09, type: 'triangle', vol: 0.12 })
    tone({ freq: 1568, dur: 0.12, type: 'triangle', vol: 0.1, delay: 0.06 })
  },

  // 撞击：钝痛
  crash() {
    noise({ dur: 0.28, vol: 0.4, lowpass: 1100 })
    tone({ freq: 220, end: 60, dur: 0.3, type: 'square', vol: 0.22 })
  },

  // —— 剑客对决 ——

  // 挥剑：气刃声
  slash() {
    noise({ dur: 0.12, vol: 0.2, lowpass: 4200 })
    tone({ freq: 900, end: 260, dur: 0.1, type: 'sawtooth', vol: 0.08 })
  },

  // 剑刃相格：金属声
  clank() {
    tone({ freq: 2600, end: 1900, dur: 0.07, type: 'square', vol: 0.14 })
    tone({ freq: 3400, end: 2400, dur: 0.05, type: 'square', vol: 0.1, delay: 0.02 })
    noise({ dur: 0.06, vol: 0.14, lowpass: 5000 })
  },

  // 命中：厚实的打击声
  hitHeavy() {
    noise({ dur: 0.16, vol: 0.36, lowpass: 1500 })
    tone({ freq: 260, end: 80, dur: 0.18, type: 'square', vol: 0.26 })
  },

  // 回合开场铃
  roundBell() {
    tone({ freq: 880, dur: 0.5, type: 'triangle', vol: 0.16 })
    tone({ freq: 1760, dur: 0.4, type: 'sine', vol: 0.08, delay: 0.04 })
  },

  // KO 锣声
  koGong() {
    tone({ freq: 196, end: 98, dur: 1.4, type: 'sine', vol: 0.3 })
    tone({ freq: 294, end: 147, dur: 1.1, type: 'triangle', vol: 0.12, delay: 0.02 })
    noise({ dur: 0.5, vol: 0.2, lowpass: 900 })
  },
}

// —— 芯片音乐循环（贪吃蛇背景乐）：A 小调五声，低音 + 琶音 + 帽 ——
const SCALE = [220.0, 261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33]
const MELODY = [0, 4, 2, 5, 0, 4, 6, 4, 2, 5, 3, 6, 2, 5, 7, 5]

export class MusicLoop {
  constructor({ vol = 0.09 } = {}) {
    this.vol = vol
    this.playing = false
    this.timer = null
    this.step = 0
    this.nextTime = 0
  }

  start() {
    const ac = audioCtx()
    if (!ac || this.playing) return
    this.playing = true
    this.step = 0
    this.nextTime = ac.currentTime + 0.08
    const stepDur = 60 / 128 / 2 // 128 BPM 的八分音符
    const schedule = () => {
      if (!this.playing) return
      const now = audioCtx()?.currentTime ?? 0
      while (this.nextTime < now + 0.15) {
        this.playStep(this.step, this.nextTime, stepDur)
        this.step = (this.step + 1) % 32
        this.nextTime += stepDur
      }
      this.timer = setTimeout(schedule, 40)
    }
    schedule()
  }

  playStep(step, t, dur) {
    // 低音：每小节两拍
    if (step % 8 === 0) this.note(110, t, dur * 3.6, 'sine', this.vol * 1.2)
    if (step % 8 === 4) this.note(87.31, t, dur * 2.4, 'sine', this.vol)
    // 琶音旋律
    if (step % 2 === 0) {
      const idx = MELODY[(step / 2) % MELODY.length]
      this.note(SCALE[idx], t, dur * 0.85, 'triangle', this.vol * 0.85)
    }
    // 帽：轻噪声点缀
    if (step % 4 === 2) this.hat(t)
  }

  note(freq, t, dur, type, vol) {
    const ac = audioCtx()
    if (!ac) return
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t)
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.linearRampToValueAtTime(vol, t + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(gain).connect(ac.destination)
    osc.start(t)
    osc.stop(t + dur + 0.05)
  }

  hat(t) {
    const ac = audioCtx()
    if (!ac) return
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    osc.type = 'square'
    osc.frequency.setValueAtTime(6000, t)
    gain.gain.setValueAtTime(this.vol * 0.12, t)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.03)
    osc.connect(gain).connect(ac.destination)
    osc.start(t)
    osc.stop(t + 0.05)
  }

  stop() {
    this.playing = false
    clearTimeout(this.timer)
  }
}
