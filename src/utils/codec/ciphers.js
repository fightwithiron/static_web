// 加密解密模式 · 14 种方案（对称加密与经典密码）。
// 二进制密文统一输出 Base64；经典密码（只动字母）直接输出字母。
import {
  CodecError, utf8ToBytes, bytesToUtf8, bytesToBase64, base64ToBytes,
  bytesToHex, hexToBytes, pkcs7Pad, pkcs7Unpad, modInverse, gcd, rotl32,
} from './bytes.js'
import { sm3Bytes } from './hashes.js'
import { rotN } from './encodings.js'

const requireKey = (key, what = '密钥') => {
  if (!key || !String(key).trim()) throw new CodecError(`请先填写${what}，加密和解密必须使用同一个${what}`)
  return String(key)
}

const b64 = (bytes) => bytesToBase64(bytes)
const unb64 = (text, label) => {
  const clean = text.replace(/\s+/g, '')
  if (!clean) return []
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) {
    throw new CodecError(`${label}的密文应是 Base64 字符串，但包含了字母表之外的字符`)
  }
  return base64ToBytes(clean)
}

// ---------- AES（WebCrypto） ----------

async function aesKey(keyText, name) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(keyText))
  return crypto.subtle.importKey('raw', digest, { name }, false, ['encrypt', 'decrypt'])
}

// CBC 用确定性 IV（由密钥派生），保证同一密钥加解密互通
async function cbcIv(keyText) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(keyText + '\u0000iv'))
  return new Uint8Array(digest).slice(0, 16)
}

const AES_KEY_DESC = '任意字符串，内部经 SHA-256 派生为 256 位密钥'

async function aesCbcEncode(text, { key }) {
  requireKey(key)
  const k = await aesKey(key, 'AES-CBC')
  const iv = await cbcIv(key)
  const ct = await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, k, new TextEncoder().encode(text))
  return b64(new Uint8Array(ct))
}

async function aesCbcDecode(text, { key }) {
  requireKey(key)
  const bytes = unb64(text, 'AES-CBC')
  if (!bytes.length) return ''
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-CBC', iv: await cbcIv(key) }, await aesKey(key, 'AES-CBC'), new Uint8Array(bytes))
    return new TextDecoder().decode(pt)
  } catch {
    throw new CodecError('AES-CBC 解密失败：密钥不匹配，或密文不完整/被改动')
  }
}

async function aesGcmEncode(text, { key }) {
  requireKey(key)
  const k = await aesKey(key, 'AES-GCM')
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, new TextEncoder().encode(text))
  const both = new Uint8Array(ct.byteLength + 12)
  both.set(iv, 0)
  both.set(new Uint8Array(ct), 12)
  return b64(both)
}

async function aesGcmDecode(text, { key }) {
  requireKey(key)
  const bytes = unb64(text, 'AES-GCM')
  if (!bytes.length) return ''
  if (bytes.length < 13) throw new CodecError('密文太短：AES-GCM 输出至少包含 12 字节 IV + 16 字节校验标签')
  try {
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(bytes.slice(0, 12)) },
      await aesKey(key, 'AES-GCM'),
      new Uint8Array(bytes.slice(12))
    )
    return new TextDecoder().decode(pt)
  } catch {
    throw new CodecError('AES-GCM 解密失败：密钥不匹配，或数据已被篡改（GCM 自带完整性校验）')
  }
}

// ---------- SM4（国密，ECB + PKCS7） ----------

// 标准第 6.2 节 S 盒（GB/T 32907-2016）
const SM4_SBOX_HEX =
  'd690e9fecce13db716b614c228fb2c05' + '2b679a762abe04c3aa44132649860699' +
  '9c4250f491ef987a33540b43edcfac62' + 'e4b31ca9c908e89580df94fa758f3fa6' +
  '4707a7fcf37317ba83593c19e6854fa8' + '686b81b27164da8bf8eb0f4b70569d35' +
  '1e240e5e6358d1a225227c3b01217887' + 'd40046579fd327524c3602e7a0c4c89e' +
  'eabf8ad240c738b5a3f7f2cef96115a1' + 'e0ae5da49b341a55ad933230f58cb1e3' +
  '1df6e22e8266ca60c02923ab0d534e6f' + 'd5db3745defd8e2f03ff6a726d6c5b51' +
  '8d1baf92bbddbc7f11d95c411f105ad8' + '0ac13188a5cd7bbd2d74d012b8e5b4b0' +
  '8969974a0c96777e65b9f109c56ec684' + '18f07dec3adc4d2079ee5f3ed7cb3948'
