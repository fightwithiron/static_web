import { Link } from 'react-router-dom'
import { sfx } from '../utils/sound'

const SECTIONS = [
  {
    title: '常用玩具',
    desc: '点击卡片进入对应的小工具',
    toys: [
      { path: '/games', name: '小游戏街机', desc: '扫雷、贪吃蛇、五子棋 AI、大鱼吃小鱼、剑客对决……十一台经典机器', icon: '🎮', color: '#34d399' },
      { path: '/codec', name: '编解码工作台', desc: 'Base64、哈希、AES、SM4、与佛论禅……55 种方案随你折腾', icon: '⌨️', color: '#667eea' },
      { path: '/news', name: '今日资讯站', desc: '每天 60 秒读懂世界 + 微博知乎抖音头条热榜 + Epic 喜加一', icon: '📰', color: '#93c5fd' },
      { path: '/qq-avatar', name: 'QQ头像获取', desc: '输入QQ号获取高清头像', icon: '🐧', color: '#12B7F5' },
    ],
  },
  {
    title: '创作工坊',
    desc: '把图片和链接变成你想要的样子',
    toys: [
      { path: '/pixel-avatar', name: '像素头像工坊', desc: '上传图片，框选区域一键像素化，最高 64×64 密度 + 多档限色', icon: '🧩', color: '#d6a373' },
      { path: '/qrcode', name: '二维码工坊', desc: '支持图片底纹二维码：截取图片一角铺满码面，中心还能嵌 logo', icon: '⛓️', color: '#60a5fa' },
    ],
  },
]

export default function Home() {
  return (
    <div className="container">
      <section className="hero-section">
        <h1 className="hero-title">探索有趣的网络玩具</h1>
        <p className="hero-subtitle">一个收集各种好玩小工具的地方</p>
        <div className="hero-feedback">
          <span className="hf-badge">FEEDBACK</span>
          <span className="hf-text">欢迎提出建议</span>
          <a
            className="hf-link"
            href="https://github.com/fightwithiron/static_web"
            target="_blank"
            rel="noreferrer"
            onClick={() => sfx.ui()}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              <path fill="currentColor" d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
            </svg>
            fightwithiron/static_web
          </a>
          <i className="hf-sep" />
          <a className="hf-link" href="mailto:783894636@qq.com">
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              <path fill="currentColor" d="M2.25 5.25A2.25 2.25 0 0 1 4.5 3h15a2.25 2.25 0 0 1 2.25 2.25v.96l-9.75 5.85-9.75-5.85v-.96Zm0 3.12v8.38A2.25 2.25 0 0 0 4.5 19h15a2.25 2.25 0 0 0 2.25-2.25V8.37l-9.315 5.59a1.5 1.5 0 0 1-1.37 0L2.25 8.37Z" />
            </svg>
            783894636@qq.com
          </a>
        </div>
      </section>

      {SECTIONS.map((section) => (
        <section key={section.title}>
          <h2 className="section-title">{section.title}</h2>
          <p className="section-desc">{section.desc}</p>

          <div className="toys-grid">
            {section.toys.map((toy) => (
              <Link key={toy.path} to={toy.path} className="toy-card">
                <div className="toy-icon" style={{ background: toy.color }}>
                  {toy.icon}
                </div>
                <h3 className="toy-name">{toy.name}</h3>
                <p className="toy-desc">{toy.desc}</p>
              </Link>
            ))}
          </div>
        </section>
      ))}

      <section>
        <h2 className="section-title">更多玩具</h2>
        <p className="section-desc">敬请期待更多有趣功能</p>
        <div className="toys-grid">
          <div className="toy-card disabled">
            <div className="toy-icon" style={{ background: '#667eea' }}>✨</div>
            <h3 className="toy-name">施工中</h3>
            <p className="toy-desc">新玩具正在组装，敬请期待</p>
          </div>
        </div>
      </section>
    </div>
  )
}
