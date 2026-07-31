import { useState, useRef } from 'react'
import { Link } from 'react-router-dom'

const AVATAR_API = 'https://q1.qlogo.cn/g?b=qq&nk={qq}&s=640'

export default function QQAvatar() {
  const [qqNumber, setQqNumber] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef(null)

  const handleInputChange = (e) => {
    const value = e.target.value.replace(/[^0-9]/g, '')
    setQqNumber(value)
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      getAvatar()
    }
  }

  const getAvatar = () => {
    if (!qqNumber.trim()) {
      alert('请输入QQ号码')
      inputRef.current?.focus()
      return
    }

    if (qqNumber.length < 5) {
      alert('QQ号码长度不正确')
      inputRef.current?.focus()
      return
    }

    setLoading(true)
    const url = AVATAR_API.replace('{qq}', qqNumber.trim())
    setAvatarUrl(url)

    // 模拟加载延迟
    setTimeout(() => {
      setLoading(false)
    }, 300)
  }

  // const handleDownload = () => {
  //   if (!avatarUrl) return

  //   const link = document.createElement('a')
  //   link.href = avatarUrl
  //   link.download = `qq_avatar_${qqNumber}.png`
  //   link.target = '_blank'
  //   document.body.appendChild(link)
  //   link.click()
  //   document.body.removeChild(link)
  // }

  const handleOpenInNewTab = () => {
    if (!avatarUrl) return
    window.open(avatarUrl, '_blank')
  }

  return (
    <div className="tool-container">
      <div className="tool-header">
        <div className="tool-icon">🐧</div>
        <h1 className="tool-title">QQ头像获取</h1>
        <p className="tool-desc">输入QQ号码，获取对应的高清头像</p>
      </div>

      <div className="tool-card">
        <div className="input-group">
          <label className="input-label">QQ号码</label>
          <input
            ref={inputRef}
            type="text"
            className="input-field"
            placeholder="请输入QQ号码"
            value={qqNumber}
            onChange={handleInputChange}
            onKeyPress={handleKeyPress}
            maxLength={15}
            autoComplete="off"
          />
        </div>

        <button
          className="btn-primary"
          onClick={getAvatar}
          disabled={loading}
        >
          {loading ? (
            <>
              <i className="fas fa-spinner fa-spin"></i> 加载中...
            </>
          ) : (
            <>
              <i className="fas fa-search"></i> 获取头像
            </>
          )}
        </button>

        {avatarUrl && (
          <div className="result-area">
            <h3 className="result-title">✨ 获取成功！</h3>
            <div className="avatar-display">
              <img
                src={avatarUrl}
                alt="QQ头像"
                className="avatar-img"
                onError={(e) => {
                  e.target.style.opacity = '0.5'
                }}
              />
            </div>
            <div className="action-buttons">
              {/* <button className="btn-action btn-download" onClick={handleDownload}>
                <i className="fas fa-download"></i> 下载头像
              </button> */}
              <button className="btn-action btn-open" onClick={handleOpenInNewTab}>
                <i className="fas fa-external-link-alt"></i> 新窗口打开
              </button>
            </div>
          </div>
        )}
      </div>

      <Link to="/" className="back-link">
        <i className="fas fa-arrow-left"></i> 返回首页
      </Link>
    </div>
  )
}
