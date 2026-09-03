// 哈希模式 · 14 种单向散列。接口统一为 async (text) => hex 字符串。
import { utf8ToBytes, rotl32 } from './bytes.js'

const toHex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')

// ---------- WebCrypto 系列（SHA-1 / 256 / 384 / 512） ----------

async function webSha(algo, text) {
  const digest = await crypto.subtle.digest(algo, new TextEncoder().encode(text))
  return toHex(new Uint8Array(digest))
}

// ---------- MD5（纯 JS，RFC 1321） ----------

function md5Bytes(bytes) {
  const len = bytes.length
  const padded = new Uint8Array((((len + 8) >> 6) + 1) << 6)
  padded.set(bytes)
  padded[len] = 0x80
  const dv = new DataView(padded.buffer)
  dv.setUint32(padded.length - 8, (len * 8) >>> 0, true)
  dv.setUint32(padded.length - 4, Math.floor((len * 8) / 0x100000000), true)

  const S = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ]
  const K = new Array(64)
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32)

  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476
  const M = new Array(16)
  for (let chunk = 0; chunk < padded.length; chunk += 64) {
    for (let j = 0; j < 16; j++) M[j] = dv.getUint32(chunk + j * 4, true)
    let A = a0, B = b0, C = c0, D = d0
    for (let i = 0; i < 64; i++) {
      let F, g
      if (i < 16) { F = (B & C) | (~B & D); g = i }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16 }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16 }
      else { F = C ^ (B | ~D); g = (7 * i) % 16 }
      F = (F + A + K[i] + M[g]) | 0
      A = D; D = C; C = B
      B = (B + rotl32(F, S[i])) | 0
    }
    a0 = (a0 + A) | 0; b0 = (b0 + B) | 0; c0 = (c0 + C) | 0; d0 = (d0 + D) | 0
  }
  const out = new Uint8Array(16)
  const odv = new DataView(out.buffer)
  odv.setUint32(0, a0 >>> 0, true)
  odv.setUint32(4, b0 >>> 0, true)
  odv.setUint32(8, c0 >>> 0, true)
  odv.setUint32(12, d0 >>> 0, true)
  return out
}

const md5 = async (text) => toHex(md5Bytes(utf8ToBytes(text)))

// ---------- SM3（国密 GB/T 32905-2016） ----------

function sm3Bytes(bytes) {
  const IV = [0x7380166f, 0x4914b2b9, 0x172442d7, 0xda8a0600, 0xa96f30bc, 0x163138aa, 0xe38dee4d, 0xb0fb0e4e]
  const len = bytes.length
  const padded = new Uint8Array((((len + 8) >> 6) + 1) << 6)
  padded.set(bytes)
  padded[len] = 0x80
  const dv = new DataView(padded.buffer)
  dv.setUint32(padded.length - 8, Math.floor((len * 8) / 0x100000000), false)
  dv.setUint32(padded.length - 4, (len * 8) >>> 0, false)

  const p0 = (x) => (x ^ rotl32(x, 9) ^ rotl32(x, 17)) >>> 0
  const p1 = (x) => (x ^ rotl32(x, 15) ^ rotl32(x, 23)) >>> 0

  const W = new Array(68)
  const Wp = new Array(64)
  let V = [...IV]
  for (let off = 0; off < padded.length; off += 64) {
    for (let j = 0; j < 16; j++) W[j] = dv.getUint32(off + j * 4, false)
    for (let j = 16; j < 68; j++) {
      W[j] = (p1(W[j - 16] ^ W[j - 9] ^ rotl32(W[j - 3], 15)) ^ rotl32(W[j - 13], 7) ^ W[j - 6]) >>> 0
    }
    for (let j = 0; j < 64; j++) Wp[j] = W[j] ^ W[j + 4]
    let [A, B, C, D, E, F, G, H] = V
    for (let j = 0; j < 64; j++) {
      const Tj = j < 16 ? 0x79cc4519 : 0x7a879d8a
      const ss1 = rotl32((rotl32(A, 12) + E + rotl32(Tj, j % 32)) >>> 0, 7)
      const ss2 = ss1 ^ rotl32(A, 12)
      const ff = j < 16 ? A ^ B ^ C : (A & B) | (A & C) | (B & C)
      const gg = j < 16 ? E ^ F ^ G : (E & F) | (~E & G)
      const tt1 = (ff + D + ss2 + Wp[j]) >>> 0
      const tt2 = (gg + H + ss1 + W[j]) >>> 0
      D = C; C = rotl32(B, 9); B = A; A = tt1
      H = G; G = rotl32(F, 19); F = E; E = p0(tt2)
    }
    const finals = [A, B, C, D, E, F, G, H]
    V = V.map((v, i) => (v ^ finals[i]) >>> 0)
  }
  const out = new Uint8Array(32)
  const odv = new DataView(out.buffer)
  V.forEach((v, i) => odv.setUint32(i * 4, v, false))
  return out
}

