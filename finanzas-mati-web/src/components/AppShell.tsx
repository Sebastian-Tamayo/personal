import { Home, LogOut, Wallet } from 'lucide-react'
import type { ReactNode } from 'react'
import { useAuthStore } from '../store/authStore'

const FAMILIA_URL =
  (import.meta.env.VITE_FAMILIA_URL as string) ||
  'https://sebastian-tamayo.github.io/personal/familia/'

export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 pb-10 pt-5 sm:px-6">
      <header className="mb-6 animate-rise">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="brand mb-1 flex items-center gap-2 text-2xl font-bold text-[var(--accent-deep)] sm:text-3xl">
              <Wallet className="size-7 shrink-0 text-[var(--accent)]" aria-hidden />
              Finanzas Mati
            </div>
            {title ? <p className="text-sm text-[var(--ink-soft)]">{title}</p> : null}
            {user?.email ? (
              <p className="mt-1 truncate text-xs text-[var(--ink-soft)]">{user.email}</p>
            ) : null}
          </div>
          {user ? (
            <button
              type="button"
              onClick={() => void logout()}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-[var(--line)] bg-white/60 px-3 py-2 text-sm font-medium text-[var(--ink)] backdrop-blur transition hover:bg-white"
              aria-label="Cerrar sesión"
            >
              <LogOut className="size-4" />
              Salir
            </button>
          ) : null}
        </div>
        {user ? (
          <a
            href={FAMILIA_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-[#ea580c]/40 bg-gradient-to-r from-[#fff7ed] to-[#ffedd5] px-4 py-3 text-sm font-extrabold text-[#c2410c] shadow-sm transition hover:border-[#ea580c] hover:shadow"
          >
            <Home className="size-5" aria-hidden />
            Ir a Familia Hellen y Mati
            <span className="text-xs font-bold opacity-70">organización · tareas</span>
          </a>
        ) : null}
      </header>
      <main className="flex flex-1 flex-col gap-4">{children}</main>
    </div>
  )
}