const SM4_SBOX = SM4_SBOX_HEX.match(/../g).map((h) => parseInt(h, 16))
if (new Set(SM4_SBOX).size !== 256) throw new Error('SM4 S-box 校验失败：构建时数据有误')

const SM4_FK = [0xa3b1bac6, 0x56aa3350, 0x677d9197, 0xb27022dc]
const SM4_CK = Array.from({ length: 32 }, (_, i) =>
  [0, 1, 2, 3].reduce((acc, k) => (acc << 8) | (((4 * i + k) * 7) % 256), 0) >>> 0
)

const sm4Tau = (x) =>
  ((SM4_SBOX[(x >>> 24) & 0xff] << 24) | (SM4_SBOX[(x >>> 16) & 0xff] << 16) | (SM4_SBOX[(x >>> 8) & 0xff] << 8) | SM4_SBOX[x & 0xff]) >>> 0

const sm4T = (x) => {
  const b = sm4Tau(x)
  return (b ^ rotl32(b, 2) ^ rotl32(b, 10) ^ rotl32(b, 18) ^ rotl32(b, 24)) >>> 0
}
const sm4T2 = (x) => {
  const b = sm4Tau(x)
  return (b ^ rotl32(b, 13) ^ rotl32(b, 23)) >>> 0
}

function sm4RoundKeys(key16) {
  const mk = []
  for (let i = 0; i < 4; i++) mk.push(((key16[i * 4] << 24) | (key16[i * 4 + 1] << 16) | (key16[i * 4 + 2] << 8) | key16[i * 4 + 3]) >>> 0)
  let k = mk.map((m, i) => (m ^ SM4_FK[i]) >>> 0)
  const rks = []
  for (let i = 0; i < 32; i++) {
    const nk = (k[0] ^ sm4T2((k[1] ^ k[2] ^ k[3] ^ SM4_CK[i]) >>> 0)) >>> 0
    rks.push(nk)
    k = [k[1], k[2], k[3], nk]
  }
  return rks
}

function sm4CryptBlock(block, rks, decrypt) {
  const keys = decrypt ? [...rks].reverse() : rks
  const x = []
  for (let i = 0; i < 4; i++) x.push(((block[i * 4] << 24) | (block[i * 4 + 1] << 16) | (block[i * 4 + 2] << 8) | block[i * 4 + 3]) >>> 0)
  for (let i = 0; i < 32; i++) {
    const nx = (x[0] ^ sm4T((x[1] ^ x[2] ^ x[3] ^ keys[i]) >>> 0)) >>> 0
    x.shift()
    x.push(nx)
  }
  const o = [x[3], x[2], x[1], x[0]]
  const out = new Array(16)
  o.forEach((w, i) => {
    out[i * 4] = (w >>> 24) & 0xff
    out[i * 4 + 1] = (w >>> 16) & 0xff
    out[i * 4 + 2] = (w >>> 8) & 0xff
    out[i * 4 + 3] = w & 0xff
  })
  return out
}

function sm4KeyBytes(keyText) {
  return sm3Bytes(utf8ToBytes(requireKey(keyText, 'SM4 密钥'))).slice(0, 16)
}

function sm4Ecb(dataBytes, keyText, decrypt) {
  const rks = sm4RoundKeys(sm4KeyBytes(keyText))
  const out = []
  for (let i = 0; i < dataBytes.length; i += 16) {
    out.push(...sm4CryptBlock(dataBytes.slice(i, i + 16), rks, decrypt))
  }
  return out
}

async function sm4Encode(text, { key }) {
  return b64(sm4Ecb(pkcs7Pad(utf8ToBytes(text), 16), key, false))
}

async function sm4Decode(text, { key }) {
  const data = unb64(text, 'SM4')
  if (!data.length) return ''
  if (data.length % 16 !== 0) throw new CodecError('SM4 密文长度必须是 16 的倍数，当前数据可能被截断')
  return bytesToUtf8(pkcs7Unpad(sm4Ecb(data, key, true), 16), { strict: true })
}

// ---------- RC4 / XOR ----------

function rc4Bytes(keyBytes, data) {
  const S = Array.from({ length: 256 }, (_, i) => i)
  let j = 0
  for (let i = 0; i < 256; i++) {
    j = (j + S[i] + keyBytes[i % keyBytes.length]) & 255
    ;[S[i], S[j]] = [S[j], S[i]]
  }
  let i = 0
  j = 0
  return data.map((b) => {
    i = (i + 1) & 255
    j = (j + S[i]) & 255
    ;[S[i], S[j]] = [S[j], S[i]]
    return b ^ S[(S[i] + S[j]) & 255]
  })
}

