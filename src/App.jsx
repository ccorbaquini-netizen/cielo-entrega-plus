import { Routes, Route, Navigate } from 'react-router-dom'
import Landing  from './pages/Landing'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import Scanner  from './pages/Scanner'
import Admin    from './pages/Admin'
import { usePWAInstall } from './hooks/usePWAInstall'

export default function App() {
  usePWAInstall()

  return (
    <Routes>
      <Route path="/"         element={<Landing />} />
      <Route path="/cadastro" element={<Register />} />
      <Route path="/painel"   element={<Dashboard />} />
      <Route path="/scanner"  element={<Scanner />} />
      <Route path="/admin"    element={<Admin />} />
      <Route path="*"         element={<Navigate to="/" replace />} />
    </Routes>
  )
}
