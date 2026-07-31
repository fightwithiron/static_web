import { useState, useEffect } from 'react'

export default function Header() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <header className={`header ${scrolled ? 'scrolled' : ''}`}>
      <div className="header-container">
        <a href="/" className="logo-wrapper" onClick={(e) => {
          e.preventDefault()
          window.location.href = '/'
        }}>
          <div className="logo-img">R</div>
          <span className="site-title">rune 的玩具网页</span>
        </a>
      </div>
    </header>
  )
}