async function rc4Encode(text, { key }) {
  requireKey(key)
  return b64(rc4Bytes(utf8ToBytes(key), utf8ToBytes(text)))
}

async function rc4Decode(text, { key }) {
  requireKey(key)
  const data = unb64(text, 'RC4')
  if (!data.length) return ''
  return bytesToUtf8(rc4Bytes(utf8ToBytes(key), data), { strict: true })
}

async function xorEncode(text, { key }) {
  requireKey(key)
  const kb = utf8ToBytes(key)
  return b64(utf8ToBytes(text).map((b, i) => b ^ kb[i % kb.length]))
}

async function xorDecode(text, { key }) {
  requireKey(key)
  const data = unb64(text, 'XOR')
  if (!data.length) return ''
  const kb = utf8ToBytes(key)
  return bytesToUtf8(data.map((b, i) => b ^ kb[i % kb.length]), { strict: true })
}

// ---------- 经典密码 ----------

function caesarEncode(t, p) {
  const shift = Number.isFinite(Number(p.shift)) ? Number(p.shift) % 26 : 3
  return rotN(t, shift)
}
function caesarDecode(t, p) {
  const shift = Number.isFinite(Number(p.shift)) ? Number(p.shift) % 26 : 3
  return rotN(t, -shift)
}

function vigenere(text, key, dir) {
  const k = [...key.toLowerCase()].filter((c) => /[a-z]/.test(c))
  if (!k.length) throw new CodecError('维吉尼亚密钥只能由英文字母组成')
  let ki = 0
  return [...text]
    .map((c) => {
      const code = c.charCodeAt(0)
      if (code >= 65 && code <= 90) {
        const s = k[ki++ % k.length].charCodeAt(0) - 97
        return String.fromCharCode(((code - 65 + s * dir + 26) % 26) + 65)
      }
      if (code >= 97 && code <= 122) {
        const s = k[ki++ % k.length].charCodeAt(0) - 97
        return String.fromCharCode(((code - 97 + s * dir + 26) % 26) + 97)
      }
      return c
    })
    .join('')
}

function rot47Codec(dir = 1) {
  return {
    encode: (t) => [...t].map((c) => {
      const code = c.charCodeAt(0)
      return code >= 33 && code <= 126 ? String.fromCharCode((((code - 33 + 47 * dir) % 94) + 94) % 94 + 33) : c
    }).join(''),
    decode: (t) => [...t].map((c) => {
      const code = c.charCodeAt(0)
      return code >= 33 && code <= 126 ? String.fromCharCode((((code - 33 - 47) % 94) + 94) % 94 + 33) : c
    }).join(''),
  }
}

function atbash(t) {
  return [...t].map((c) => {
    const code = c.charCodeAt(0)
    if (code >= 65 && code <= 90) return String.fromCharCode(65 + 90 - code)
    if (code >= 97 && code <= 122) return String.fromCharCode(97 + 122 - code)
    return c
  }).join('')
}

function railFenceZigzag(len, rails) {
  const rows = []
  let r = 0
  let dir = 1
  for (let i = 0; i < len; i++) {
    rows.push(r)
    if (rails > 1) {
      if (r === rails - 1) dir = -1
      else if (r === 0) dir = 1
      r += dir
    }
  }
  return rows
}

function railFenceEncode(text, rails) {
  const rows = Array.from({ length: rails }, () => [])
  railFenceZigzag(text.length, rails).forEach((r, i) => rows[r].push(text[i]))
  return rows.flat().join('')
}

function railFenceDecode(text, rails) {
  const zig = railFenceZigzag(text.length, rails)
  const counts = new Array(rails).fill(0)
  zig.forEach((r) => counts[r]++)
  const cursors = new Array(rails).fill(0)
  const buckets = []
  let pos = 0
  for (let r = 0; r < rails; r++) {
    buckets.push(text.slice(pos, pos + counts[r]))
    pos += counts[r]
  }
  return zig.map((r) => buckets[r][cursors[r]++]).join('')
}

