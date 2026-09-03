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
