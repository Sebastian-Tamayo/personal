import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { type MemberKey } from '../lib/family'
import { useAuthStore } from '../store/authStore'

type RegisterChoice = 'sebas' | 'lore' | 'hellen' | 'lore_hellen'

export function LoginPage() {
  const user = useAuthStore((s) => s.user)
  const loading = useAuthStore((s) => s.loading)
  const error = useAuthStore((s) => s.error)
  const configured = useAuthStore((s) => s.configured)
  const needsPersonaPick = useAuthStore((s) => s.needsPersonaPick)
  const login = useAuthStore((s) => s.login)
  const register = useAuthStore((s) => s.register)
  const clearError = useAuthStore((s) => s.clearError)

  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [choice, setChoice] = useState<RegisterChoice>('sebas')
  const [submitting, setSubmitting] = useState(false)

  if (configured && !loading && user && !needsPersonaPick) return <Navigate to="/" replace />
  if (configured && !loading && user && needsPersonaPick) return <Navigate to="/" replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    clearError()
    setSubmitting(true)
    try {
      if (mode === 'login') await login(email, password)
      else {
        const memberKey: MemberKey =
          choice === 'sebas' ? 'sebas' : choice === 'hellen' ? 'hellen' : 'lore'
        await register(email, password, memberKey, {
          linkHellen: choice === 'lore_hellen',
        })
      }
    } catch {
      /* store */
    } finally {
      setSubmitting(false)
    }
  }

  const chips: {
    id: RegisterChoice
    label: string
    emoji: string
    hint: string
    color: string
    soft: string
  }[] = [
    {
      id: 'sebas',
      label: 'Sebas',
      emoji: '🔵',
      hint: 'Su propio correo',
      color: '#0369a1',
      soft: '#bae6fd',
    },
    {
      id: 'lore',
      label: 'Lore',
      emoji: '🩷',
      hint: 'Correo de Lore',
      color: '#be185d',
      soft: '#fbcfe8',
    },
    {
      id: 'hellen',
      label: 'Hellen',
      emoji: '🟣',
      hint: 'Correo de Hellen (Oppo) · Teodoro31@gmail.com',
      color: '#6d28d9',
      soft: '#ddd6fe',
    },
    {
      id: 'lore_hellen',
      label: 'Lore+He',
      emoji: '🩷🟣',
      hint: 'Legacy: 2 perfiles en correo de Lore',
      color: '#9d174d',
      soft: '#fce7f3',
    },
  ]

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
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {chips.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setChoice(c.id)}
                      className={`rounded-xl border px-1.5 py-3 text-center text-xs font-bold transition ${
                        choice === c.id ? 'border-transparent shadow' : 'border-[var(--line)] bg-white/50'
                      }`}
                      style={
                        choice === c.id ? { background: c.soft, color: c.color } : undefined
                      }
                    >
                      <span className="mb-0.5 block text-lg">{c.emoji}</span>
                      {c.label}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs leading-snug text-[var(--ink-soft)]">
                  {chips.find((c) => c.id === choice)?.hint}. Hellen entra con{' '}
                  <span className="font-bold">su propio correo</span> (cuenta hijo · sin Finanzas).
                  Lore tiene su perfil adulto; la app se llama Familia Hellen y Mati.
                </p>
              </div>
            ) : (
              <p className="rounded-xl bg-[#f5f3ff] px-3 py-2 text-xs font-semibold text-[#5b21b6]">
                Hellen (Oppo): Teodoro31@gmail.com. Lore: su correo. Sebas: el suyo. Avisos = push al
                móvil, no email.
              </p>
            )}

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-bold">Correo</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-xl border border-[var(--line)] bg-white/80 px-3 py-2.5 outline-none ring-[var(--accent)] focus:ring-2"
                placeholder="tu@correo.com"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-bold">Contraseña</span>
              <input
                type="password"
                required
                minLength={6}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
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
              className="mt-1 rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-extrabold text-white disabled:opacity-60"
            >
              {submitting ? 'Espera…' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
            </button>
          </form>
        </section>
      )}
    </AppShell>
  )
}
