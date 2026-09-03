// 编解码工具库 · 字节层
// 统一处理 UTF-8 / latin1 / hex / 大整数与字节流之间的转换，
// 所有"输入不合法"的场景统一抛 CodecError，由页面层负责弹窗。

export class CodecError extends Error {
  constructor(message) {
    super(message)
    this.name = 'CodecError'
  }
}

const textEncoder = new TextEncoder()

export const utf8ToBytes = (text) => Array.from(textEncoder.encode(text))
export const byteLength = (text) => textEncoder.encode(text).length

// 解码为 UTF-8；strict 为 true 时，字节流若不是合法 UTF-8 会报错
const looseDecoder = new TextDecoder('utf-8')
export function bytesToUtf8(bytes, { strict = false } = {}) {
  const text = looseDecoder.decode(new Uint8Array(bytes))
  if (strict && utf8ToBytes(text).join(',') !== Array.from(bytes).join(',')) {
    throw new CodecError('解码结果不是合法的 UTF-8 文本，输入可能不是本方案编码的内容')
  }
  return text
}

// latin1（每字节一个字符），供 btoa/atob 与二进制类方案桥接
export function bytesToLatin1(bytes) {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.slice(i, i + 0x8000))
  }
  return s
}

export function latin1ToBytes(str) {
  const out = new Array(str.length)
  for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 0xff
  return out
}

export function bytesToHex(bytes) {
  let out = ''
  for (const b of bytes) out += b.toString(16).padStart(2, '0')
  return out
}

export function hexToBytes(hex) {
  const clean = hex.replace(/[\s,:_]+/g, '')
  if (!clean) return []
  if (!/^[0-9a-fA-F]+$/.test(clean)) {
    const bad = clean.match(/[^0-9a-fA-F]/)[0]
    throw new CodecError(`「${bad}」不是十六进制字符（只能包含 0-9 与 a-f）`)
  }
  if (clean.length % 2 !== 0) {
    throw new CodecError('十六进制串长度为奇数，缺少半字节')
  }
  const out = new Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16)
  return out
}

// 大整数与字节流（大端序）。空字节流约定为 0n。
export function bytesToBigInt(bytes) {
  let v = 0n
  for (const b of bytes) v = (v << 8n) | BigInt(b)
  return v
}

export function bigIntToBytes(v) {
  if (v <= 0n) return v === 0n ? [] : []
  const out = []
  while (v > 0n) {
    out.unshift(Number(v & 0xffn))
    v >>= 8n
  }
  return out
}

// 字节流 <-> 标准字母表 Base64（无需 btoa，避免 Unicode 限制）
export function bytesToBase64(bytes, alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/') {
  let out = ''
  let i = 0
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]
    out += alphabet[(n >> 18) & 63] + alphabet[(n >> 12) & 63] + alphabet[(n >> 6) & 63] + alphabet[n & 63]
  }
  const rem = bytes.length - i
  if (rem === 1) {
    const n = bytes[i] << 16
    out += alphabet[(n >> 18) & 63] + alphabet[(n >> 12) & 63] + '=='
  } else if (rem === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8)
    out += alphabet[(n >> 18) & 63] + alphabet[(n >> 12) & 63] + alphabet[(n >> 6) & 63] + '='
  }
  return out
}

export function base64ToBytes(str, alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/') {
  const rev = base64Rev(alphabet)
  const s = str.replace(/\s+/g, '').replace(/=+$/, '')
  if (!s) return []
  const out = []
  let acc = 0
  let bits = 0
  for (const ch of s) {
    const v = rev[ch]
    if (v === undefined) {
      throw new CodecError(`「${ch}」不在 Base64 字母表中（Base64 只包含 A-Z、a-z、0-9、+、/ 与填充 =）`)
    }
    acc = (acc << 6) | v
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out.push((acc >> bits) & 0xff)
    }
  }
  if (s.length % 4 === 1) {
    throw new CodecError('Base64 长度不合法：去掉填充后长度除以 4 不应余 1')
  }
  return out
}

const revCache = new Map()
function base64Rev(alphabet) {
  if (revCache.has(alphabet)) return revCache.get(alphabet)
  const rev = {}
  for (let i = 0; i < alphabet.length; i++) rev[alphabet[i]] = i
  revCache.set(alphabet, rev)
  return rev
}

// 二进制按位流缓冲：把字节流按每 n 位读出（MSB 优先）
export function bitReader(bytes) {
  let pos = 0
  return () => {
    if (pos >= bytes.length * 8) return null
    const byte = bytes[pos >> 3]
    const bit = 7 - (pos & 7)
    pos++
    return (byte >> bit) & 1
  }
}

// 把 0..max 的值序列按 n 位打包为字节流
export function packBits(values, bitsPerValue) {
  let acc = 0
  let bits = 0
  const out = []
  for (const v of values) {
    acc = (acc << bitsPerValue) | v
    bits += bitsPerValue
    while (bits >= 8) {
      bits -= 8
      out.push((acc >> bits) & 0xff)
    }
  }
  return out
}

export function pkcs7Pad(bytes, blockSize) {
  const pad = blockSize - (bytes.length % blockSize)
  return [...bytes, ...new Array(pad).fill(pad)]
}

export function pkcs7Unpad(bytes, blockSize) {
  if (bytes.length === 0 || bytes.length % blockSize !== 0) {
    throw new CodecError('数据长度不是块大小的整数倍，无法去除填充')
  }
  const pad = bytes[bytes.length - 1]
  if (pad < 1 || pad > blockSize || bytes.slice(bytes.length - pad).some((b) => b !== pad)) {
    throw new CodecError('填充校验失败：密钥不匹配或数据已损坏')
  }
  return bytes.slice(0, bytes.length - pad)
}

// 模 26 逆元（仿射密码用）
export function modInverse(a, m = 26) {
  let [old, now] = [a % m, m]
  let [x, y] = [1, 0]
  while (now !== 0) {
    const q = Math.floor(old / now)
    ;[old, now] = [now, old - q * now]
    ;[x, y] = [y, x - q * y]
  }
  if (old !== 1) throw new CodecError(`系数 a = ${a} 与 26 不互质，不存在逆元`)
  return ((x % m) + m) % m
}

export const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b))

export function rotl32(x, n) {
  return ((x << n) | (x >>> (32 - n))) >>> 0
}
