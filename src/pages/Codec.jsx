import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { MODES, GROUPS, getScheme, getSample, DEFAULT_SCHEME, CodecError } from '../utils/codec'
import { byteLength, bytesToBase64, hexToBytes } from '../utils/codec/bytes'
import './codec.css'

const GROUP_LABEL = { common: '常用', nerdy: '冷门', fun: '整活' }

// ---------- 方案下拉选择器（带分组与过滤） ----------

function SchemeSelect({ schemes, value, onChange }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const boxRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onDoc = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    return GROUPS.map((g) => ({
      ...g,
      items: schemes.filter(
        (s) => s.group === g.id && (!q || s.name.toLowerCase().includes(q) || s.id.includes(q))
      ),
    })).filter((g) => g.items.length)
  }, [schemes, query])

  const current = schemes.find((s) => s.id === value)

  return (
    <div className="cv-select" ref={boxRef}>
      <button
        type="button"
        className="cv-select-btn"
        onClick={() => { setOpen((o) => !o); setQuery('') }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="cv-select-value">{current?.name ?? '选择方案'}</span>
        <span className="cv-select-arrow" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="cv-menu" role="listbox">
          <div className="cv-menu-filter">
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="过滤方案…"
              className="cv-filter-input"
            />
          </div>
          {groups.map((g) => (
            <div key={g.id} className="cv-menu-group">
              <div className="cv-menu-group-label">{g.label}</div>
              {g.items.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="option"
                  aria-selected={s.id === value}
                  className={`cv-menu-item ${s.id === value ? 'active' : ''}`}
                  onClick={() => { onChange(s.id); setOpen(false) }}
                >
                  {s.name}
                </button>
              ))}
            </div>
          ))}
          {!groups.length && <div className="cv-menu-empty">没有匹配的方案</div>}
        </div>
      )}
    </div>
  )
}

// ---------- 数字参数（偏移量/栏数等） ----------

function NumParam({ spec, value, onChange }) {
  return (
    <label className="cv-param">
      <span className="cv-param-label">{spec.label}</span>
      <input
        type="number"
        className="cv-param-input"
        min={spec.min}
        max={spec.max}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value)
          onChange(Number.isFinite(n) ? Math.min(spec.max, Math.max(spec.min, n)) : spec.def)
        }}
      />
    </label>
  )
}

// ---------- 主页面 ----------

