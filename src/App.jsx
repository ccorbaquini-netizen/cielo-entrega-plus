import { Routes, Route, Navigate } from 'react-router-dom'
import Landing from './pages/Landing'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import Admin from './pages/Admin'
import { usePWAInstall } from './hooks/usePWAInstall'

export default function App() {
  // Monitora instalação do PWA em segundo plano
  usePWAInstall()

  return (
    <Routes>
      {/* Entregador */}
      <Route path="/"          element={<Landing />} />
      <Route path="/cadastro"  element={<Register />} />
      <Route path="/painel"    element={<Dashboard />} />

      {/* Admin — protegido por senha simples no Módulo 4 */}
      <Route path="/admin"     element={<Admin />} />

      {/* Fallback */}
      <Route path="*"          element={<Navigate to="/" replace />} />
    </Routes>
  )
}
