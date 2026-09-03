// 编解码工具总注册表：三种模式 × 常用/冷门/整活 三档分组
import { ENCODINGS } from './encodings.js'
import { HASHES } from './hashes.js'
import { CIPHERS } from './ciphers.js'

export { CodecError } from './bytes.js'

// 每个方案配一个示例，供「示例」按钮一键填充
const SAMPLES = {
  'base64': { plain: '你好，世界！Hello, world!' },
  'base64url': { plain: 'Hello, world! 你好' },
  'url': { plain: 'https://example.com/search?q=你好 世界&tag=cute cat' },
  'hex': { plain: 'The quick brown fox 狐狸' },
  'base32': { plain: 'Stay hungry, stay foolish' },
  'base58': { plain: 'Bitcoin: 1A1zP1eP' },
  'base85': { plain: 'ASCII85 packs tighter than Base64.' },
  'unicode': { plain: '你好世界 Unicode' },
  'html': { plain: '<script>alert("你好 & 朋友")</script>' },
  'binary': { plain: 'Hello' },
  'octal': { plain: 'Hello' },
  'morse': { plain: 'SOS HELLO' },
  'base36': { plain: '短链码 short link' },
  'base62': { plain: '短链码 short link' },
  'base91': { plain: 'basE91 packs 91 symbols into the stream.' },
  'base45': { plain: 'EU Digital COVID Certificate' },
  'z85': { plain: 'ZeroMQ Z85!' },
  'qp': { plain: ' quoted-printable 邮件正文 = 尾部空格' },
  'uuencode': { plain: 'uuencode, the Unix classic.' },
  'rot13': { plain: 'Hello, World!' },
  'buddha': { plain: '施主，我看你骨骼清奇' },
  'bear': { plain: '熊出没注意' },
  'emoji': { plain: '干得漂亮，全是表情！' },
  'zerowidth': { plain: '这句背后藏着一行看不见的字' },
  'brainfuck': { plain: 'Hello World!' },
  'ook': { plain: 'Ook? Ook!' },
  'reverse': { plain: '我反了我自己' },

  'md5': { plain: 'abc' },
  'sha1': { plain: 'abc' },
  'sha256': { plain: 'abc' },
  'sha384': { plain: 'abc' },
  'sha512': { plain: 'abc' },
  'crc32': { plain: '123456789' },
  'sm3': { plain: 'abc' },
  'ripemd160': { plain: 'abc' },
  'adler32': { plain: 'Wikipedia' },
  'crc16': { plain: '123456789' },
  'fnv1a': { plain: 'hello' },
  'djb2': { plain: 'hello' },
  'javahash': { plain: 'hello' },

  'aes-cbc': { plain: '这是需要保密的情报', key: 'rune-secret-key' },
  'aes-gcm': { plain: '这是需要保密的情报', key: 'rune-secret-key' },
  'sm4': { plain: '这是需要保密的情报', key: 'rune-secret-key' },
  'rc4': { plain: '这是需要保密的情报', key: 'rune-secret-key' },
  'xor': { plain: '这是需要保密的情报', key: 'rune-secret-key' },
  'caesar': { plain: 'The Caesar shift is easy to break', shift: 3 },
  'vigenere': { plain: 'Attack at dawn', key: 'secret' },
  'rot47': { plain: 'ROT47 covers digits & symbols!' },
  'atbash': { plain: 'Atbash mirrors the alphabet' },
  'railfence': { plain: 'WEAREDISCOVEREDFLEEATONCE', rails: 3 },
  'affine': { plain: 'AffineCipher', a: 5, b: 8 },
  'bacon': { plain: 'Bacon cipher' },
  'a1z26': { plain: 'hello world' },
  'kbshift': { plain: 'great job, typist!' },
}

export const MODES = [
  {
    id: 'encode',
    label: '编码解码',
    hint: '双向互转：明文编码成密文，密文也能原样还原。',
    schemes: ENCODINGS,
  },
  {
    id: 'hash',
    label: '哈希',
    hint: '单向散列：任何输入都能算出指纹，但指纹永远无法还原成输入。',
    schemes: HASHES,
  },
  {
    id: 'cipher',
    label: '加密解密',
    hint: '对称密码：需要密钥才能在明文与密文之间往返。',
    schemes: CIPHERS,
  },
]

export const GROUPS = [
  { id: 'common', label: '常用' },
  { id: 'nerdy', label: '冷门' },
  { id: 'fun', label: '整活' },
]

export function getScheme(modeId, schemeId) {
  const mode = MODES.find((m) => m.id === modeId)
  return mode?.schemes.find((s) => s.id === schemeId)
}

export function getSample(modeId, schemeId) {
  return SAMPLES[schemeId] ?? { plain: 'Hello, world!' }
}

// 默认选中项：每组的第一个方案
export const DEFAULT_SCHEME = { encode: 'base64', hash: 'md5', cipher: 'aes-gcm' }
