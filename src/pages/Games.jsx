import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { sfx } from '../utils/sound'
import './games/games.css'

const BEST_KEYS = {
  '/games/minesweeper': ['ms-best-beginner', 'ms-best-intermediate', 'ms-best-expert'],
  '/games/snake': ['snake-best'],
}

function readBest(path) {
  const keys = BEST_KEYS[path] ?? []
  const values = keys
    .map((k) => Number(localStorage.getItem(k)))
    .filter((v) => Number.isFinite(v) && v > 0)
  if (!values.length) return null
  return path === '/games/snake' ? `最佳 ${Math.max(...values)} 分` : `最快 ${Math.min(...values)}s`
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
  ]

  return (
    <div className="gm-wrap">
      <header className="gm-header">
        <p className="gm-kicker">ARCADE</p>
        <h1 className="gm-title">小游戏街机</h1>
        <p className="gm-sub">两台随时能开的经典机器，战绩存在本地浏览器里。</p>
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
