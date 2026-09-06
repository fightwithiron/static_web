// 五子棋 AI 后台线程：主线程把棋盘发过来，算完最佳落点回传，避免卡 UI
import { searchBestMove } from './gomoku-engine'

self.onmessage = (e) => {
  const { board, role, difficulty } = e.data
  const result = searchBestMove(board, role, difficulty)
  self.postMessage(result)
}
