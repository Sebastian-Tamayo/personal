import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { FAMILY_MEMBERS, type MemberKey } from '../lib/family'
import { useAuthStore } from '../store/authStore'

const loginMembers = FAMILY_MEMBERS.filter((m) => m.canLogin)

export function LoginPage() {
  const user = useAuthStore((s) => s.user)
  const loading = useAuthStore((s) => s.loading)
  const error = useAuthStore((s) => s.error)
  const configured = useAuthStore((s) => s.configured)
  const login = useAuthStore((s) => s.login)
  const register = useAuthStore((s) => s.register)
  const clearError = useAuthStore((s) => s.clearError)

  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [memberKey, setMemberKey] = useState<MemberKey>('sebas')
  const [submitting, setSubmitting] = useState(false)

  if (configured && !loading && user) return <Navigate to="/" replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    clearError()
    setSubmitting(true)
    try {
      if (mode === 'login') await login(email, password)
      else await register(email, password, memberKey)
    } catch {
      /* store */
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AppShell title="Organización diaria · Sebas, Lore y Hellen">
      {!configured ? (
        <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow)]">
          <h2 className="mb-2 text-lg font-bold">Firebase no configurado</h2>
          <p className="text-sm text-[var(--ink-soft)]">
            Copia <code>.env.example</code> a <code>.env</code> con las mismas claves VITE_FIREBASE_*
            que Finanzas Mati.
          </p>
        </section>
      ) : (
        <section className="animate-rise rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow)]">
          <div className="mb-4 flex gap-2 rounded-xl bg-black/5 p-1">
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m)
                  clearError()
                }}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-bold ${
                  mode === m ? 'bg-white text-[var(--accent-deep)] shadow-sm' : 'text-[var(--ink-soft)]'
                }`}
              >
                {m === 'login' ? 'Entrar' : 'Crear cuenta'}
              </button>
            ))}
          </div>

          <form className="flex flex-col gap-3" onSubmit={onSubmit}>
            {mode === 'register' ? (
              <div>
                <p className="mb-2 text-sm font-bold">Soy…</p>
                <div className="grid grid-cols-3 gap-2">
                  {loginMembers.map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => setMemberKey(m.key)}
                      className={`rounded-xl border px-2 py-3 text-center text-sm font-bold transition ${
                        memberKey === m.key ? 'border-transparent shadow' : 'border-[var(--line)] bg-white/50'
                      }`}
                      style={
                        memberKey === m.key
                          ? { background: m.colorSoft, color: m.color }
                          : undefined
                      }
                    >
                      <span className="block text-xl">{m.emoji}</span>
                      {m.name}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-[var(--ink-soft)]">
                  3 cuentas distintas (Sebas, Lore, Hellen). Hellen necesita su propio correo — Firebase
                  no permite dos cuentas con el mismo email. El bebé no inicia sesión.
                </p>
              </div>
            ) : null}

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-bold">Correo</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-xl border border-[var(--line)] bg-white/90 px-3 py-2.5 outline-none ring-[var(--accent)] focus:ring-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-bold">Contraseña</span>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-xl border border-[var(--line)] bg-white/90 px-3 py-2.5 outline-none ring-[var(--accent)] focus:ring-2"
              />
            </label>
            {error ? (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800" role="alert">
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-extrabold text-white hover:bg-[var(--accent-deep)] disabled:opacity-60"
            >
              {submitting ? 'Espera…' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
            </button>
          </form>
        </section>
      )}
    </AppShell>
  )
}
