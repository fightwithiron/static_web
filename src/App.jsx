import { Routes, Route } from 'react-router-dom'
import Header from './components/Header.jsx'
import Footer from './components/Footer.jsx'
import Home from './pages/Home.jsx'
import QQAvatar from './pages/QQAvatar.jsx'
import Codec from './pages/Codec.jsx'
import Games from './pages/Games.jsx'
import Minesweeper from './pages/games/Minesweeper.jsx'
import Snake from './pages/games/Snake.jsx'

export default function App() {
  return (
    <div className="app">
      <Header />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/qq-avatar" element={<QQAvatar />} />
          <Route path="/codec" element={<Codec />} />
          <Route path="/games" element={<Games />} />
          <Route path="/games/minesweeper" element={<Minesweeper />} />
          <Route path="/games/snake" element={<Snake />} />
        </Routes>
      </main>
      <Footer />
    </div>
  )
}
