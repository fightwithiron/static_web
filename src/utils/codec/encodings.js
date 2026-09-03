// 编解码模式 · 27 种双向方案（编码 encode / 解码 decode）
// 惯例：encode(text, params) -> string；任何不合法输入抛 CodecError。
import {
  CodecError, utf8ToBytes, bytesToUtf8, byteLength,
  bytesToLatin1, latin1ToBytes, bytesToHex, hexToBytes,
  bytesToBase64, base64ToBytes, bytesToBigInt, bigIntToBytes,
  packBits,
} from './bytes.js'

const B64_STD = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const B64_URL = B64_STD.slice(0, 62) + '-_'

// ---------- Base64 家族 ----------

function b64Encode(text, alphabet) {
  const b64 = bytesToBase64(utf8ToBytes(text), alphabet)
  return alphabet === B64_URL ? b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : b64
}

function b64Decode(text, alphabet) {
  let s = text.trim()
  if (alphabet === B64_URL) s = s.replace(/-/g, '+').replace(/_/g, '/')
  if (!s) return ''
  // 替换回标准字母表后按标准表解码
  return bytesToUtf8(base64ToBytes(s, B64_STD), { strict: true })
}

// ---------- 进制类（bigint） ----------

function baseNCodec(alphabet, name) {
  const rev = {}
  for (let i = 0; i < alphabet.length; i++) rev[alphabet[i]] = i
  const base = BigInt(alphabet.length)
  return {
    encode(text) {
      if (!text) return ''
      const bytes = utf8ToBytes(text)
      let n = bytesToBigInt(bytes)
      if (n === 0n) return alphabet[0]
      let out = ''
      while (n > 0n) {
        out = alphabet[Number(n % base)] + out
        n /= base
      }
      // UTF-8 文本不含 0x00 字节，但前导高位字节会影响进制表示吗？不会，bigint 无前导零概念
      return out
    },
    decode(text) {
      const s = text.trim().replace(/\s+/g, '')
      if (!s) return ''
      let n = 0n
      for (const ch of s) {
        const v = rev[ch]
        if (v === undefined) throw new CodecError(`「${ch}」不在 ${name} 字母表中（字母表：${alphabet.slice(0, 16)}…）`)
        n = n * base + BigInt(v)
      }
      return bytesToUtf8(bigIntToBytes(n), { strict: true })
    },
  }
}

// ---------- Base32 (RFC 4648) ----------

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function base32Encode(text) {
  const bytes = utf8ToBytes(text)
  if (!bytes.length) return ''
  let out = ''
  let acc = 0
  let bits = 0
  for (const b of bytes) {
    acc = (acc << 8) | b
    bits += 8
    while (bits >= 5) {
      bits -= 5
      out += B32[(acc >> bits) & 31]
    }
  }
  if (bits > 0) out += B32[(acc << (5 - bits)) & 31]
  while (out.length % 8 !== 0) out += '='
  return out
}

function base32Decode(text) {
  const s = text.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '')
  if (!s) return ''
  const out = []
  let acc = 0
  let bits = 0
  for (const ch of s) {
    const v = B32.indexOf(ch)
    if (v < 0) throw new CodecError(`「${ch}」不是 Base32 字符（Base32 只含 A-Z 和 2-7）`)
    acc = (acc << 5) | v
    bits += 5
    if (bits >= 8) {
      bits -= 8
      out.push((acc >> bits) & 0xff)
    }
  }
  if ([1, 3, 6].includes(s.length % 8)) {
    throw new CodecError('Base32 长度不合法：编码后长度不可能是 8 除余 ' + (s.length % 8))
  }
  return bytesToUtf8(out, { strict: true })
}

// ---------- Base58 (Bitcoin 字母表) ----------

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

function base58Encode(text) {
  const bytes = utf8ToBytes(text)
  let zeros = 0
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++
  let n = bytesToBigInt(bytes)
  let out = ''
  while (n > 0n) {
    out = B58[Number(n % 58n)] + out
    n /= 58n
  }
  return '1'.repeat(zeros) + out
}

function base58Decode(text) {
  const s = text.trim().replace(/\s+/g, '')
  if (!s) return ''
  const bad = s.match(/[0OIl]/)
  if (bad) throw new CodecError(`「${bad[0]}」是 Base58 排除的易混淆字符（0、O、I、l 不参与编码）`)
  let zeros = 0
  while (zeros < s.length && s[zeros] === '1') zeros++
  let n = 0n
  for (const ch of s) {
    const v = B58.indexOf(ch)
    if (v < 0) throw new CodecError(`「${ch}」不在 Base58 字母表中`)
    n = n * 58n + BigInt(v)
  }
  const body = bigIntToBytes(n)
  return bytesToUtf8([...new Array(zeros).fill(0), ...body], { strict: true })
}

