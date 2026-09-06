// 五子棋引擎 · 全新实现
// 架构思路与 lihongxun945/gobang 的公开教程同族：
//   棋型模式串识别 -> 增量点评分 -> 候选点分级排序 -> Negamax(α-β 剪枝 + 迭代加深 + 置换表)
// 代码为本站原创，未复制任何上游源码。

export const SIZE = 15
export const EMPTY = 0
export const BLACK = 1
export const WHITE = 2
const CELLS = SIZE * SIZE

const DIRS = [
  [0, 1],  // 横
  [1, 0],  // 竖
  [1, 1],  // 撇 \
  [1, -1], // 捺 /
]

// —— 棋型分值表（点分：假设该角色在此空点落子后，新形成的棋型价值） ——
export const SCORE = {
  five: 10_000_000,   // 连五：直接获胜
  liveFour: 1_000_000, // 活四：下一手双点必胜
  rushFour: 100_000,   // 冲四：逼对方应一手
  liveThree: 50_000,   // 活三：下一手成活四
  doubleThree: 40_000, // 双活三
  doubleFour: 90_000,  // 双冲四
  fourThree: 90_000,   // 冲四带活三
  sleepThree: 1_000,   // 眠三
  liveTwo: 4_000,      // 活二
  sleepTwo: 200,       // 眠二
  one: 50,             // 孤子（含居中倾向，见下）
}

// —— 棋型模式串（9 格线串：1=己方 0=空 2=对方/边界，中心为己方落子） ——
const PAT = {
  five: /11111/,
  liveFour: /011110/,
  rushFour: /11110|01111|11011|10111|11101/,
  liveThree: /011100|001110|011010|010110/,
  sleepThree: /11100|00111|11010|01011|10110|01101|10011|11001|10101|21110|01112/,
  liveTwo: /001100|011000|000110|010100|001010/,
  sleepTwo: /211000|000112|210100|001012|210010|010012|10001/,
}

// 点分 = 棋型价值整体降一级：叶子评估的分差必须远小于 WIN(1e7)，
// 否则普通优势会被误判成“已找到必胜”，迭代加深提前终止。
const POINT_VALUE = {
  five: 1_000_000,   // 落子即胜（终局本身由搜索的 winLine 捕获）
  liveFour: 200_000, // 形成活四：下一手基本必胜
  rushFour: 60_000,
  liveThree: 30_000,
  sleepThree: 2_000,
  liveTwo: 1_200,
  sleepTwo: 150,
}

// 单点单方向的棋型识别
function classify(line) {
  if (PAT.five.test(line)) return 'five'
  if (PAT.liveFour.test(line)) return 'liveFour'
  if (PAT.rushFour.test(line)) return 'rushFour'
  if (PAT.liveThree.test(line)) return 'liveThree'
  if (PAT.sleepThree.test(line)) return 'sleepThree'
  if (PAT.liveTwo.test(line)) return 'liveTwo'
  if (PAT.sleepTwo.test(line)) return 'sleepTwo'
  return null
}

// 空点 (x,y) 对 role 的点分：四个方向识别棋型后求和（组合棋型加成）
function pointScore(board, x, y, role) {
  let total = 0
  let rush = 0
  let liveThree = 0
  for (const [dx, dy] of DIRS) {
    let line = '1'
    for (const sign of [1, -1]) {
      let seg = ''
      for (let k = 1; k <= 4; k++) {
        const nx = x + dx * k * sign
        const ny = y + dy * k * sign
        if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) { seg = '2' + seg; break }
        const v = board[ny * SIZE + nx]
        seg = (v === EMPTY ? '0' : v === role ? '1' : '2') + seg
        // 已成五连或遇阻挡即可停止延伸（模式最长 6）
        if (v !== 0 && seg.length >= 5) break
      }
      line = sign > 0 ? line + seg : seg + line
    }
    const shape = classify(line)
    if (!shape) continue
    total += POINT_VALUE[shape]
    if (shape === 'rushFour' || shape === 'liveFour') rush++
    if (shape === 'liveThree') liveThree++
  }
  if (rush >= 2) total += POINT_VALUE.rushFour * 1.5
  else if (rush >= 1 && liveThree >= 1) total += POINT_VALUE.rushFour
  else if (liveThree >= 2) total += POINT_VALUE.liveThree * 1.5
  // 居中倾向：越靠中心分略高
  const cx = Math.abs(x - 7)
  const cy = Math.abs(y - 7)
  total += Math.max(0, 40 - (cx + cy) * 2)
  return total
}

