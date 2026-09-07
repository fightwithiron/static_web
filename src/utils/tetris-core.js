// 俄罗斯方块核心：纯逻辑（随机包 / SRS 旋转踢墙 / 碰撞 / 消行），可独立单测
// 界面层见 src/pages/games/Tetris.jsx

export const COLS = 10, ROWS = 20

// 7 种方块：SRS 出生朝向（包围盒边长 n + 格子坐标）
export const PIECES = {
  I: { n: 4, color: '#38bdf8', cells: [[0, 1], [1, 1], [2, 1], [3, 1]] },
  J: { n: 3, color: '#60a5fa', cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
  L: { n: 3, color: '#fb923c', cells: [[2, 0], [0, 1], [1, 1], [2, 1]] },
  O: { n: 2, color: '#facc15', cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  S: { n: 3, color: '#4ade80', cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
  T: { n: 3, color: '#e879f9', cells: [[1, 0], [0, 1], [1, 1], [2, 1]] },
  Z: { n: 3, color: '#f87171', cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
}
export const KEYS7 = ['I', 'J', 'L', 'O', 'S', 'T', 'Z']

// SRS 踢墙表（屏幕坐标，y 向下，已把标准 y-up 表取反）
export const KICKS_JLSTZ = {
  '01': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '10': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '12': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '21': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '23': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '32': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '30': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '03': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
}
export const KICKS_I = {
  '01': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '10': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '12': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  '21': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '23': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '32': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '30': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '03': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
}

// 旋转：包围盒内顺时针 (x,y) -> (n-1-y, x)
export const rotCW = (cells, n) => cells.map(([x, y]) => [n - 1 - y, x])
export const rotCCW = (cells, n) => cells.map(([x, y]) => [y, n - 1 - x])

export function makePiece(type) {
  const def = PIECES[type]
  return { type, n: def.n, color: def.color, cells: def.cells.map((c) => [...c]), rot: 0, x: 3, y: -2 }
}

export function newBag() {
  const bag = [...KEYS7]
  for (let i = bag.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0
    ;[bag[i], bag[j]] = [bag[j], bag[i]]
  }
  return bag
}

export function collides(grid, cells, px, py) {
  for (const [cx, cy] of cells) {
    const x = px + cx
    const y = py + cy
    if (x < 0 || x >= COLS || y >= ROWS) return true
    if (y >= 0 && grid[y][x]) return true
  }
  return false
}

// 消行：返回新网格与被消的行号；没有满行时返回 null
export function tryClearRows(grid) {
  const rows = []
  for (let y = 0; y < ROWS; y++) {
    if (grid[y].every((c) => c)) rows.push(y)
  }
  if (!rows.length) return null
  const dead = new Set(rows)
  const next = grid.filter((_, y) => !dead.has(y))
  while (next.length < ROWS) next.unshift(new Array(COLS).fill(0))
  return { grid: next, rows }
}
