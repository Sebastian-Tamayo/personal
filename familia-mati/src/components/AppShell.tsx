import { Home, LogOut, Wallet } from 'lucide-react'
import type { ReactNode } from 'react'
import { FINANZAS_URL } from '../lib/firebase'
import { useAuthStore } from '../store/authStore'

export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  const user = useAuthStore((s) => s.user)
  const profile = useAuthStore((s) => s.profile)
  const logout = useAuthStore((s) => s.logout)
  const isAdult = useAuthStore((s) => s.isAdult)

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 pb-10 pt-5 sm:px-6">
      <header className="mb-5 flex items-start justify-between gap-3 animate-rise">
        <div>
          <div className="brand mb-1 flex items-center gap-2 text-2xl font-semibold text-[var(--accent-deep)] sm:text-3xl">
            <Home className="size-7 text-[var(--accent)]" aria-hidden />
            Familia Mati
          </div>
          {title ? <p className="text-sm text-[var(--ink-soft)]">{title}</p> : null}
          {profile ? (
            <p className="mt-1 text-xs text-[var(--ink-soft)]">
              Hola, <span className="font-bold">{profile.displayName}</span>
              {user?.email ? ` · ${user.email}` : ''}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-2">
          {user ? (
            <button
              type="button"
              onClick={() => void logout()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--line)] bg-white/70 px-3 py-2 text-sm font-semibold"
            >
              <LogOut className="size-4" />
              Salir
            </button>
          ) : null}
          {user && isAdult() ? (
            <a
              href={FINANZAS_URL}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent-deep)] underline-offset-2 hover:underline"
            >
              <Wallet className="size-3.5" />
              Finanzas Mati
            </a>
          ) : null}
        </div>
      </header>
      <main className="flex flex-1 flex-col gap-4">{children}</main>
    </div>
  )
}
