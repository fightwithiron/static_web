import { Link } from 'react-router-dom'

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
