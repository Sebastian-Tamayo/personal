import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

export function ProtectedRoute() {
  const user = useAuthStore((s) => s.user)
  const loading = useAuthStore((s) => s.loading)
  const configured = useAuthStore((s) => s.configured)

  if (!configured) return <Navigate to="/login" replace />
  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-[var(--ink-soft)]">
        Cargando…
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  return <Outlet />
}