// ---------- Base85 / ASCII85 ----------

function ascii85Encode(text) {
  const bytes = utf8ToBytes(text)
  let out = ''
  let i = 0
  for (; i + 4 <= bytes.length; i += 4) {
    let n = ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0
    if (n === 0) { out += 'z'; continue }
    const d = []
    for (let k = 4; k >= 0; k--) { d[k] = n % 85; n = Math.floor(n / 85) }
    out += d.map((v) => String.fromCharCode(v + 33)).join('')
  }
  const rem = bytes.length - i
  if (rem > 0) {
    const chunk = [...bytes.slice(i), ...new Array(4 - rem).fill(0)]
    let n = ((chunk[0] << 24) | (chunk[1] << 16) | (chunk[2] << 8) | chunk[3]) >>> 0
    const d = []
    for (let k = 4; k >= 0; k--) { d[k] = n % 85; n = Math.floor(n / 85) }
    out += d.slice(0, rem + 1).map((v) => String.fromCharCode(v + 33)).join('')
  }
  return out
}

function ascii85Decode(text) {
  const src = [...text.replace(/\s+/g, '')]
  if (!src.length) return ''
  const groups = []
  let pending = []
  let pos = 0
  for (const ch of src) {
    if (ch === 'z') {
      if (pending.length) throw new CodecError('「z」只能出现在完整的 5 字符组边界上')
      groups.push([0, 0, 0, 0])
      pos += 4
      continue
    }
    const v = ch.charCodeAt(0) - 33
    if (v < 0 || v > 84) throw new CodecError(`「${ch}」不在 ASCII85 字母表（! 到 u）中`)
    pending.push(v)
    if (pending.length === 5) {
      let n = 0
      for (const d of pending) n = n * 85 + d
      if (n > 0xffffffff) throw new CodecError('ASCII85 组值越界，数据已损坏')
      groups.push([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff])
      pos += 4
      pending = []
    }
  }
  if (pending.length === 1) throw new CodecError('ASCII85 长度不合法：末尾孤零零剩一个字符')
  if (pending.length > 1) {
    // 末组按标准补 'u'（84），并按字符数截断输出
    let n = 0
    const g = [...pending, ...new Array(5 - pending.length).fill(84)]
    for (const d of g) n = n * 85 + d
    const bytes = [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]
    groups.push(bytes.slice(0, pending.length - 1))
    pos += pending.length - 1
  }
  const out = groups.flat()
  return bytesToUtf8(pos === out.length ? out : out.slice(0, pos), { strict: true })
}

// ---------- Z85 (ZeroMQ 字母表) ----------