const sm3 = async (text) => toHex(sm3Bytes(utf8ToBytes(text)))

export { sm3Bytes, ripemd160Bytes, md5Bytes }

// ---------- RIPEMD-160 ----------

function ripemd160Bytes(bytes) {
  const ZL = [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    7, 4, 13, 1, 10, 6, 15, 3, 12, 0, 9, 5, 2, 14, 11, 8,
    3, 10, 14, 4, 9, 15, 8, 1, 2, 7, 0, 6, 13, 11, 5, 12,
    1, 9, 11, 10, 0, 8, 12, 4, 13, 3, 7, 15, 14, 5, 6, 2,
    4, 0, 5, 9, 7, 12, 2, 10, 14, 1, 3, 8, 11, 6, 15, 13,
  ]
  const ZR = [
    5, 14, 7, 0, 9, 2, 11, 4, 13, 6, 15, 8, 1, 10, 3, 12,
    6, 11, 3, 7, 0, 13, 5, 10, 14, 15, 8, 12, 4, 9, 1, 2,
    15, 5, 1, 3, 7, 14, 6, 9, 11, 8, 12, 2, 10, 0, 4, 13,
    8, 6, 4, 1, 3, 11, 15, 0, 5, 12, 2, 13, 9, 7, 10, 14,
    12, 15, 10, 4, 1, 5, 8, 7, 6, 2, 13, 14, 0, 3, 9, 11,
  ]
  const SL = [
    11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8,
    7, 6, 8, 13, 11, 9, 7, 15, 7, 12, 15, 9, 11, 7, 13, 12,
    11, 13, 6, 7, 14, 9, 13, 15, 14, 8, 13, 6, 5, 12, 7, 5,
    11, 12, 14, 15, 14, 15, 9, 8, 9, 14, 5, 6, 8, 6, 5, 12,
    9, 15, 5, 11, 6, 8, 13, 12, 5, 12, 13, 14, 11, 8, 5, 6,
  ]
  const SR = [
    8, 9, 9, 11, 13, 15, 15, 5, 7, 7, 8, 11, 14, 14, 12, 6,
    9, 13, 15, 7, 12, 8, 9, 11, 7, 7, 12, 7, 6, 15, 13, 11,
    9, 7, 15, 11, 8, 6, 6, 14, 12, 13, 5, 14, 13, 13, 7, 5,
    15, 5, 8, 11, 14, 14, 6, 14, 6, 9, 12, 9, 12, 5, 15, 8,
    8, 5, 12, 9, 12, 5, 14, 6, 8, 13, 6, 5, 15, 13, 11, 11,
  ]
  const KL = [0x00000000, 0x5a827999, 0x6ed9eba1, 0x8f1bbcdc, 0xa953fd4e]
  const KR = [0x50a28be6, 0x5c4dd124, 0x6d703ef3, 0x7a6d76e9, 0x00000000]
  const f = (j, x, y, z) =>
    j < 16 ? x ^ y ^ z
    : j < 32 ? (x & y) | (~x & z)
    : j < 48 ? (x | ~y) ^ z
    : j < 64 ? (x & z) | (y & ~z)
    : x ^ (y | ~z)

  const len = bytes.length
  const padded = new Uint8Array((((len + 8) >> 6) + 1) << 6)
  padded.set(bytes)
  padded[len] = 0x80
  const dv = new DataView(padded.buffer)
  dv.setUint32(padded.length - 8, (len * 8) >>> 0, true)
  dv.setUint32(padded.length - 4, Math.floor((len * 8) / 0x100000000), true)

  let h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0]
  for (let off = 0; off < padded.length; off += 64) {
    const X = new Array(16)
    for (let j = 0; j < 16; j++) X[j] = dv.getUint32(off + j * 4, true)
    let [A, B, C, D, E] = h
    let [A2, B2, C2, D2, E2] = h
    for (let j = 0; j < 80; j++) {
      const T = (rotl32((A + f(j, B, C, D) + X[ZL[j]] + KL[(j / 16) | 0]) >>> 0, SL[j]) + E) >>> 0
      A = E; E = D; D = rotl32(C, 10); C = B; B = T
      const T2 = (rotl32((A2 + f(79 - j, B2, C2, D2) + X[ZR[j]] + KR[(j / 16) | 0]) >>> 0, SR[j]) + E2) >>> 0
      A2 = E2; E2 = D2; D2 = rotl32(C2, 10); C2 = B2; B2 = T2
    }
    const combined = [
      (h[1] + C + D2) >>> 0,
      (h[2] + D + E2) >>> 0,
      (h[3] + E + A2) >>> 0,
      (h[4] + A + B2) >>> 0,
      (h[0] + B + C2) >>> 0,
    ]
    h = combined
  }
  const out = new Uint8Array(20)
  const odv = new DataView(out.buffer)
  // RIPEMD-160 摘要以小端序序列化
  h.forEach((v, i) => odv.setUint32(i * 4, v, true))
  return out
}

