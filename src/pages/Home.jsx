import { Link } from 'react-router-dom'

const toys = [
  {
    path: '/qq-avatar',
    name: 'QQ头像获取',
    desc: '输入QQ号获取高清头像',
    icon: '🐧',
    color: '#12B7F5'
  },
  {
    path: '#',
    name: '更多玩具',
    desc: '敬请期待更多有趣功能',
    icon: '✨',
    color: '#667eea',
    disabled: true
  }
]

export default function Home() {
  return (
    <div className="container">
      <section className="hero-section">
        <h1 className="hero-title">探索有趣的网络玩具</h1>
        <p className="hero-subtitle">一个收集各种好玩小工具的地方</p>
      </section>

      <section>
        <h2 className="section-title">常用玩具</h2>
        <p className="section-desc">点击卡片进入对应的小工具</p>

        <div className="toys-grid">
          {toys.map((toy, index) =>
            toy.disabled ? (
              <div key={index} className="toy-card disabled">
                <div className="toy-icon" style={{ background: toy.color }}>
                  {toy.icon}
                </div>
                <h3 className="toy-name">{toy.name}</h3>
                <p className="toy-desc">{toy.desc}</p>
              </div>
            ) : (
              <Link key={index} to={toy.path} className="toy-card">
                <div className="toy-icon" style={{ background: toy.color }}>
                  {toy.icon}
                </div>
                <h3 className="toy-name">{toy.name}</h3>
                <p className="toy-desc">{toy.desc}</p>
              </Link>
            )
          )}
        </div>
      </section>
    </div>
  )
}