const Z85 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.-:+=^!/*?&<>()[]{}@%$#'

function z85Encode(text) {
  let bytes = utf8ToBytes(text)
  const rem = bytes.length % 4
  if (rem) bytes = [...bytes, ...new Array(4 - rem).fill(4 - rem)] // PKCS7 思想，便于解码还原
  let out = ''
  for (let i = 0; i < bytes.length; i += 4) {
    let n = ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0
    const d = []
    for (let k = 4; k >= 0; k--) { d[k] = n % 85; n = Math.floor(n / 85) }
    out += d.map((v) => Z85[v]).join('')
  }
  return out
}

function z85Decode(text) {
  const s = text.replace(/\s+/g, '')
  if (!s) return ''
  if (s.length % 5 !== 0) throw new CodecError('Z85 长度必须是 5 的倍数，当前长度 ' + s.length)
  const out = []
  for (let i = 0; i < s.length; i += 5) {
    let n = 0
    for (let k = 0; k < 5; k++) {
      const v = Z85.indexOf(s[i + k])
      if (v < 0) throw new CodecError(`「${s[i + k]}」不在 Z85 字母表中`)
      n = n * 85 + v
    }
    if (n > 0xffffffff) throw new CodecError('Z85 组值越界，数据已损坏')
    out.push((n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff)
  }
  const pad = out[out.length - 1]
  const trimmed = pad >= 1 && pad <= 4 ? out.slice(0, out.length - pad) : out
  return bytesToUtf8(trimmed, { strict: true })
}

// ---------- Base91 (basE91) ----------

const B91 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$%&()*+,./:;<=>?@[]^_`{|}~"'

function base91Encode(text) {
  const bytes = utf8ToBytes(text)
  let out = ''
  let b = 0
  let n = 0
  for (const byte of bytes) {
    b |= byte << n
    n += 8
    if (n > 13) {
      let v = b & 8191
      if (v > 88) { b >>= 13; n -= 13 } else { v = b & 16383; b >>= 14; n -= 14 }
      out += B91[v % 91] + B91[Math.floor(v / 91)]
    }
  }
  if (n) {
    out += B91[b % 91]
    if (n > 7 || b > 90) out += B91[Math.floor(b / 91)]
  }
  return out
}

function base91Decode(text) {
  const s = text.replace(/\s+/g, '')
  if (!s) return ''
  const out = []
  let v = -1
  let b = 0
  let n = 0
  for (const ch of s) {
    const c = B91.indexOf(ch)
    if (c < 0) throw new CodecError(`「${ch}」不在 basE91 字母表中`)
    if (v < 0) { v = c; continue }
    v += c * 91
    b |= v << n
    n += (v & 8191) > 88 ? 13 : 14
    while (n > 7) {
      out.push(b & 255)
      b >>= 8
      n -= 8
    }
    v = -1
  }
  if (v >= 0) out.push((b | (v << n)) & 255)
  return bytesToUtf8(out, { strict: true })
}

// ---------- Base45 (RFC 9285) ----------

const B45 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:'

function base45Encode(text) {
  const bytes = utf8ToBytes(text)
  let out = ''
  for (let i = 0; i < bytes.length; i += 2) {
    if (i + 1 < bytes.length) {
      let n = bytes[i] * 256 + bytes[i + 1]
      const d = []
      for (let k = 0; k < 3; k++) { d.push(B45[n % 45]); n = Math.floor(n / 45) }
      out += d.join('')
    } else {
      let n = bytes[i]
      const d = []
      for (let k = 0; k < 2; k++) { d.push(B45[n % 45]); n = Math.floor(n / 45) }
      out += d.join('')
    }
  }
  return out
}

function base45Decode(text) {
  const s = text.replace(/\s+$/, '')
  if (!s) return ''
  if (s.length % 3 === 1) throw new CodecError('Base45 长度不合法：长度除以 3 不能余 1')
  const out = []
  for (let i = 0; i < s.length; i += 3) {
    const pair = s.length - i >= 3 ? 3 : 2
    let n = 0
    for (let k = pair - 1; k >= 0; k--) {
      const v = B45.indexOf(s[i + k])
      if (v < 0) throw new CodecError(`「${s[i + k]}」不在 Base45 字母表中（Base45 不含小写字母）`)
      n = n * 45 + v
    }
    if (pair === 3) {
      if (n > 65535) throw new CodecError('Base45 三字符组值越界（可能因使用了全角或形近字符）')
      out.push((n >> 8) & 0xff, n & 0xff)
    } else {
      if (n > 255) throw new CodecError('Base45 两字符组值越界（不能大于 1024）')
      out.push(n)
    }
  }
  return bytesToUtf8(out, { strict: true })
}

// ---------- URL 百分号编码 ----------

function urlEncode(text) {
  return encodeURIComponent(text)
}

function urlDecode(text) {
  const s = text.trim()
  if (!s) return ''
  try {
    return decodeURIComponent(s.replace(/\+/g, '%20'))
  } catch {
    const m = s.match(/%(?![0-9a-fA-F]{2})/g)
    throw new CodecError(
      m
        ? '百分号后没有跟随两位十六进制数字（如 %E4%B8%AD），请检查完整复制'
        : '包含残缺的百分号转义序列，请检查是否被截断'
    )
  }
}

// ---------- Unicode 转义 \uXXXX ----------

const hex4 = (n) => n.toString(16).padStart(4, '0')

function unicodeEscapeEncode(text) {
  let out = ''
  for (const ch of text) {
    const cp = ch.codePointAt(0)
    if (cp > 0xffff) {
      const v = cp - 0x10000
      out += '\\u' + hex4(Math.floor(v / 0x400) + 0xd800) + '\\u' + hex4((v % 0x400) + 0xdc00)
    } else {
      out += '\\u' + hex4(cp)
    }
  }
  return out
}

function unicodeEscapeDecode(text) {
  const s = text.trim()
  if (!s) return ''
  if (!s.includes('\\u')) {
    throw new CodecError('没有找到 \\u 转义序列，请确认输入的是类似 \\u4f60\\u597d 的内容')
  }
  return s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
}

// ---------- HTML 实体 ----------

const HTML_NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0',
  copy: '©', reg: '®', trade: '™', hellip: '…', mdash: '—', ndash: '–',
  laquo: '«', raquo: '»', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’',
  times: '×', divide: '÷', deg: '°', middot: '·', sect: '§', para: '¶',
}

function htmlEntityEncode(text) {
  let out = ''
  for (const ch of text) {
    if (ch === '&') out += '&amp;'
    else if (ch === '<') out += '&lt;'
    else if (ch === '>') out += '&gt;'
    else if (ch === '"') out += '&quot;'
    else if (ch === "'") out += '&apos;'
    else if (ch.codePointAt(0) < 128) out += ch
    else out += '&#' + ch.codePointAt(0) + ';'
  }
  return out
}

function htmlEntityDecode(text) {
  const s = text.trim()
  if (!s) return ''
  if (!s.includes('&')) return s // 纯 ASCII 输入的编码结果就是原文
  return s.replace(/&(#[xX]?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (whole, body) => {
    if (body[0] === '#') {
      const cp = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
      if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) throw new CodecError(`实体 ${whole} 的码点超出范围`)
      return String.fromCodePoint(cp)
    }
    const named = HTML_NAMED[body.toLowerCase()]
    if (named === undefined) throw new CodecError(`未知 HTML 实体 ${whole}`)
    return named
  })
}

// ---------- 二进制 / 八进制 ----------

function binaryEncode(text) {
  return utf8ToBytes(text).map((b) => b.toString(2).padStart(8, '0')).join(' ')
}

function binaryDecode(text) {
  const s = text.replace(/[^01]/g, '')
  if (!s) throw new CodecError('没有找到 0 或 1，二进制编码只接受 0/1（可用空格分隔每 8 位）')
  if (s.length % 8 !== 0) throw new CodecError(`二进制位数（${s.length}）不是 8 的倍数，请检查是否有遗漏`)
  const out = []
  for (let i = 0; i < s.length; i += 8) out.push(parseInt(s.slice(i, i + 8), 2))
  return bytesToUtf8(out, { strict: true })
}

function octalEncode(text) {
  return utf8ToBytes(text).map((b) => b.toString(8).padStart(3, '0')).join(' ')
}

function octalDecode(text) {
  const tokens = text.trim().split(/[\s,]+/).filter(Boolean)
  if (!tokens.length) throw new CodecError('请输入八进制编码内容（每字节 3 位 0-7，空格分隔）')
  const out = []
  for (const t of tokens) {
    if (!/^[0-7]{3}$/.test(t)) throw new CodecError(`「${t}」不是合法的八进制字节（需要 3 位 0-7 数字）`)
    out.push(parseInt(t, 8))
  }
  return bytesToUtf8(out, { strict: true })
}

// ---------- 摩斯电码 ----------

const MORSE = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....',
  I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.',
  Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-',
  Y: '-.--', Z: '--..',
  0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....',
  6: '-....', 7: '--...', 8: '---..', 9: '----.',
  '.': '.-.-.-', ',': '--..--', '?': '..--..', "'": '.----.', '!': '-.-.--',
  '/': '-..-.', '(': '-.--.', ')': '-.--.-', '&': '.-...', ':': '---...',
  ';': '-.-.-.', '=': '-...-', '+': '.-.-.', '-': '-....-', '_': '..--.-',
  '"': '.-..-.', '$': '...-..-', '@': '.--.-.',
}
const MORSE_REV = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]))

function morseEncode(text) {
  const words = text.toUpperCase().split(/\s+/).filter(Boolean)
  if (!words.length) return ''
  return words
    .map((word) =>
      [...word]
        .map((ch) => {
          const code = MORSE[ch]
          if (!code) throw new CodecError(`「${ch}」无法用摩斯电码表示（仅支持英文字母、数字与常用标点）`)
          return code
        })
        .join(' ')
    )
    .join(' / ')
}

function morseDecode(text) {
  const s = text.trim()
  if (!s) return ''
  if (!/^[.\-\s/|]+$/.test(s.replace(/_/g, '-'))) {
    const bad = [...s].find((c) => !'.- /|_'.includes(c))
    throw new CodecError(`「${bad}」不是摩斯电码符号（只接受 . - / 和空格）`)
  }
  return s
    .replace(/\|/g, '/')
    .split('/')
    .map((word) =>
      word
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((code) => {
          const ch = MORSE_REV[code]
          if (!ch) throw new CodecError(`「${code}」不是合法的摩斯电码，请检查点划是否完整`)
          return ch
        })
        .join('')
    )
    .join(' ')
}

// ---------- Quoted-Printable ----------

function qpEncode(text) {
  const bytes = utf8ToBytes(text)
  let out = ''
  let lineLen = 0
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]
    const isLast = i === bytes.length - 1
    let tok
    if (b === 32 || b === 9) tok = isLast ? '=' + b.toString(16).toUpperCase().padStart(2, '0') : String.fromCharCode(b)
    else if (b >= 33 && b <= 126 && b !== 61) tok = String.fromCharCode(b)
    else tok = '=' + b.toString(16).toUpperCase().padStart(2, '0')
    if (lineLen + tok.length > 75) {
      out += '=\r\n'
      lineLen = 0
      if (b === 32 || b === 9) tok = '=' + b.toString(16).toUpperCase().padStart(2, '0')
    }
    out += tok
    lineLen += tok.length
  }
  return out
}

function qpDecode(text) {
  const s = text.replace(/=\r?\n/g, '')
  if (!s.trim()) return ''
  const out = []
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '=') {
      const m = /^=([0-9A-Fa-f]{2})/.exec(s.slice(i))
      if (!m) throw new CodecError('孤立的「=」：Quoted-Printable 中等号后必须跟两位十六进制（或作为软换行 =\\n）')
      out.push(parseInt(m[1], 16))
      i += 2
    } else {
      out.push(s.charCodeAt(i) & 0xff)
    }
  }
  return bytesToUtf8(out, { strict: true })
}

// ---------- Uuencode ----------

const uu6 = (v) => (v === 0 ? '`' : String.fromCharCode(v + 32))

function uuencodeEncode(text) {
  const bytes = utf8ToBytes(text)
  const lines = []
  for (let i = 0; i < bytes.length; i += 45) {
    const chunk = bytes.slice(i, i + 45)
    let line = String.fromCharCode(chunk.length + 32)
    for (let j = 0; j < chunk.length; j += 3) {
      const b0 = chunk[j]
      const b1 = j + 1 < chunk.length ? chunk[j + 1] : 0
      const b2 = j + 2 < chunk.length ? chunk[j + 2] : 0
      const n = (b0 << 16) | (b1 << 8) | b2
      line += uu6((n >> 18) & 63) + uu6((n >> 12) & 63) + uu6((n >> 6) & 63) + uu6(n & 63)
    }
    lines.push(line)
  }
  return lines.join('\n')
}

function uuencodeDecode(text) {
  const rows = text.split(/\r?\n/)
  const out = []
  for (const row of rows) {
    const line = row.replace(/\s+$/, '')
    if (!line || /^begin\s/i.test(line) || /^end$/i.test(line) || /^sum\b/i.test(line)) continue
    const len = line.charCodeAt(0) - 32
    if (len < 0 || len > 45) throw new CodecError('行首的长度字符不合法，这可能不是 uuencode 数据')
    const body = line.slice(1)
    if (body.length % 4 !== 0) throw new CodecError('某行的数据长度不是 4 的倍数，数据可能被截断')
    const bytes = []
    for (let i = 0; i < body.length; i += 4) {
      const g = [0, 1, 2, 3].map((k) => {
        const c = body[i + k]
        const v = c === '`' ? 0 : c.charCodeAt(0) - 32
        if (v < 0 || v > 63) throw new CodecError(`「${c}」不在 uuencode 字母表中`)
        return v
      })
      const n = (g[0] << 18) | (g[1] << 12) | (g[2] << 6) | g[3]
      bytes.push((n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff)
    }
    out.push(...bytes.slice(0, len))
  }
  if (!out.length) throw new CodecError('没有解析到任何 uuencode 数据行')
  return bytesToUtf8(out, { strict: true })
}

// ---------- 与佛论禅 / 与熊论道 ----------
// 原理：UTF-8 字节流视为大整数，按自定义汉字字母表做进制转换。
// 字母表为本站自定版本，不保证与其他网站的实现互通。

const BUDDHA = '冥奢梵呐俱哆怯垢罚夷遮醯耶奚赦刹暹堰袈娑婆诃般若罽蜜迦铄提幢夜帝利南无阿弥他伽都讫'
const BEAR = '嗷呜啊哈嘿哟嘻呵咩吼嗯呐哇哦耶咦哼噜嘤哔咔咚吱嘎叮铃喵汪嗥啸吟嘅喽噢喔'

function hanziCodec(alphabet, prefix, emptyHint, badChar, badPrefix) {
  const rev = {}
  for (let i = 0; i < alphabet.length; i++) rev[alphabet[i]] = i
  const base = BigInt(alphabet.length)
  return {
    encode(text) {
      if (!text) return prefix
      let n = bytesToBigInt(utf8ToBytes(text))
      if (n === 0n) return prefix + alphabet[0]
      let out = ''
      while (n > 0n) {
        out = alphabet[Number(n % base)] + out
        n /= base
      }
      return prefix + out
    },
    decode(text) {
      const s = text.trim()
      if (!s) return ''
      // 前缀可有可无，全角/半角冒号都能接受
      const stripped = s.replace(new RegExp('^' + prefix.slice(0, 2) + '[:：]?\\s*'), '')
      if (!stripped) throw new CodecError(emptyHint)
      let n = 0n
      for (const ch of stripped) {
        const v = rev[ch]
        if (v === undefined) throw new CodecError(`${badChar}「${ch}」不在字母表里，${badPrefix}`)
        n = n * base + BigInt(v)
      }
      return bytesToUtf8(bigIntToBytes(n), { strict: true })
    },
  }
}

// ---------- Emoji 密码 ----------
// Base64 的 64 字符 + 填充位，映射到 65 个单码点 emoji

const EMOJI = [
  '😀','😁','😂','🤣','😃','😄','😅','😆','😉','😊','😋','😎','😍','😘','😗','😙',
  '😚','🙂','🤗','🤔','🤨','😐','😑','😶','🙄','😏','😣','😥','😮','🤐','😯','😪',
  '😫','😴','😌','😛','😜','😝','🤤','😒','😓','😔','🤑','🤢','🤮','🥵','🥶','🥴',
  '😵','🤠','🥳','🤓','🧐','😲','😷','🤒','🤕','🥺','😢','😭','😤','😠','😡','🤯',
  '👻',
]

function emojiEncode(text) {
  if (!text) return ''
  const b64 = bytesToBase64(utf8ToBytes(text), B64_STD)
  return [...b64].map((ch) => {
    const i = ch === '=' ? 64 : B64_STD.indexOf(ch)
    if (i < 0) throw new CodecError('内部错误：Base64 输出含未知字符')
    return EMOJI[i]
  }).join('')
}

function emojiDecode(text) {
  const chars = Array.from(text.replace(/\s+/g, ''))
  if (!chars.length) return ''
  const b64 = chars.map((em) => {
    const i = EMOJI.indexOf(em)
    if (i < 0) throw new CodecError(`「${em}」不在 Emoji 密码表里（可能混入了其他表情）`)
    return i === 64 ? '=' : B64_STD[i]
  }).join('')
  return bytesToUtf8(base64ToBytes(b64), { strict: true })
}

// ---------- 零宽字符隐写 ----------

const ZW_CHARS = ['\u200b', '\u200c', '\u200d', '\u2060']
const ZW_SET = new Set(ZW_CHARS)

function zeroWidthEncode(text) {
  const clean = [...text].filter((ch) => !ZW_SET.has(ch)).join('')
  if (!clean) return ''
  const bits = []
  for (const b of utf8ToBytes(clean)) {
    for (let k = 7; k >= 0; k--) bits.push((b >> k) & 1)
  }
  let out = ''
  for (let i = 0; i < bits.length; i += 2) {
    out += ZW_CHARS[bits[i] * 2 + (bits[i + 1] ?? 0)]
  }
  return out
}

function zeroWidthDecode(text) {
  const seq = [...text].filter((ch) => ZW_SET.has(ch))
  if (!seq.length) throw new CodecError('没有检测到零宽字符——这段内容里没有藏东西')
  const bits = []
  for (const ch of seq) bits.push(ZW_CHARS.indexOf(ch))
  return bytesToUtf8(packBits(bits, 2), { strict: true })
}

// ---------- Brainfuck ----------

function bfGenerateStrict(text) {
  const bytes = utf8ToBytes(text)
  let out = ''
  for (const target of bytes) {
    // 每字节独立：cell0 作循环计数器（进出后恒为 0），cell1 放值并输出
    if (target === 0) { out += '.'; }
    else {
      let bestCost = target
      let best = null
      for (let d = 2; d <= 16; d++) {
        const q = Math.floor(target / d)
        const r = target % d
        if (q === 0) continue
        const cost = q + d + r + 6
        if (cost < bestCost) { bestCost = cost; best = { q, d, r } }
      }
      if (best) {
        out += '+'.repeat(best.q) + '[>' + '+'.repeat(best.d) + '<-]>' + '+'.repeat(best.r) + '.'
      } else {
        out += '+'.repeat(target) + '.'
      }
    }
    out += '[-]<' // 就地清空 cell1，指针回到 cell0（其值本就为 0）
  }
  return out
}

function bfRun(code, { label = 'Brainfuck' } = {}) {
  const prog = code.replace(/[^+\-<>.,[\]]/g, '')
  const stack = []
  const jump = new Array(prog.length)
  for (let i = 0; i < prog.length; i++) {
    if (prog[i] === '[') stack.push(i)
    else if (prog[i] === ']') {
      if (!stack.length) throw new CodecError(`${label} 程序的中括号不配对（多了 ]）`)
      const open = stack.pop()
      jump[open] = i
      jump[i] = open
    }
  }
  if (stack.length) throw new CodecError(`${label} 程序的中括号不配对（少了 ]）`)
  const cells = new Uint8Array(30000)
  let ptr = 0
  let pc = 0
  let steps = 0
  const out = []
  while (pc < prog.length) {
    if (++steps > 5_000_000) throw new CodecError(`${label} 程序超过 500 万步仍未结束，疑似死循环`)
    switch (prog[pc]) {
      case '+': cells[ptr] = (cells[ptr] + 1) & 0xff; break
      case '-': cells[ptr] = (cells[ptr] - 1) & 0xff; break
      case '>': if (++ptr >= cells.length) throw new CodecError(`${label} 指针越过内存右边界`); break
      case '<': if (--ptr < 0) throw new CodecError(`${label} 指针越过内存左边界`); break
      case '.': out.push(cells[ptr]); break
      case ',': cells[ptr] = 0; break
      case '[': if (!cells[ptr]) pc = jump[pc]; break
      case ']': if (cells[ptr]) pc = jump[pc]; break
    }
    pc++
  }
  if (!out.length) throw new CodecError(`${label} 程序运行完了，但一个字节都没有输出`)
  return bytesToUtf8(out, { strict: true })
}

// ---------- Ook! ----------

const OOK_MAP = [
  ['>', ['Ook.', 'Ook?']], ['<', ['Ook?', 'Ook.']], ['+', ['Ook.', 'Ook.']],
  ['-', ['Ook!', 'Ook!']], ['.', ['Ook!', 'Ook.']], [',', ['Ook.', 'Ook!']],
  ['[', ['Ook!', 'Ook?']], [']', ['Ook?', 'Ook!']],
]
const OOK_REV = Object.fromEntries(OOK_MAP.map(([bf, pair]) => [pair.join(' '), bf]))

function ookEncode(text) {
  return bfGenerateStrict(text)
    .split('')
    .map((c) => OOK_MAP.find(([bf]) => bf === c)?.[1].join(' ') ?? '')
    .filter(Boolean)
    .join(' ')
}

function ookDecode(text) {
  const tokens = text.match(/Ook[.!?]/g)
  if (!tokens) throw new CodecError('没有找到任何 Ook! 指令（应为 Ook. / Ook? / Ook! 的两两组合）')
  if (tokens.length % 2 !== 0) throw new CodecError('Ook! 指令是成对出现的，当前数量是奇数')
  const bf = []
  for (let i = 0; i < tokens.length; i += 2) {
    const bfCmd = OOK_REV[tokens[i] + ' ' + tokens[i + 1]]
    if (!bfCmd) throw new CodecError(`「${tokens[i]} ${tokens[i + 1]}」不是合法的 Ook! 指令组合`)
    bf.push(bfCmd)
  }
  return bfRun(bf.join(''), { label: 'Ook!' })
}

// ---------- 字符串反转 ----------

function reverseCodec(text) {
  return [...text].reverse().join('')
}

// ---------- 方案注册表 ----------

export const ENCODINGS = [
  // —— 常用 ——
  { id: 'base64', name: 'Base64', group: 'common', desc: '最通用的二进制转文本方案，输出以 = 结尾填充。', encode: (t) => b64Encode(t, B64_STD), decode: (t) => b64Decode(t, B64_STD) },
  { id: 'base64url', name: 'Base64（URL 安全）', group: 'common', desc: '把 + / 换成 - _ 并去掉填充，适合塞进 URL 或 JWT。', encode: (t) => b64Encode(t, B64_URL), decode: (t) => b64Decode(t, B64_URL) },
  { id: 'url', name: 'URL 编码（百分号）', group: 'common', desc: '浏览器地址栏里的 %E4%B8%AD 就是它，空格编码为 %20。', encode: urlEncode, decode: urlDecode },
  { id: 'hex', name: '十六进制 (Hex)', group: 'common', desc: '每字节两位 0-9 a-f，解码时容忍空格、冒号等分隔符。', encode: (t) => bytesToHex(utf8ToBytes(t)), decode: (t) => bytesToUtf8(hexToBytes(t), { strict: true }) },
  { id: 'base32', name: 'Base32', group: 'common', desc: 'RFC 4648，只含 A-Z 与 2-7，邮件和一次性验证码常用。', encode: base32Encode, decode: base32Decode },
  { id: 'base58', name: 'Base58', group: 'common', desc: '比特币同款，剔除了 0 O I l 四个易混淆字符。', encode: base58Encode, decode: base58Decode },
  { id: 'base85', name: 'Base85 (ASCII85)', group: 'common', desc: '每 4 字节压成 5 字符，比 Base64 更省空间，PDF 内嵌图片在用。', encode: ascii85Encode, decode: ascii85Decode },
  { id: 'unicode', name: 'Unicode 转义（\\uXXXX）', group: 'common', desc: 'JSON 与前端调试常见的 \\u4f60\\u597d 形式。', encode: unicodeEscapeEncode, decode: unicodeEscapeDecode },
  { id: 'html', name: 'HTML 实体', group: 'common', desc: '&lt; &amp;#169; 这类网页转义，防标签注入专用。', encode: htmlEntityEncode, decode: htmlEntityDecode },
  { id: 'binary', name: '二进制', group: 'common', desc: '每字节 8 位 0/1，空格分隔。', encode: binaryEncode, decode: binaryDecode },
  { id: 'octal', name: '八进制', group: 'common', desc: '每字节 3 位 0-7，空格分隔。', encode: octalEncode, decode: octalDecode },
  { id: 'morse', name: '摩斯电码', group: 'common', desc: '嘀嗒嘀嗒。仅支持英文字母、数字与常用标点。', encode: morseEncode, decode: morseDecode },
  // —— 冷门 ——
  { id: 'base36', name: 'Base36', group: 'nerdy', desc: '0-9 a-z 共 36 字符，短视频分享码同款进制。', ...baseNCodec('0123456789abcdefghijklmnopqrstuvwxyz', 'Base36') },
  { id: 'base62', name: 'Base62', group: 'nerdy', desc: '0-9 A-Z a-z，短链接服务最爱的进制。', ...baseNCodec('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', 'Base62') },
  { id: 'base91', name: 'Base91 (basE91)', group: 'nerdy', desc: 'Joachim Henke 设计，用满 91 个可打印字符，压缩率高于 Base85。', encode: base91Encode, decode: base91Decode },
  { id: 'base45', name: 'Base45', group: 'nerdy', desc: 'RFC 9285，欧盟电子疫苗证书使用的字母表。', encode: base45Encode, decode: base45Decode },
  { id: 'z85', name: 'Z85', group: 'nerdy', desc: 'ZeroMQ 规范的 85 进制，字母表与 ASCII85 不同。', encode: z85Encode, decode: z85Decode },
  { id: 'qp', name: 'Quoted-Printable', group: 'nerdy', desc: '邮件正文里的 =E4=B8=AD，75 列软换行的老规矩。', encode: qpEncode, decode: qpDecode },
  { id: 'uuencode', name: 'Uuencode', group: 'nerdy', desc: '比 Base64 更古老的邮件附件编码，Unix 时代活化石。', encode: uuencodeEncode, decode: uuencodeDecode },
  { id: 'rot13', name: 'ROT13', group: 'nerdy', desc: '字母表转半圈，Usenet 时代藏剧透的标配。', encode: (t) => rotN(t, 13), decode: (t) => rotN(t, 13) },
  // —— 整活 ——
  { id: 'buddha', name: '与佛论禅（佛曰）', group: 'fun', desc: '把想说的话变成一段经文。字母表为本站自定版本。', ...hanziCodec(BUDDHA, '佛曰：', '经文是空的，先输入要编码的内容', '这段经文我看不懂——', '佛祖也不认识这个字') },
  { id: 'bear', name: '与熊论道（熊曰）', group: 'fun', desc: '同款原理的熊猫语版本，输出全是嗷呜。', ...hanziCodec(BEAR, '熊曰：', '熊语是空的，先输入要编码的内容', '这不像熊说的话——', '熊听不懂这个字') },
  { id: 'emoji', name: 'Emoji 密码', group: 'fun', desc: '整段文字变成一串表情包，Base64 的皮肤。', encode: emojiEncode, decode: emojiDecode },
  { id: 'zerowidth', name: '零宽字符隐写', group: 'fun', desc: '把信息藏进看不见的零宽字符里，复制后看起来是空白。', encode: zeroWidthEncode, decode: zeroWidthDecode },
  { id: 'brainfuck', name: 'Brainfuck', group: 'fun', desc: '8 个指令的极简语言，编码即生成一段可运行的 BF 代码。', encode: bfGenerateStrict, decode: (t) => bfRun(t, { label: 'Brainfuck' }) },
  { id: 'ook', name: 'Ook!', group: 'fun', desc: 'Brainfuck 的猩猩语变体，全部由 Ook. Ook? Ook! 组成。', encode: ookEncode, decode: ookDecode },
  { id: 'reverse', name: '字符串反转', group: 'fun', desc: '把整句话倒过来，解码再倒一次。', encode: reverseCodec, decode: reverseCodec },
]

function rotN(text, n) {
  return [...text].map((c) => {
    const code = c.charCodeAt(0)
    if (code >= 65 && code <= 90) return String.fromCharCode(((code - 65 + n + 26) % 26) + 65)
    if (code >= 97 && code <= 122) return String.fromCharCode(((code - 97 + n + 26) % 26) + 97)
    return c
  }).join('')
}

export { rotN }
