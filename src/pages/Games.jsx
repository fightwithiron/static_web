import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { sfx } from '../utils/sound'
import './games/games.css'

// 战绩读取配置：keys 为 localStorage 键，fmt 决定展示格式
const BEST_KEYS = {
  '/games/minesweeper': { keys: ['ms-best-beginner', 'ms-best-intermediate', 'ms-best-expert'], fmt: 'time' },
  '/games/snake': { keys: ['snake-best'], fmt: 'score' },
  '/games/fishfeast': { keys: ['fish-record-easy', 'fish-record-hard'], fmt: 'fish' },
  '/games/bird': { keys: ['bird-record-easy', 'bird-record-hard'], fmt: 'bird' },
  '/games/duel': { keys: ['duel-record-easy', 'duel-record-hard'], fmt: 'duel' },
}

function readBest(path) {
  const cfg = BEST_KEYS[path]
  if (!cfg) return null
  const nums = cfg.keys
    .map((k) => Number(localStorage.getItem(k)))
    .filter((v) => Number.isFinite(v) && v > 0)
  if (cfg.fmt === 'time') {
    return nums.length ? `最快 ${Math.min(...nums)}s` : null
  }
  if (cfg.fmt === 'score') {
    return nums.length ? `最佳 ${Math.max(...nums)} 分` : null
  }
  if (cfg.fmt === 'fish') {
    const bests = cfg.keys
      .map((k) => { try { return JSON.parse(localStorage.getItem(k) ?? 'null') } catch { return null } })
      .filter(Boolean)
    const best = Math.max(0, ...bests.map((r) => r.best ?? 0))
    return best > 0 ? `最高 ${best} 分` : null
  }
  if (cfg.fmt === 'bird') {
    const bests = cfg.keys
      .map((k) => { try { return JSON.parse(localStorage.getItem(k) ?? 'null') } catch { return null } })
      .filter(Boolean)
    const best = Math.max(0, ...bests.map((r) => r.best ?? 0))
    return best > 0 ? `最高 ${best} 柱` : null
  }
  if (cfg.fmt === 'duel') {
    const recs = cfg.keys
      .map((k) => { try { return JSON.parse(localStorage.getItem(k) ?? 'null') } catch { return null } })
      .filter(Boolean)
    const wins = recs.reduce((a, r) => a + (r.w ?? 0), 0)
    const losses = recs.reduce((a, r) => a + (r.l ?? 0), 0)
    return wins + losses > 0 ? `${wins} 胜 ${losses} 负` : null
  }
  return null
}

function MinesweeperArt() {
  // 静态小棋盘 + 一格旗子脉冲 + 一格数字，纯 CSS 动画
  return (
    <div className="gm-art gm-art-ms" aria-hidden="true">
      <div className="gm-ms-grid">
        {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <span
            key={i}
            className={`gm-ms-cell ${i === 4 ? 'is-num' : ''} ${i === 8 ? 'is-flag' : ''}`}
          >
            {i === 4 ? '2' : i === 8 ? '🚩' : ''}
          </span>
        ))}
      </div>
    </div>
  )
}

function SnakeArt() {
  return (
    <div className="gm-art gm-art-snake" aria-hidden="true">
      <div className="gm-snake-track">
        <i className="gm-snake-dot d1" />
        <i className="gm-snake-dot d2" />
        <i className="gm-snake-dot d3" />
        <i className="gm-snake-dot d4" />
        <i className="gm-snake-food" />
      </div>
    </div>
  )
}

function WoodenFishArt() {
  return (
    <div className="gm-art gm-art-fish" aria-hidden="true">
      <div className="gm-fish-stage">
        <i className="gm-fish-ripple" />
        <span className="gm-fish-body">🐟</span>
        <span className="gm-fish-float">功德 +1</span>
      </div>
    </div>
  )
}

function WishArt() {
  return (
    <div className="gm-art gm-art-wish" aria-hidden="true">
      <div className="gm-wish-sky">
        <i className="gm-wish-star x1" />
        <i className="gm-wish-star x2" />
        <i className="gm-wish-star x3" />
        <i className="gm-wish-lantern" />
      </div>
    </div>
  )
}