export default function Codec() {
  const [modeId, setModeId] = useState('encode')
  const [schemeId, setSchemeId] = useState(DEFAULT_SCHEME.encode)
  const [plain, setPlain] = useState('')
  const [cipher, setCipher] = useState('')
  const [params, setParams] = useState({ key: '' })
  const [hashFormat, setHashFormat] = useState('hex')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState({ kind: 'ready', text: '就绪' })
  const [errorModal, setErrorModal] = useState(null)
  const [toast, setToast] = useState(null)

  const mode = MODES.find((m) => m.id === modeId)
  const scheme = getScheme(modeId, schemeId)
  const isHash = modeId === 'hash'

  const timerRef = useRef(null)
  const runRef = useRef(() => {})
  const toastTimer = useRef(null)
  const plainRef = useRef(null)
  const cipherRef = useRef(null)

  const defaultParams = useCallback((s) => {
    const p = {}
    if (s?.key) p.key = ''
    if (s?.params) for (const sp of s.params) p[sp.id] = sp.def
    return p
  }, [])

  const showToast = (msg) => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2400)
  }

  const run = useCallback(async (direction, { silent = false } = {}) => {
    const s = getScheme(modeId, schemeId)
    if (!s) return
    const src = direction === 'encode' ? plain : cipher
    if (!src) {
      if (direction === 'encode') setCipher('')
      else setPlain('')
      setStatus({ kind: 'ready', text: '就绪' })
      return
    }
    setBusy(true)
    try {
      let result = direction === 'encode' ? await s.encode(src, params) : await s.decode(src, params)
      if (modeId === 'hash' && direction === 'encode') {
        result = hashFormat === 'hex' ? result : bytesToBase64(hexToBytes(result))
      }
      if (direction === 'encode') setCipher(result)
      else setPlain(result)
      setStatus({
        kind: 'ok',
        text: direction === 'encode'
          ? `已完成 · 输出 ${byteLength(result)} 字节`
          : '已还原',
      })
    } catch (err) {
      if (err instanceof CodecError) {
        const title = direction === 'encode'
          ? (modeId === 'hash' ? '无法计算' : '无法编码')
          : '无法解码'
        if (silent) setStatus({ kind: 'error', text: err.message })
        else setErrorModal({ title, message: `${s.name}：${err.message}` })
      } else {
        console.error(err)
        const text = '内部错误：' + err.message
        if (silent) setStatus({ kind: 'error', text })
        else setErrorModal({ title: '出错了', message: text })
      }
    } finally {
      setBusy(false)
    }
  }, [modeId, schemeId, plain, cipher, params, hashFormat])

  runRef.current = run

  // 防抖自动执行：最近编辑的哪一侧，就朝另一侧转换
  const scheduleAuto = useCallback((direction) => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => runRef.current(direction, { silent: true }), 400)
  }, [])

  useEffect(() => () => {
    clearTimeout(timerRef.current)
    clearTimeout(toastTimer.current)
  }, [])

  const switchMode = (m) => {
    if (m === modeId) return
    clearTimeout(timerRef.current)
    setModeId(m)
    const next = DEFAULT_SCHEME[m]
    setSchemeId(next)
    setParams(defaultParams(getScheme(m, next)))
    setPlain('')
    setCipher('')
    setStatus({ kind: 'ready', text: '就绪' })
  }

  const switchScheme = (id) => {
    if (id === schemeId) return
    clearTimeout(timerRef.current)
    setSchemeId(id)
    setParams(defaultParams(getScheme(modeId, id)))
    setCipher('')
    setStatus({ kind: 'ready', text: '就绪' })
    if (plain.trim()) scheduleAuto('encode')
  }

  const changeParams = (patch) => {
    const next = { ...params, ...patch }
    setParams(next)
    const last = plain.length >= cipher.length ? 'encode' : 'decode'
    if (plain || cipher) scheduleAuto(isHash ? 'encode' : last)
  }

  const fillSample = () => {
    const sample = getSample(modeId, schemeId)
    clearTimeout(timerRef.current)
    const { key, ...rest } = sample
    setPlain(rest.plain ?? '')
    setCipher('')
    if (scheme?.key) setParams((p) => ({ ...p, key: key ?? '' }))
    if (scheme?.params) setParams((p) => ({ ...p, ...Object.fromEntries(scheme.params.map((sp) => [sp.id, sample[sp.id] ?? sp.def])) }))
    setTimeout(() => runRef.current('encode', { silent: true }), 30)
  }

  const swap = () => {
    clearTimeout(timerRef.current)
    setPlain(cipher)
    setCipher(plain)
    setStatus({ kind: 'ready', text: '已互换' })
  }

  const copyCipher = async () => {
    if (!cipher) return
    try {
      await navigator.clipboard.writeText(cipher)
      showToast('已复制到剪贴板')
    } catch {
      cipherRef.current?.select()
      document.execCommand('copy')
      showToast('已复制到剪贴板')
    }
  }

  const clearAll = () => {
    clearTimeout(timerRef.current)
    setPlain('')
    setCipher('')
    setStatus({ kind: 'ready', text: '就绪' })
    plainRef.current?.focus()
  }

  // Ctrl+Enter 在哪一侧就执行哪一侧的方向
  const onEditorKeyDown = (side) => (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      runRef.current(side === 'plain' ? 'encode' : 'decode')
    }
  }

  const handleModeKeydown = (e) => {
    if (e.key === 'Escape') setErrorModal(null)
  }

  const zeroWidthHidden = schemeId === 'zerowidth' && cipher.length > 0

  const dirLabels = isHash
    ? { enc: '计算摘要' }
    : modeId === 'cipher'
      ? { enc: '加密', dec: '解密' }
      : { enc: '编码', dec: '解码' }

  return (
    <div className="cv-wrap" onKeyDown={handleModeKeydown}>
      <header className="cv-header">
        <p className="cv-kicker">CODEC CONSOLE</p>
        <h1 className="cv-title">编解码工作台</h1>
        <p className="cv-sub">{mode.hint} 全程在浏览器本地完成，不经过服务器。</p>
      </header>

      <section className="cv-panel">
        <div className="cv-row">
          <div className="cv-seg" role="tablist" aria-label="模式">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                role="tab"
                aria-selected={m.id === modeId}
                className={`cv-seg-btn ${m.id === modeId ? 'active' : ''}`}
                onClick={() => switchMode(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
          <span className="cv-mode-note">{isHash ? '解码区已锁定' : '双向互转'}</span>
        </div>

        <div className="cv-row cv-row-scheme">
          <SchemeSelect schemes={mode.schemes} value={schemeId} onChange={switchScheme} />
          {scheme?.key && (
            <label className="cv-param cv-param-grow">
              <span className="cv-param-label">{scheme.key.label}</span>
              <input
                type="text"
                className="cv-param-input"
                placeholder={scheme.key.placeholder}
                value={params.key ?? ''}
                onChange={(e) => changeParams({ key: e.target.value })}
                autoComplete="off"
              />
            </label>
          )}
          {scheme?.params?.map((sp) => (
            <NumParam key={sp.id} spec={sp} value={params[sp.id]} onChange={(v) => changeParams({ [sp.id]: v })} />
          ))}
          <button type="button" className="cv-btn-ghost" onClick={fillSample}>示例</button>
        </div>

        {scheme?.key?.desc && (
          <p className="cv-scheme-desc">{scheme.key.desc}</p>
        )}
        {scheme && !scheme.key && (
          <p className="cv-scheme-desc">{scheme.desc}</p>
        )}
      </section>

      <section className="cv-panel cv-io">
        <div className="cv-editor-block">
          <div className="cv-meta">
            <span className="cv-meta-label">明文 / PLAINTEXT</span>
            <span className="cv-meta-right">
              <span className="cv-bytes">{byteLength(plain)} B</span>
              <button type="button" className="cv-mini-btn" onClick={clearAll}>清空</button>
            </span>
          </div>
          <textarea
            ref={plainRef}
            className="cv-editor"
            placeholder="在这里输入要处理的内容…"
            value={plain}
            onChange={(e) => {
              setPlain(e.target.value)
              scheduleAuto('encode')
            }}
            onKeyDown={onEditorKeyDown('plain')}
            spellCheck={false}
            autoComplete="off"
          />
        </div>

        <div className="cv-io-bar">
          <span className="cv-io-line" aria-hidden="true" />
          <div className="cv-io-actions">
            <button type="button" className="cv-btn-main" disabled={busy} onClick={() => run('encode')}>
              ↓ {dirLabels.enc}
            </button>
            {!isHash && (
              <>
                <button type="button" className="cv-btn-main cv-btn-alt" disabled={busy} onClick={() => run('decode')}>
                  ↑ {dirLabels.dec}
                </button>
                <button type="button" className="cv-btn-ghost" disabled={busy} onClick={swap} title="交换明文与密文">
                  ⇄
                </button>
              </>
            )}
          </div>
          <span className="cv-io-line" aria-hidden="true" />
        </div>

        <div className={`cv-editor-block ${isHash ? 'locked' : ''}`}>
          <div className="cv-meta">
            <span className="cv-meta-label">
              {isHash ? '摘要 / DIGEST' : '密文 / CIPHER'}
              {zeroWidthHidden && <span className="cv-tag">隐形输出 · 直接复制即可</span>}
            </span>
            <span className="cv-meta-right">
              {isHash && (
                <span className="cv-fmt">
                  {['hex', 'base64'].map((f) => (
                    <button
                      key={f}
                      type="button"
                      className={`cv-fmt-btn ${hashFormat === f ? 'active' : ''}`}
                      onClick={() => { setHashFormat(f); if (plain.trim()) scheduleAuto('encode') }}
                    >
                      {f}
                    </button>
                  ))}
                </span>
              )}
              <span className="cv-bytes">{byteLength(cipher)} B</span>
              <button type="button" className="cv-mini-btn" onClick={copyCipher} disabled={!cipher}>复制</button>
            </span>
          </div>
          <textarea
            ref={cipherRef}
            className="cv-editor"
            placeholder={isHash ? '哈希是单向的，这里只作输出显示' : '编码 / 加密的结果会出现在这里，也可以粘贴到这里反向操作…'}
            value={cipher}
            readOnly={isHash}
            onChange={(e) => {
              setCipher(e.target.value)
              scheduleAuto('decode')
            }}
            onKeyDown={onEditorKeyDown('cipher')}
            spellCheck={false}
            autoComplete="off"
          />
          {isHash && (
            <div className="cv-lock">
              <span className="cv-lock-dot" aria-hidden="true" />
              单向散列 —— 摘要无法还原为原文，解码区已禁用
            </div>
          )}
        </div>
      </section>

      <footer className="cv-statusbar">
        <span className={`cv-status cv-status-${status.kind}`}>
          <i className="cv-dot" aria-hidden="true" />
          {busy ? '处理中…' : status.text}
        </span>
        <span className="cv-shortcut">Ctrl + Enter 快速执行 · 共 {MODES.reduce((n, m) => n + m.schemes.length, 0)} 种方案</span>
      </footer>

      {errorModal && (
        <div className="cv-modal-mask" role="dialog" aria-modal="true" aria-label={errorModal.title} onClick={() => setErrorModal(null)}>
          <div className="cv-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cv-modal-head">
              <span className="cv-modal-badge" aria-hidden="true">!</span>
              <h2 className="cv-modal-title">{errorModal.title}</h2>
            </div>
            <p className="cv-modal-msg">{errorModal.message}</p>
            <div className="cv-modal-actions">
              <button type="button" className="cv-btn-main" autoFocus onClick={() => setErrorModal(null)}>知道了</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="cv-toast">{toast}</div>}

      <Link to="/" className="cv-back">← 返回首页</Link>
    </div>
  )
}
