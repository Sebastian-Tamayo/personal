import { RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'
import { FAMILIA_VERSION_URL, readDomFamiliaBuild } from '../lib/familiaBuild'

/**
 * Prompts for a hard update when:
 * - a new service worker is waiting (vite-plugin-pwa prompt), or
 * - network `familia-version.json` (NetworkOnly) differs from the running meta build.
 */
export function UpdatePrompt() {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const updateSWRef = useRef<((reloadPage?: boolean) => Promise<void>) | undefined>(undefined)
  const pendingRemoteRef = useRef<string | null>(null)

  const show = useCallback((remote?: string | null) => {
    if (remote) pendingRemoteRef.current = remote
    setOpen(true)
  }, [])

  const checkRemoteBuild = useCallback(async () => {
    try {
      const res = await fetch(`${FAMILIA_VERSION_URL}?t=${Date.now()}`, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) return
      const data = (await res.json()) as { build?: string }
      const remote = String(data.build || '').trim()
      if (!remote) return
      const local = readDomFamiliaBuild()
      if (remote !== local) show(remote)
    } catch {
      /* offline / first paint — ignore */
    }
  }, [show])

  useEffect(() => {
    updateSWRef.current = registerSW({
      immediate: true,
      onNeedRefresh() {
        show(null)
      },
    })

    void checkRemoteBuild()
    const onVis = () => {
      if (document.visibilityState === 'visible') void checkRemoteBuild()
    }
    document.addEventListener('visibilitychange', onVis)
    const timer = window.setInterval(() => void checkRemoteBuild(), 90_000)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.clearInterval(timer)
    }
  }, [checkRemoteBuild, show])

  async function onActualizar() {
    if (busy) return
    setBusy(true)
    try {
      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map((k) => caches.delete(k)))
      }
      const updateSW = updateSWRef.current
      if (updateSW) {
        await updateSW(true)
      } else {
        const url = new URL(window.location.href)
        url.searchParams.set('_r', String(Date.now()))
        window.location.replace(url.toString())
      }
    } catch {
      window.location.reload()
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#431407]/55 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="familia-actualizar-title"
      data-testid="actualizar-overlay"
    >
      <div className="w-full max-w-sm animate-rise rounded-3xl border-2 border-[#ea580c]/40 bg-white p-6 text-center shadow-xl">
        <p id="familia-actualizar-title" className="text-lg font-extrabold text-[var(--accent-deep)]">
          Hay una versión nueva
        </p>
        <p className="mt-2 text-sm font-semibold text-[var(--ink-soft)]">
          Toca Actualizar para ver los cambios de Familia Hellen y Mati.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onActualizar()}
          className="mt-6 inline-flex w-full min-h-14 items-center justify-center gap-2 rounded-2xl bg-[#ea580c] px-4 py-4 text-xl font-extrabold text-white shadow-md disabled:opacity-70"
          data-testid="actualizar-btn"
        >
          <RefreshCw className={`size-6 ${busy ? 'animate-spin' : ''}`} aria-hidden />
          {busy ? 'Actualizando…' : 'Actualizar'}
        </button>
      </div>
    </div>
  )
}