function affine(text, a, b, dir) {
  const inv = modInverse(a) // 内部会校验 a 与 26 互质
  return [...text]
    .map((c) => {
      const code = c.charCodeAt(0)
      if (code >= 65 && code <= 90) {
        const x = dir > 0 ? a * (code - 65) + b : inv * (code - 65 - b)
        return String.fromCharCode(((x % 26) + 26) % 26 + 65)
      }
      if (code >= 97 && code <= 122) {
        const x = dir > 0 ? a * (code - 97) + b : inv * (code - 97 - b)
        return String.fromCharCode(((x % 26) + 26) % 26 + 97)
      }
      return c
    })
    .join('')
}

// 培根密码：24 字母（I/J 与 U/V 合并）。
// 约定：字母 -> 5 位 ab 组合直接连写，其余字符原样保留；
// 编码后 ab 只会来自字母组，解码按线性扫描即可无歧义还原。
const BACON_24 = 'ABCDEFGHIKLMNOPQRSTUWXYZ'
const baconRev = Object.fromEntries(BACON_24.split('').map((c, i) => [
  i.toString(2).padStart(5, '0').replace(/0/g, 'a').replace(/1/g, 'b'), c,
]))

function baconEncode(text) {
  const upper = text.toUpperCase()
  if (!/[A-Z]/.test(upper)) throw new CodecError('培根密码只能编码英文字母')
  return [...upper].map((c) => {
    // 培根 24 字母表不含 J 与 V，按传统规则归并到 I 与 U
    const norm = c === 'J' ? 'I' : c === 'V' ? 'U' : c
    const i = BACON_24.indexOf(norm)
    return i < 0 ? c : i.toString(2).padStart(5, '0').replace(/0/g, 'a').replace(/1/g, 'b')
  }).join('')
}

function baconDecode(text) {
  const s = text.trim()
  if (!s) return ''
  if (!/[abAB]/.test(s)) throw new CodecError('培根密码的密文由 a 和 b 组成（每个字母 5 位），当前输入里一个都没有')
  const chars = [...s]
  let out = ''
  for (let i = 0; i < chars.length;) {
    const c = chars[i].toLowerCase()
    if (c === 'a' || c === 'b') {
      const group = chars.slice(i, i + 5).join('').toLowerCase()
      if (group.length < 5 || /[^ab]/.test(group)) {
        throw new CodecError(`「${group}」不足 5 位 ab 组合，培根数据可能被截断`)
      }
      const ch = baconRev[group]
      if (!ch) throw new CodecError(`「${group}」不是合法的培根组合`)
      out += ch
      i += 5
    } else {
      out += chars[i]
      i++
    }
  }
  return out
}

function a1z26Encode(text) {
  const words = text.split(' ')
  return words
    .map((w) =>
      [...w].map((c) => {
        const code = c.toLowerCase().charCodeAt(0)
        if (code >= 97 && code <= 122) return String(code - 96)
        throw new CodecError(`「${c}」无法编码：A1Z26 只支持英文字母和空格`)
      }).join('-')
    )
    .filter(Boolean)
    .join(' ')
}

function a1z26Decode(text) {
  const s = text.trim()
  if (!s) return ''
  if (!/^[0-9\s-]+$/.test(s)) {
    const bad = [...s].find((c) => !/[0-9\s-]/.test(c))
    throw new CodecError(`「${bad}」不是数字：A1Z26 的密文形如 8-5-12-12-15`)
  }
  return s
    .split(/\s+/)
    .map((w) =>
      w.split('-').map((n) => {
        const v = parseInt(n, 10)
        if (!Number.isFinite(v) || v < 1 || v > 26) throw new CodecError(`「${n}」超出 A-Z 范围（1-26）`)
        return String.fromCharCode(96 + v)
      }).join('')
    )
    .join(' ')
}

// 键盘错位：QWERTY 布局内循环右移 / 左移一位（行尾绕回行首，保证可逆）
const KB_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm']

function keyboardShift(text, dir) {
  return [...text].map((c) => {
    const lower = c.toLowerCase()
    for (const row of KB_ROWS) {
      const i = row.indexOf(lower)
      if (i < 0) continue
      const shifted = row[(i + dir + row.length) % row.length]
      return c === lower ? shifted : shifted.toUpperCase()
    }
    return c
  }).join('')
}

// ---------- 注册表 ----------