const ripemd160 = async (text) => toHex(ripemd160Bytes(utf8ToBytes(text)))

// ---------- 校验和 ----------

const CRC32_TABLE = (() => {
  const t = new Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) >>> 0 : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(bytes) {
  let c = 0xffffffff
  for (const b of bytes) c = CRC32_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return ((c ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0')
}

function crc16(bytes) {
  let c = 0xffff
  for (const b of bytes) {
    c ^= b << 8
    for (let k = 0; k < 8; k++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff
  }
  return c.toString(16).padStart(4, '0')
}

function adler32(bytes) {
  let a = 1
  let b = 0
  for (const x of bytes) {
    a = (a + x) % 65521
    b = (b + a) % 65521
  }
  return (((b << 16) | a) >>> 0).toString(16).padStart(8, '0')
}

function fnv1a(bytes) {
  let h = 0x811c9dc5
  for (const b of bytes) {
    h ^= b
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

// ---------- 字符串哈希（程序员梗） ----------

function djb2(text) {
  let h = 5381
  for (const ch of text) h = (Math.imul(h, 33) + ch.codePointAt(0)) >>> 0
  return (h >>> 0).toString(16).padStart(8, '0')
}

function javaHash(text) {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (Math.imul(31, h) + text.charCodeAt(i)) | 0
  return (h >>> 0).toString(16).padStart(8, '0')
}

// ---------- 注册表 ----------

export const HASHES = [
  { id: 'md5', name: 'MD5', group: 'common', desc: '经典 128 位摘要，速度快但早已不安全，仅适合校验文件完整性。', encode: md5 },
  { id: 'sha1', name: 'SHA-1', group: 'common', desc: '160 位，已被谷歌攻破碰撞，Git 还在用但新项目别选。', encode: (t) => webSha('SHA-1', t) },
  { id: 'sha256', name: 'SHA-256', group: 'common', desc: '当前默认选择：安全、通用，比特币工作量证明用的就是它。', encode: (t) => webSha('SHA-256', t) },
  { id: 'sha384', name: 'SHA-384', group: 'common', desc: 'SHA-512 的截断版，TLS 1.2+ 证书签名常见。', encode: (t) => webSha('SHA-384', t) },
  { id: 'sha512', name: 'SHA-512', group: 'common', desc: '512 位摘要，64 位平台上的吞吐量反而比 SHA-256 高。', encode: (t) => webSha('SHA-512', t) },
  { id: 'crc32', name: 'CRC32', group: 'common', desc: '严格说是校验和不是哈希：zip、gzip 文件尾部的那个数。', encode: async (t) => crc32(utf8ToBytes(t)) },
  { id: 'sm3', name: 'SM3（国密）', group: 'nerdy', desc: '国家密码标准 GB/T 32905，256 位，商用密码场景的 SHA-256 平替。', encode: sm3 },
  { id: 'ripemd160', name: 'RIPEMD-160', group: 'nerdy', desc: '比特币地址生成的第二道工序（SHA-256 之后再过一遍它）。', encode: ripemd160 },
  { id: 'adler32', name: 'Adler-32', group: 'nerdy', desc: 'zlib 作者 Mark Adler 的校验和，比 CRC32 更快但更弱。', encode: async (t) => adler32(utf8ToBytes(t)) },
  { id: 'crc16', name: 'CRC16-CCITT', group: 'nerdy', desc: '单片机与 Modbus 串口通信里的老朋友。', encode: async (t) => crc16(utf8ToBytes(t)) },
  { id: 'fnv1a', name: 'FNV-1a', group: 'nerdy', desc: 'Fowler–Noll–Vo，几乎每个语言的标准库哈希表都用过它。', encode: async (t) => fnv1a(utf8ToBytes(t)) },
  { id: 'djb2', name: 'DJB2', group: 'fun', desc: 'Daniel Bernstein 1991 年的一封邮件里提出的哈希，5381 起步乘 33。', encode: async (t) => djb2(t) },
  { id: 'javahash', name: 'Java hashCode()', group: 'fun', desc: 'Java 每个 String 自带的哈希。面试题：为什么 31？——便宜。', encode: async (t) => javaHash(t) },
]
