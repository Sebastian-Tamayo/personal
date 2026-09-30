import { Download, Share, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

const DISMISS_KEY = 'finanzas-mati-pwa-hint-dismissed'

function detectPlatform(): 'ios' | 'android' | 'other' {
  const ua = navigator.userAgent || ''
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'other'
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  )
}

export function InstallHint() {
  const [open, setOpen] = useState(false)
  const platform = useMemo(() => detectPlatform(), [])

  useEffect(() => {
    if (isStandalone()) return
    if (localStorage.getItem(DISMISS_KEY) === '1') return
    // Slight delay so dashboard paints first
    const t = window.setTimeout(() => setOpen(true), 900)
    return () => window.clearTimeout(t)
  }, [])

  if (!open) return null

  return (
    <aside
      className="animate-rise rounded-2xl border border-[var(--line)] bg-[var(--accent-soft)]/50 px-4 py-3 shadow-[var(--shadow)] backdrop-blur"
      role="note"
    >
      <div className="flex items-start gap-3">
        <Download className="mt-0.5 size-5 shrink-0 text-[var(--accent-deep)]" aria-hidden />
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-semibold text-[var(--accent-deep)]">Acceso directo en el móvil</p>
          {platform === 'ios' ? (
            <p className="mt-1 text-[var(--ink-soft)]">
              En Safari: toca <Share className="inline size-3.5 align-text-bottom" aria-hidden />{' '}
              <strong>Compartir</strong> → <strong>Añadir a pantalla de inicio</strong>.
            </p>
          ) : platform === 'android' ? (
            <p className="mt-1 text-[var(--ink-soft)]">
              En Chrome: menú <strong>⋮</strong> → <strong>Instalar app</strong> o{' '}
              <strong>Añadir a pantalla de inicio</strong>.
            </p>
          ) : (
            <p className="mt-1 text-[var(--ink-soft)]">
              Usa el menú del navegador → <strong>Instalar</strong> /{' '}
              <strong>Añadir a pantalla de inicio</strong>.
            </p>
          )}
        </div>
        <button
          type="button"
          className="rounded-lg p-1 text-[var(--ink-soft)] hover:bg-white/50"
          aria-label="Cerrar consejo"
          onClick={() => {
            localStorage.setItem(DISMISS_KEY, '1')
            setOpen(false)
          }}
        >
          <X className="size-4" />
        </button>
      </div>
    </aside>
  )
}