export const CIPHERS = [
  // —— 常用 ——
  {
    id: 'aes-cbc', name: 'AES-CBC', group: 'common', key: { label: '密钥', placeholder: '随便一串字符，越长越好', desc: AES_KEY_DESC },
    desc: '最常用的分组加密。密文不透明，同一密钥同一段明文每次加密结果一致。',
    encode: aesCbcEncode, decode: aesCbcDecode,
  },
  {
    id: 'aes-gcm', name: 'AES-GCM（推荐）', group: 'common', key: { label: '密钥', placeholder: '随便一串字符，越长越好', desc: AES_KEY_DESC },
    desc: '自带防篡改校验的现代模式，每次加密产出不同密文，泄露风险最低。',
    encode: aesGcmEncode, decode: aesGcmDecode,
  },
  {
    id: 'sm4', name: 'SM4（国密）', group: 'common', key: { label: '密钥', placeholder: '任意字符串', desc: '任意字符串，内部经 SM3 派生为 128 位密钥' },
    desc: '国家商用密码标准 GB/T 32907，银行与政务系统在用，本站纯 JS 实现。',
    encode: sm4Encode, decode: sm4Decode,
  },
  {
    id: 'rc4', name: 'RC4', group: 'common', key: { label: '密钥', placeholder: '任意字符串', desc: '任意字符串' },
    desc: '曾经统治 Wi-Fi 与 SSL 的流密码，如今已破，图一乐即可。',
    encode: rc4Encode, decode: rc4Decode,
  },
  {
    id: 'xor', name: 'XOR 异或', group: 'common', key: { label: '密钥', placeholder: '任意字符串', desc: '任意字符串，循环使用' },
    desc: '加密和解密是同一个操作——异或两次等于没动，密码学第一课。',
    encode: xorEncode, decode: xorDecode,
  },
  {
    id: 'caesar', name: '凯撒密码', group: 'common', params: [{ id: 'shift', label: '偏移量', type: 'number', min: 0, max: 25, def: 3 }],
    desc: '罗马时代的位移密码，字母表整体平移，暴力破解只需 25 次。',
    encode: caesarEncode, decode: caesarDecode,
  },
  {
    id: 'vigenere', name: '维吉尼亚', group: 'common', key: { label: '密钥（英文字母）', placeholder: '如 secret', desc: '英文字母组成的密钥' },
    desc: '凯撒的升级版：每个字母用密钥对应位做位移，被破前号称「不可破译」三百年。',
    encode: (t, p) => vigenere(t, requireKey(p.key), 1),
    decode: (t, p) => vigenere(t, requireKey(p.key), -1),
  },
  // —— 冷门 ——
  {
    id: 'rot47', name: 'ROT47', group: 'nerdy', desc: 'ROT13 的完整 ASCII 版，数字标点也一起转。',
    ...rot47Codec(1),
  },
  {
    id: 'atbash', name: 'Atbash 镜像', group: 'nerdy', desc: '字母表首尾对折（A↔Z），无需密钥，希伯来圣经时期就有了。',
    encode: atbash, decode: atbash,
  },
  {
    id: 'railfence', name: '栅栏密码', group: 'nerdy', params: [{ id: 'rails', label: '栏数', type: 'number', min: 2, max: 12, def: 3 }],
    desc: '明文按 W 字形分栏再拼接，密钥是栏数。',
    encode: (t, p) => railFenceEncode(t, p.rails), decode: (t, p) => railFenceDecode(t, p.rails),
  },
  {
    id: 'affine', name: '仿射密码', group: 'nerdy', params: [
      { id: 'a', label: '系数 a', type: 'number', min: 1, max: 25, def: 5 },
      { id: 'b', label: '系数 b', type: 'number', min: 0, max: 25, def: 8 },
    ],
    desc: '字母先乘 a 再加 b（模 26），a 必须与 26 互质。',
    encode: (t, p) => affine(t, p.a, p.b, 1), decode: (t, p) => affine(t, p.a, p.b, -1),
  },
  {
    id: 'bacon', name: '培根密码', group: 'nerdy', desc: '每个字母变成 5 位 a/b 组合，伪装成排版样式藏进印刷品。',
    encode: baconEncode, decode: baconDecode,
  },
  {
    id: 'a1z26', name: 'A1Z26', group: 'nerdy', desc: '字母按表编号：HELLO → 8-5-12-12-15，童子军入门款。',
    encode: a1z26Encode, decode: a1z26Decode,
  },
  // —— 整活 ——
  {
    id: 'kbshift', name: '键盘错位', group: 'fun', desc: '把每个字母按到右边一个键，模拟手滑打错字的样子。',
    encode: (t) => keyboardShift(t, 1), decode: (t) => keyboardShift(t, -1),
  },
]
