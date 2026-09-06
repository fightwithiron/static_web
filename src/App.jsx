import { Routes, Route } from 'react-router-dom'
import Header from './components/Header.jsx'
import Footer from './components/Footer.jsx'
import Home from './pages/Home.jsx'
import QQAvatar from './pages/QQAvatar.jsx'
import Codec from './pages/Codec.jsx'
import Games from './pages/Games.jsx'
import PixelAvatar from './pages/PixelAvatar.jsx'
import Qrcode from './pages/Qrcode.jsx'
import News from './pages/News.jsx'
import Minesweeper from './pages/games/Minesweeper.jsx'
import Snake from './pages/games/Snake.jsx'
import WoodenFish from './pages/games/WoodenFish.jsx'
import WishingWell from './pages/games/WishingWell.jsx'
import Roulette from './pages/games/Roulette.jsx'
import BubbleWrap from './pages/games/BubbleWrap.jsx'
import Typing from './pages/games/Typing.jsx'
import Gomoku from './pages/games/Gomoku.jsx'
import FishFeast from './pages/games/FishFeast.jsx'
import BirdFly from './pages/games/BirdFly.jsx'
import Duel from './pages/games/Duel.jsx'

export default function App() {
  return (
    <div className="app">
      <Header />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/qq-avatar" element={<QQAvatar />} />
          <Route path="/codec" element={<Codec />} />
          <Route path="/pixel-avatar" element={<PixelAvatar />} />
          <Route path="/qrcode" element={<Qrcode />} />
          <Route path="/news" element={<News />} />
          <Route path="/games" element={<Games />} />
          <Route path="/games/minesweeper" element={<Minesweeper />} />
          <Route path="/games/snake" element={<Snake />} />
          <Route path="/games/woodenfish" element={<WoodenFish />} />
          <Route path="/games/wishingwell" element={<WishingWell />} />
          <Route path="/games/roulette" element={<Roulette />} />
          <Route path="/games/bubblewrap" element={<BubbleWrap />} />
          <Route path="/games/typing" element={<Typing />} />
          <Route path="/games/gomoku" element={<Gomoku />} />
          <Route path="/games/fishfeast" element={<FishFeast />} />
          <Route path="/games/bird" element={<BirdFly />} />
          <Route path="/games/duel" element={<Duel />} />
        </Routes>
      </main>
      <Footer />
    </div>
  )
}
