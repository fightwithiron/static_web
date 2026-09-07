// 俄罗斯方块核心逻辑单测：node scripts/tetris-test.mjs
import { pathToFileURL } from 'node:url'
const CORE = pathToFileURL(new URL('../src/utils/tetris-core.js', import.meta.url).pathname)
const { COLS, ROWS, PIECES, KEYS7, KICKS_JLSTZ, KICKS_I, makePiece, newBag, collides, tryClearRows, rotCW, rotCCW } = await import(CORE)

let pass = 0
const ok = (name, cond) => { console.log(cond ? 'PASS' : 'FAIL', name); if (cond) pass++ }
const emptyGrid = () => Array.from({ length: ROWS }, () => new Array(COLS).fill(0))

// T1 7-bag：恰好 7 种各一次
{
  const bag = newBag()
  ok('T1 7-bag 组成', bag.length === 7 && KEYS7.every((k) => bag.includes(k)))
}

// T2 碰撞：墙 / 地板 / 已占格 / 悬空允许
{
  const g = emptyGrid()
  const t = makePiece('T') // 3 宽，位于 x=3
  ok('T2a 悬空不撞', !collides(g, t.cells, t.x, t.y))
  ok('T2b 左墙', collides(g, t.cells, -1, 5))
  ok('T2c 右墙', collides(g, t.cells, COLS - 1, 5))
  ok('T2d 地板', collides(g, t.cells, 3, ROWS - 1))
  g[10][4] = '#fff'
  ok('T2e 已占格', collides(g, t.cells, 2, 9))
  ok('T2f 负行不查格', !collides(g, t.cells, 3, -2))
}

// T3 消行：单行消除 + 上方下沉
{
  const g = emptyGrid()
  for (let x = 0; x < COLS; x++) g[ROWS - 1][x] = '#f00'
  g[ROWS - 2][0] = '#0f0'
  g[ROWS - 2][1] = '#0f0'
  const r = tryClearRows(g)
  ok('T3a 识别满行', r && r.rows.length === 1 && r.rows[0] === ROWS - 1)
  ok('T3b 顶部补入新空行', r.grid.length === ROWS && r.grid[0].every((c) => !c))
  ok('T3c 上方块下沉一行', r.grid[ROWS - 1][0] === '#0f0' && r.grid[ROWS - 1][1] === '#0f0')
}

// T4 消行：四连消
{
  const g = emptyGrid()
  for (let y = ROWS - 4; y < ROWS; y++) for (let x = 0; x < COLS; x++) g[y][x] = '#f00'
  const r = tryClearRows(g)
  ok('T4 四连消', r && r.rows.length === 4 && r.grid.every((row) => row.every((c) => !c)))
}

// T5 无满行返回 null
{
  const g = emptyGrid()
  g[ROWS - 1][0] = '#f00'
  ok('T5 无满行', tryClearRows(g) === null)
}

// T6 SRS 旋转：4 次顺时针回到原位；逆时针等价 3 次顺时针
{
  for (const key of KEYS7) {
    const def = PIECES[key]
    let cells = def.cells.map((c) => [...c])
    for (let i = 0; i < 4; i++) cells = rotCW(cells, def.n)
    const back = rotCCW(rotCW(def.cells.map((c) => [...c]), def.n), def.n)
    const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())
    if (!same(cells, def.cells) || !same(back, def.cells)) {
      ok(`T6 ${key} 旋转闭合`, false)
      pass--
    }
  }
  ok('T6 旋转闭合（7 种）', true)
}

// T7 SRS 踢墙：T 贴地且旋转目标格被占，(0,0) 与 (-1,0) 都不行，必须靠 (-1,-1) 上移踢墙
{
  const g = emptyGrid()
  for (let x = 0; x < COLS; x++) g[ROWS - 1][x] = '#f00' // 地板垫满
  const t = makePiece('T')
  t.x = 0
  t.y = ROWS - 3
  const cells = rotCW(t.cells, t.n)
  const kicks = KICKS_JLSTZ['01']
  let success = null
  for (const [kx, ky] of kicks) {
    if (!collides(g, cells, t.x + kx, t.y + ky)) { success = [kx, ky]; break }
  }
  ok('T7 T 块靠 (-1,-1) 上移踢墙成功', !!success && success[0] === -1 && success[1] === -1)
}

// T8 I 块地板旋转 0>>1：应有含 (x,-2) 的踢墙可落地成功
{
  const g = emptyGrid()
  for (let x = 0; x < COLS; x++) g[ROWS - 1][x] = '#f00' // 地板垫一层
  const i = makePiece('I')
  i.x = 3
  i.y = ROWS - 3 // 贴地
  i.rot = 0
  const cells = rotCW(i.cells, 4)
  const kicks = KICKS_I['01']
  let success = null
  for (const [kx, ky] of kicks) {
    if (!collides(g, cells, i.x + kx, i.y + ky)) { success = [kx, ky]; break }
  }
  ok('T8 I 块贴地旋转踢墙成功', !!success)
}

// T9 消行不串位：中部消行后上方原样下移
{
  const g = emptyGrid()
  for (let x = 0; x < COLS; x++) g[10][x] = '#f00'
  g[5][3] = '#0f0'
  const r = tryClearRows(g)
  ok('T9 中部消行下移保持', r && r.grid[6][3] === '#0f0' && r.rows[0] === 10)
}

let fails = 0
// 重新统计：ok 已打印，失败即 pass 计数缺口 —— 直接数 FAIL 输出不方便，改用全局
console.log(`通过断言 ${pass} 项`)
// 任一断言失败时上面已打印 FAIL，这里依据 process 退出码约定处理
if (pass < 16) process.exitCode = 1
