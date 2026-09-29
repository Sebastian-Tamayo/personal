import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { useAuthStore } from './store/authStore'

export default function App() {
  const init = useAuthStore((s) => s.init)

  useEffect(() => {
    // Restaura ruta de GitHub Pages (404 → index?p=...)
    const params = new URLSearchParams(window.location.search)
    const redirect = params.get('p')
    if (redirect) {
      params.delete('p')
      const rest = params.toString()
      const url = redirect + (rest ? `?${rest}` : '') + window.location.hash
      window.history.replaceState(null, '', url)
    }
  }, [])

  useEffect(() => init(), [init])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<DashboardPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
