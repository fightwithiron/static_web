import { Routes, Route } from 'react-router-dom'
import Header from './components/Header.jsx'
import Footer from './components/Footer.jsx'
import Home from './pages/Home.jsx'
import QQAvatar from './pages/QQAvatar.jsx'
import Codec from './pages/Codec.jsx'

export default function App() {
  return (
    <div className="app">
      <Header />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/qq-avatar" element={<QQAvatar />} />
          <Route path="/codec" element={<Codec />} />
        </Routes>
      </main>
      <Footer />
    </div>
  )
}
