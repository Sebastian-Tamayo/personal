import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { useAuthStore } from './store/authStore'

export default function App() {
  const init = useAuthStore((s) => s.init)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const redirect = params.get('p')
    if (redirect) {
      params.delete('p')
      const rest = params.toString()
      window.history.replaceState(null, '', redirect + (rest ? `?${rest}` : '') + window.location.hash)
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
