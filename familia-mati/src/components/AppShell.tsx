import { Home, LogOut, Wallet } from 'lucide-react'
import type { ReactNode } from 'react'
import { financiasHref } from '../lib/firebase'
import { useAuthStore } from '../store/authStore'

/** Adults only (Sebas/Lore). Hellen (hijo) never sees Finanzas. */
function canSeeFinanzas(profile: { role: string; memberKey: string } | null): boolean {
  if (!profile) return false
  if (profile.memberKey === 'hellen') return false
  if (profile.role === 'hijo') return false
  return profile.role === 'adulto' || profile.memberKey === 'sebas' || profile.memberKey === 'lore'
}

export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  const user = useAuthStore((s) => s.user)
  const profile = useAuthStore((s) => s.profile)
  const logout = useAuthStore((s) => s.logout)
  const showFinanzas = Boolean(user && canSeeFinanzas(profile))

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 pb-10 pt-5 sm:px-6">
      <header className="mb-5 animate-rise">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="brand mb-1 flex items-center gap-2 text-2xl font-semibold text-[var(--accent-deep)] sm:text-3xl">
              <Home className="size-7 shrink-0 text-[var(--accent)]" aria-hidden />
              Familia Mati
            </div>
            {title ? <p className="text-sm text-[var(--ink-soft)]">{title}</p> : null}
            {profile ? (
              <p className="mt-1 truncate text-xs text-[var(--ink-soft)]">
                Hola, <span className="font-bold">{profile.displayName}</span>
                {user?.email ? ` · ${user.email}` : ''}
              </p>
            ) : null}
          </div>
          {user ? (
            <button
              type="button"
              onClick={() => void logout()}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-[var(--line)] bg-white/70 px-3 py-2 text-sm font-semibold"
            >
              <LogOut className="size-4" />
              Salir
            </button>
          ) : null}
        </div>
        {showFinanzas ? (
          <a
            href={financiasHref()}
            // Same-tab absolute URL: more reliable than _blank inside installed PWAs
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-[#0f766e]/40 bg-gradient-to-r from-[#ecfdf5] to-[#ccfbf1] px-4 py-3.5 text-sm font-extrabold text-[#0f766e] shadow-sm transition hover:border-[#0f766e] hover:shadow"
            data-testid="link-finanzas"
          >
            <Wallet className="size-5 shrink-0" aria-hidden />
            <span className="flex flex-col items-start leading-tight sm:flex-row sm:items-center sm:gap-2">
              <span>Ir a Finanzas Mati</span>
              <span className="text-xs font-bold opacity-70">gastos · ahorro</span>
            </span>
          </a>
        ) : null}
      </header>
      <main className="flex flex-1 flex-col gap-4">{children}</main>
    </div>
  )
}