// —— 引擎实例：维护棋盘 + 增量点评分 + 总分 + Zobrist 哈希 ——
export function createEngine(boardArr) {
  const board = new Int8Array(CELLS)
  if (boardArr) board.set(boardArr)
  const score = { 1: new Float64Array(CELLS), 2: new Float64Array(CELLS) }
  const totals = { 1: 0, 2: 0 }
  let hash = 0

  const refreshCell = (idx) => {
    const x = idx % SIZE
    const y = (idx / SIZE) | 0
    for (const role of [BLACK, WHITE]) {
      const old = score[role][idx]
      const next = board[idx] === EMPTY ? pointScore(board, x, y, role) : 0
      score[role][idx] = next
      totals[role] += next - old
    }
  }

  const refreshAround = (x, y) => {
    for (const [dx, dy] of DIRS) {
      for (const sign of [1, -1]) {
        for (let k = 1; k <= 4; k++) {
          const nx = x + dx * k * sign
          const ny = y + dy * k * sign
          if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) break
          refreshCell(ny * SIZE + nx)
        }
      }
    }
    refreshCell(y * SIZE + x)
  }

  // 初始化全部点评分与哈希
  for (let idx = 0; idx < CELLS; idx++) {
    refreshCell(idx)
    if (board[idx] !== EMPTY) hash ^= ZOB_CELL[idx][board[idx]]
  }

  return {
    board,
    score,
    totals,
    get hash() { return hash },
    toggleHash(idx, role) { hash = (hash ^ ZOB_CELL[idx][role] ^ ZOB_ROLE[role]) | 0 },
    refreshAround,
  }
}

// (x,y) 落下 role 后是否连五，返回连五的端点数组（供画胜利连线）
export function findWinLine(board, x, y, role) {
  for (const [dx, dy] of DIRS) {
    const cells = [[x, y]]
    for (const sign of [1, -1]) {
      for (let k = 1; k <= 4; k++) {
        const nx = x + dx * k * sign
        const ny = y + dy * k * sign
        if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) break
        if (board[ny * SIZE + nx] !== role) break
        cells.push([nx, ny])
      }
    }
    if (cells.length >= 5) {
      // 按连线方向排序，取恰好 5 个（多连取包含落点的 5 个）
      cells.sort((a, b) => (a[0] - b[0]) * dx + (a[1] - b[1]) * dy)
      const start = Math.max(0, Math.min(cells.length - 5, cells.findIndex(([cx, cy]) => cx === x && cy === y) - 2))
      return cells.slice(start, start + 5)
    }
  }
  return null
}

// —— 候选点生成与排序 ——
function candidates(engine, role, cap) {
  const { board, score } = engine
  const opp = role === BLACK ? WHITE : BLACK
  const list = []
  let hasStone = false
  for (let idx = 0; idx < CELLS; idx++) {
    if (board[idx] !== EMPTY) { hasStone = true; continue }
    const s = score[role][idx] * 2 + score[opp][idx]
    if (s <= 0) continue
    list.push([idx, s])
  }
  if (!hasStone) return [{ idx: 7 * SIZE + 7, s: 1 }] // 空盘落天元
  // 无候选（极端情况）：任意靠近棋盘中心的空点
  if (!list.length) {
    for (let idx = 0; idx < CELLS; idx++) {
      if (board[idx] === EMPTY) list.push([idx, 1])
    }
  }
  list.sort((a, b) => b[1] - a[1])
  return list.slice(0, cap).map(([idx]) => ({ idx }))
}

// —— Negamax + α-β + 置换表 + 迭代加深 ——
const WIN = SCORE.five
let deadline = 0
let aborted = false
let nodeCount = 0
let reachedDepth = 0

function makePlacement(engine) {
  const { board } = engine
  return {
    place(idx, role) {
      board[idx] = role
      engine.toggleHash(idx, role)
      engine.refreshAround(idx % SIZE, (idx / SIZE) | 0)
      return findWinLine(board, idx % SIZE, (idx / SIZE) | 0, role)
    },
    undo(idx, role) {
      board[idx] = EMPTY
      engine.toggleHash(idx, role)
      engine.refreshAround(idx % SIZE, (idx / SIZE) | 0)
    },
  }
}

// —— 置换表（Zobrist 哈希）：迭代加深时浅层结果在深层复用 ——
const ZOB_CELL = Array.from({ length: CELLS }, () => [0, 0, 0].map(() => (Math.random() * 0xffffffff) | 0))
const ZOB_ROLE = [(Math.random() * 0xffffffff) | 0, 0, (Math.random() * 0xffffffff) | 0] // 下标 1/2 有效

