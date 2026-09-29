import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { useAuthStore } from '../store/authStore'

export function LoginPage() {
  const user = useAuthStore((s) => s.user)
  const loading = useAuthStore((s) => s.loading)
  const error = useAuthStore((s) => s.error)
  const configured = useAuthStore((s) => s.configured)
  const login = useAuthStore((s) => s.login)
  const register = useAuthStore((s) => s.register)
  const clearError = useAuthStore((s) => s.clearError)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [submitting, setSubmitting] = useState(false)

  if (configured && !loading && user) {
    return <Navigate to="/" replace />
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    clearError()
    setSubmitting(true)
    try {
      if (mode === 'login') {
        await login(email, password)
      } else {
        await register(email, password)
      }
    } catch {
      // error ya en store
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AppShell title="Finanzas compartidas de Sebas y Lore">
      {!configured ? (
        <section className="animate-rise rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow)] backdrop-blur">
          <h2 className="mb-2 text-lg font-semibold">Firebase no configurado</h2>
          <p className="mb-3 text-sm text-[var(--ink-soft)]">
            Copia <code className="rounded bg-black/5 px-1">.env.example</code> a{' '}
            <code className="rounded bg-black/5 px-1">.env</code>, pega las claves del proyecto
            Firebase y reinicia <code className="rounded bg-black/5 px-1">npm run dev</code>.
          </p>
          <p className="text-sm text-[var(--ink-soft)]">
            Guía completa:{' '}
            <span className="font-medium text-[var(--accent-deep)]">
              docs/setup-finanzas-mati-vite-firebase.md
            </span>
          </p>
        </section>
      ) : (
        <section className="animate-rise rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow)] backdrop-blur">
          <div className="mb-4 flex gap-2 rounded-xl bg-black/5 p-1">
            <button
              type="button"
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
                mode === 'login' ? 'bg-white text-[var(--accent-deep)] shadow-sm' : 'text-[var(--ink-soft)]'
              }`}
              onClick={() => {
                setMode('login')
                clearError()
              }}
            >
              Entrar
            </button>
            <button
              type="button"
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
                mode === 'register'
                  ? 'bg-white text-[var(--accent-deep)] shadow-sm'
                  : 'text-[var(--ink-soft)]'
              }`}
              onClick={() => {
                setMode('register')
                clearError()
              }}
            >
              Crear cuenta
            </button>
          </div>

          <form className="flex flex-col gap-3" onSubmit={onSubmit}>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Correo</span>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-xl border border-[var(--line)] bg-white/80 px-3 py-2.5 outline-none ring-[var(--accent)] focus:ring-2"
                placeholder="tu@correo.com"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Contraseña</span>
              <input
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-xl border border-[var(--line)] bg-white/80 px-3 py-2.5 outline-none ring-[var(--accent)] focus:ring-2"
                placeholder="Mínimo 6 caracteres"
              />
            </label>

            {error ? (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-[var(--warn)]" role="alert">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={submitting || loading}
              className="mt-1 rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--accent-deep)] disabled:opacity-60"
            >
              {submitting ? 'Espera…' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
            </button>
          </form>

          <p className="mt-4 text-center text-xs text-[var(--ink-soft)]">
            Solo cuentas autorizadas del hogar. Auth: email/contraseña (Firebase Spark).
          </p>
        </section>
      )}
    </AppShell>
  )
}