function RouletteArt() {
  return (
    <div className="gm-art gm-art-wheel" aria-hidden="true">
      <div className="gm-wheel-ring">
        <i className="gm-wheel-pointer" />
        <span className="gm-wheel-hub">GO</span>
      </div>
    </div>
  )
}

function BubbleArt() {
  return (
    <div className="gm-art gm-art-bubble" aria-hidden="true">
      <div className="gm-bubble-grid">
        {Array.from({ length: 12 }, (_, i) => (
          <i key={i} className={`gm-bubble ${i === 5 ? 'pop-a' : ''} ${i === 7 ? 'pop-b' : ''}`} />
        ))}
      </div>
    </div>
  )
}

function TypingArt() {
  return (
    <div className="gm-art gm-art-typing" aria-hidden="true">
      <div className="gm-typing-lines">
        <p><i style={{ width: '86%' }} /><b className="caret" /></p>
        <p><i style={{ width: '64%' }} /></p>
        <p><i style={{ width: '74%' }} /></p>
      </div>
    </div>
  )
}

function GomokuArt() {
  return (
    <div className="gm-art gm-art-gomoku" aria-hidden="true">
      <div className="gm-gomoku-board">
        <i className="gm-stone black s1" />
        <i className="gm-stone white s2" />
        <i className="gm-stone black s3" />
        <i className="gm-stone white s4" />
        <i className="gm-stone black s5 last" />
      </div>
    </div>
  )
}

function FishArt() {
  return (
    <div className="gm-art gm-art-fishtank" aria-hidden="true">
      <i className="gm-fish-weed w1" />
      <i className="gm-fish-weed w2" />
      <img src="/games/fish/fish_orange.png" alt="" className="gm-fish prey" />
      <img src="/games/fish/fish_blue.png" alt="" className="gm-fish hero" />
      <i className="gm-fish-bubble b1" />
      <i className="gm-fish-bubble b2" />
      <i className="gm-fish-bubble b3" />
    </div>
  )
}

function BirdArt() {
  return (
    <div className="gm-art gm-art-birdsky" aria-hidden="true">
      <i className="gm-bird-pipe p1" />
      <i className="gm-bird-pipe p2" />
      <i className="gm-bird-star s1" />
      <i className="gm-bird-star s2" />
      <i className="gm-bird-star s3" />
      <div className="gm-bird"><i className="gm-bird-wing" /></div>
    </div>
  )
}

function DuelArt() {
  return (
    <div className="gm-art gm-art-duel" aria-hidden="true">
      <i className="gm-duel-hp p1"><i /></i>
      <i className="gm-duel-hp p2"><i /></i>
      <i className="gm-duel-fighter left" />
      <i className="gm-duel-fighter right" />
      <i className="gm-duel-spark" />
    </div>
  )
}