function negamax(engine, placement, role, depth, cap, alpha, beta, ply, tt) {
  nodeCount++
  if ((nodeCount & 127) === 0 && Date.now() > deadline) aborted = true
  if (aborted) return 0
  if (depth <= 0) {
    const me = engine.totals[role]
    const opp = engine.totals[role === BLACK ? WHITE : BLACK]
    return me - opp
  }

  const opp = role === BLACK ? WHITE : BLACK
  const alphaOrig = alpha

  // 置换表探查
  const key = (engine.hash ^ ZOB_ROLE[role]) | 0
  const entry = tt.get(key)
  if (entry && entry.depth >= depth) {
    if (entry.flag === 0) return entry.value
    if (entry.flag === 1 && entry.value > alpha) alpha = entry.value
    else if (entry.flag === 2 && entry.value < beta) beta = entry.value
    if (alpha >= beta) return entry.value
  }

  const moves = candidates(engine, role, cap)
  if (!moves.length) return 0 // 和棋

  let best = -Infinity
  let bestFlag = 2 // upper bound
  for (const { idx } of moves) {
    const winLine = placement.place(idx, role)
    let val
    if (winLine) {
      val = WIN - ply // 越快赢分越高
    } else {
      val = -negamax(engine, placement, opp, depth - 1, cap, -beta, -alpha, ply + 1, tt)
    }
    placement.undo(idx, role)
    if (aborted) return 0
    if (val > best) {
      best = val
      if (val > alphaOrig) bestFlag = val >= beta ? 1 : 0
    }
    if (best > alpha) alpha = best
    if (alpha >= beta) break
  }

  if (!aborted) {
    tt.set(key, { depth, value: best, flag: bestFlag })
  }
  return best
}

// 难度配置
const LEVELS = {
  easy: { maxDepth: 2, cap: 8, timeBudget: 120, noise: true },
  hard: { maxDepth: 8, cap: 16, timeBudget: 1100, noise: false },
}

// 搜索最佳落点。boardArr: 长度 225 的数组（0 空 1 黑 2 白）
export function searchBestMove(boardArr, role, difficulty = 'hard') {
  const level = LEVELS[difficulty] ?? LEVELS.hard
  const engine = createEngine(boardArr)
  const placement = makePlacement(engine)
  const opp = role === BLACK ? WHITE : BLACK

  deadline = Date.now() + level.timeBudget
  aborted = false
  nodeCount = 0
  reachedDepth = 0

  const rootMoves = candidates(engine, role, level.cap)
  if (!rootMoves.length) return { move: 7 * SIZE + 7, score: 0, depth: 0, advantage: 0 }
  if (rootMoves.length === 1) {
    return { move: rootMoves[0].idx, score: 0, depth: 0, advantage: 0 }
  }

  let scored = rootMoves.map(({ idx }) => ({ idx, value: -Infinity }))
  let completedDepth = 0
  let bestValue = 0

  const tt = new Map() // 置换表：跨迭代深度共享
  for (let depth = 2; depth <= level.maxDepth; depth += 2) {
    aborted = false
    let alpha = -Infinity
    const results = []
    let localBest = -Infinity
    for (const { idx } of scored.length ? scored : rootMoves) {
      const winLine = placement.place(idx, role)
      let val
      if (winLine) val = WIN - 1
      else val = -negamax(engine, placement, opp, depth - 1, level.cap, -Infinity, -alpha, 1, tt)
      placement.undo(idx, role)
      if (aborted) break
      results.push({ idx, value: val })
      if (val > localBest) localBest = val
      if (localBest > alpha) alpha = localBest
    }
    if (aborted || !results.length) break
    results.sort((a, b) => b.value - a.value)
    scored = results
    completedDepth = depth
    bestValue = results[0].value
    reachedDepth = depth
    if (bestValue >= WIN - 100) break // 已找到必胜
    if (Date.now() > deadline) break
  }

  if (!scored.length) scored = rootMoves.map(({ idx }) => ({ idx, value: 0 }))

  // 简单模式：从前几名里随机挑一个，给人类留机会
  let chosen = scored[0]
  if (level.noise && scored.length > 1) {
    const pool = scored.slice(0, Math.min(3, scored.length))
    const roll = Math.random()
    const pick = roll < 0.72 ? pool[0] : roll < 0.92 ? pool[1] ?? pool[0] : pool[2] ?? pool[0]
    chosen = pick
  } else {
    chosen = scored[0]
  }

  // 势力值：归一化到 -1 ~ 1（供页面画势力条）
  const advantage = Math.max(-1, Math.min(1, bestValue / 800000))

  return {
    move: chosen.idx,
    score: Math.round(chosen.value),
    depth: completedDepth,
    advantage,
  }
}

// 给玩家的提示：以玩家身份搜索
export function hintMove(boardArr, role) {
  return searchBestMove(boardArr, role, 'hard')
}
