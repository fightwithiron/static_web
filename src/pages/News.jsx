import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { sfx } from '../utils/sound'
import './games/games.css'
import './news.css'

const API = 'https://60s.viki.moe/v2'
const TTL = 5 * 60 * 1000

const MODULES = [
  { id: 'news', name: '今日要闻', endpoint: '/60s' },
  { id: 'weibo', name: '微博热搜', endpoint: '/weibo' },
  { id: 'zhihu', name: '知乎热榜', endpoint: '/zhihu' },
  { id: 'douyin', name: '抖音热点', endpoint: '/douyin' },
  { id: 'toutiao', name: '头条热榜', endpoint: '/toutiao' },
  { id: 'epic', name: 'Epic 喜加一', endpoint: '/epic' },
]

const fmtHot = (v) => (Number.isFinite(Number(v)) && Number(v) > 10000 ? `${(Number(v) / 10000).toFixed(1)}万` : String(v ?? ''))

const extractList = (data) => {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.list)) return data.list
  if (Array.isArray(data?.data)) return data.data
  return []
}

export default function News() {
  const [tab, setTab] = useState('news')
  const [cache, setCache] = useState({}) // { moduleId: { status, data, fetchedAt } }
  const [reloadFlag, setReloadFlag] = useState(0)

  const mod = MODULES.find((m) => m.id === tab)
  const entry = cache[tab]

  const load = useCallback(async (moduleId, force = false) => {
    const m = MODULES.find((x) => x.id === moduleId)
    const cached = cache[moduleId]
    if (!force && cached && cached.status === 'ok' && Date.now() - cached.fetchedAt < TTL) return
    setCache((c) => ({ ...c, [moduleId]: c[moduleId]?.status === 'ok' ? { ...c[moduleId], status: 'refreshing' } : { status: 'loading', data: null, fetchedAt: 0 } }))
    try {
      const res = await fetch(`${API}${m.endpoint}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      if (json.code !== 200) throw new Error(json.message || '接口返回异常')
      setCache((c) => ({ ...c, [moduleId]: { status: 'ok', data: json.data, fetchedAt: Date.now() } }))
    } catch (err) {
      setCache((c) => ({ ...c, [moduleId]: { status: 'error', data: c[moduleId]?.data ?? null, fetchedAt: 0, message: err.message } }))
    }
  }, [cache])

  useEffect(() => {
    load(tab)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, reloadFlag])

  const refresh = () => {
    sfx.ui()
    setReloadFlag((v) => v + 1)
  }

  const openLink = (url) => {
    if (url) window.open(url, '_blank', 'noopener')
  }

  return (
    <div className="nw-wrap">
      <header className="gm-header gm-header-row">
        <div>
          <p className="gm-kicker" style={{ color: 'rgba(147,197,253,0.85)' }}>DAILY BRIEFING</p>
          <h1 className="gm-title gm-title-sm">今日资讯站</h1>
        </div>
        <Link to="/" className="gm-back gm-back-top">← 返回首页</Link>
      </header>

      <section className="gm-panel nw-panel">
        <div className="nw-toolbar">
          <div className="nw-tabs">
            {MODULES.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`nw-tab ${m.id === tab ? 'active' : ''}`}
                onClick={() => { sfx.ui(); setTab(m.id) }}
              >
                {m.name}
              </button>
            ))}
          </div>
          <button type="button" className="ms-chip" onClick={refresh}>
            {entry?.status === 'refreshing' ? '刷新中…' : '↻ 刷新'}
          </button>
        </div>

        {entry?.status === 'loading' && (
          <div className="nw-loading">
            {Array.from({ length: 6 }, (_, i) => <i key={i} className="nw-skeleton" />)}
          </div>
        )}

        {entry?.status === 'error' && (
          <div className="nw-error">
            <p>拉取失败：{entry.message ?? '网络异常'}</p>
            <button type="button" className="ms-chip" onClick={refresh}>重试</button>
            <p className="nw-error-sub">数据来自 60s 公共接口，偶尔抽风，喝口水再试。</p>
          </div>
        )}

        {entry?.status === 'ok' && tab === 'news' && (
          <div className="nw-news">
            <div className="nw-news-head">
              <span className="nw-news-date">{entry.data.date}</span>
              {entry.data.tip && <span className="nw-news-tip">{entry.data.tip}</span>}
            </div>
            <ol className="nw-news-list">
              {(entry.data.news ?? []).map((line, i) => (
                <li key={i}>
                  <em>{String(i + 1).padStart(2, '0')}</em>
                  <span>{line}</span>
                </li>
              ))}
            </ol>
            {entry.data.image && (
              <img className="nw-news-img" src={entry.data.image} alt="每日早报配图" loading="lazy" />
            )}
          </div>
        )}

        {entry?.status === 'ok' && ['weibo', 'zhihu', 'douyin', 'toutiao'].includes(tab) && (
          <div className="nw-hotlist">
            {extractList(entry.data).slice(0, 30).map((item, i) => (
              <button
                key={i}
                type="button"
                className={`nw-hot-item ${i < 3 ? 'top' : ''}`}
                onClick={() => openLink(item.link || item.url)}
              >
                <em className={i < 3 ? 'top' : ''}>{i + 1}</em>
                <span className="nw-hot-title">
                  {item.title}
                  {item.detail && <small>{item.detail}</small>}
                </span>
                {item.hot_value && <b>{fmtHot(item.hot_value)}</b>}
              </button>
            ))}
          </div>
        )}

        {entry?.status === 'ok' && tab === 'epic' && (
          <div className="nw-epic">
            {extractList(entry.data).map((g, i) => (
              <button key={i} type="button" className="nw-epic-card" onClick={() => openLink(g.url || g.link)}>
                {g.cover && <img src={g.cover} alt={g.title} loading="lazy" />}
                <div className="nw-epic-info">
                  <p className="nw-epic-title">{g.title}</p>
                  {g.description && <p className="nw-epic-desc">{g.description}</p>}
                  <p className="nw-epic-price">
                    {g.original_price_desc ? (
                      <>原价 <s>{g.original_price_desc}</s> → 现在免费</>
                    ) : '免费领取'}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <p className="nw-footnote">
        标题与摘要来自公开接口，版权归原作者与各平台所有，点击卡片跳转原文。
      </p>
    </div>
  )
}
