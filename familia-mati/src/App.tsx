import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { HomePage } from './pages/HomePage'
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
      const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '') || ''
      let path = redirect
      // Accept absolute (/personal/familia/login) or app-relative (/login)
      if (base && (path === base || path.startsWith(base + '/'))) {
        path = path.slice(base.length) || '/'
      }
      if (!path.startsWith('/')) path = '/' + path
      while (path.startsWith('//')) path = path.slice(1)
      window.history.replaceState(
        null,
        '',
        base + path + (rest ? `?${rest}` : '') + window.location.hash,
      )
    }
  }, [])

  useEffect(() => init(), [init])

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<HomePage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