export default function Games() {
  const [bests, setBests] = useState({})

  useEffect(() => {
    const next = {}
    for (const path of Object.keys(BEST_KEYS)) next[path] = readBest(path)
    setBests(next)
  }, [])

  const games = [
    {
      path: '/games/minesweeper',
      name: '扫雷',
      en: 'MINESWEEPER',
      desc: '数字是线索，逻辑是武器。三档难度，从 9×9 到 30×16 的雷区等你排干净。',
      accent: '#f59e0b',
      art: <MinesweeperArt />,
      tag: '推理 · 经典',
    },
    {
      path: '/games/snake',
      name: '贪吃蛇',
      en: 'SNAKE',
      desc: '吃豆长大，越吃越快。平滑滑行的手感，偶尔出现三倍分的金苹果。',
      accent: '#34d399',
      art: <SnakeArt />,
      tag: '街机 · 手速',
    },
    {
      path: '/games/woodenfish',
      name: '电子木鱼',
      en: 'WOODEN FISH',
      desc: '敲一下，功德 +1。连击、自动敲击、三种木色，赛博功德修起来。',
      accent: '#d6a373',
      art: <WoodenFishArt />,
      tag: '解压 · 梗',
    },
    {
      path: '/games/wishingwell',
      name: '赛博许愿池',
      en: 'WISHING WELL',
      desc: '把愿望写进烟花放飞夜空，愿望墙替你保管每一次心动。',
      accent: '#96a8e6',
      art: <WishArt />,
      tag: '治愈 · 演出',
    },
    {
      path: '/games/roulette',
      name: '大转盘',
      en: 'LUCKY WHEEL',
      desc: '今晚吃什么、课堂点名、做不做——转起来，让天意背锅。',
      accent: '#60a5fa',
      art: <RouletteArt />,
      tag: '随机 · 实用',
    },
    {
      path: '/games/bubblewrap',
      name: '捏泡泡',
      en: 'BUBBLE WRAP',
      desc: '一整张泡泡纸随便造：点破、拖过一整排，捏完自动换新。',
      accent: '#7dd3fc',
      art: <BubbleArt />,
      tag: '解压 · 手感',
    },
    {
      path: '/games/typing',
      name: '打字测速场',
      en: 'TYPE RACING',
      desc: '中英文双模式，逐字高亮，拼音上屏不计错。看看你的真实手速。',
      accent: '#38bdf8',
      art: <TypingArt />,
      tag: '手速 · 挑战',
    },
    {
      path: '/games/gomoku',
      name: '五子棋',
      en: 'GOMOKU AI',
      desc: '双难度人机对弈，AI 后台多线程思考，还能替你算一手。',
      accent: '#fbbf24',
      art: <GomokuArt />,
      tag: '人机 · 策略',
    },
    {
      path: '/games/fishfeast',
      name: '大鱼吃小鱼',
      en: 'FISH FEAST',
      desc: '吃小鱼、躲大鱼，一路长成深海霸主。连击吃得越快分越高。',
      accent: '#38bdf8',
      art: <FishArt />,
      tag: '街机 · 成长',
    },
    {
      path: '/games/bird',
      name: '笨鸟先飞',
      en: 'EARLY BIRD',
      desc: '点击振翅穿过夜色能量柱，一秒上手，十秒上头。',
      accent: '#fbbf24',
      art: <BirdArt />,
      tag: '街机 · 手感',
    },
    {
      path: '/games/duel',
      name: '剑客对决',
      en: 'SWORD DUEL',
      desc: '轻斩重斩加格挡，三局两胜。困难 AI 会读你的收招破绽。',
      accent: '#f87171',
      art: <DuelArt />,
      tag: '格斗 · 人机',
    },
  ]

  return (
    <div className="gm-wrap">
      <header className="gm-header">
        <p className="gm-kicker">ARCADE</p>
        <h1 className="gm-title">小游戏街机</h1>
        <p className="gm-sub">{games.length} 台随时能开的经典机器，战绩存在本地浏览器里。</p>
      </header>

      <div className="gm-grid">
        {games.map((g) => (
          <Link
            key={g.path}
            to={g.path}
            className="gm-card"
            style={{ '--gm-accent': g.accent }}
            onClick={() => sfx.ui()}
          >
            <div className="gm-card-art">{g.art}</div>
            <div className="gm-card-body">
              <div className="gm-card-title-row">
                <h2 className="gm-card-name">{g.name}</h2>
                <span className="gm-card-tag">{g.tag}</span>
              </div>
              <p className="gm-card-en">{g.en}</p>
              <p className="gm-card-desc">{g.desc}</p>
              <div className="gm-card-foot">
                <span className="gm-card-best">{bests[g.path] ?? '暂无战绩'}</span>
                <span className="gm-card-enter">进入游戏 →</span>
              </div>
            </div>
          </Link>
        ))}

        <div className="gm-card disabled">
          <div className="gm-card-art">
            <div className="gm-art gm-art-more" aria-hidden="true">
              <span>?</span>
            </div>
          </div>
          <div className="gm-card-body">
            <div className="gm-card-title-row">
              <h2 className="gm-card-name">更多游戏</h2>
              <span className="gm-card-tag">施工中</span>
            </div>
            <p className="gm-card-desc">新机器正在组装，敬请期待。</p>
          </div>
        </div>
      </div>

      <Link to="/" className="gm-back">← 返回首页</Link>
    </div>
  )
}
