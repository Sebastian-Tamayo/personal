import { RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { FAMILIA_VERSION_URL, readDomFamiliaBuild } from '../lib/familiaBuild'
import {
  ensureFamiliaServiceWorker,
  getFamiliaSwUpdater,
  onFamiliaSwNeedRefresh,
} from '../lib/registerPwa'

function hardReload() {
  const url = new URL(window.location.href)
  url.searchParams.set('_r', String(Date.now()))
  // Drop overlay busy state can't help if reload hangs — navigate away.
  window.location.replace(url.toString())
}

/**
 * Prompts for a hard update when:
 * - a new service worker is waiting (vite-plugin-pwa prompt), or
 * - network `familia-version.json` (NetworkOnly) differs from the running meta build.
 *
 * Actualizar always ends in a hard reload (with timeout) so iOS never stays on
 * «Actualizando…» if updateSW(true) has nothing waiting / never resolves.
 */
export function UpdatePrompt() {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const pendingRemoteRef = useRef<string | null>(null)
  const reloadArmed = useRef(false)

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
    ensureFamiliaServiceWorker()
    const off = onFamiliaSwNeedRefresh(() => show(null))
    void checkRemoteBuild()
    const onVis = () => {
      if (document.visibilityState === 'visible') void checkRemoteBuild()
    }
    document.addEventListener('visibilitychange', onVis)
    const timer = window.setInterval(() => void checkRemoteBuild(), 90_000)
    return () => {
      off()
      document.removeEventListener('visibilitychange', onVis)
      window.clearInterval(timer)
    }
  }, [checkRemoteBuild, show])

  async function onActualizar() {
    if (busy || reloadArmed.current) return
    reloadArmed.current = true
    setBusy(true)

    // Always escape hatch — updateSW(true) often never resolves when the prompt
    // came from version.json mismatch (no waiting worker yet).
    const failsafe = window.setTimeout(() => hardReload(), 2500)

    try {
      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map((k) => caches.delete(k)))
      }
      const updateSW = getFamiliaSwUpdater()
      if (updateSW) {
        await Promise.race([
          updateSW(true),
          new Promise<void>((resolve) => window.setTimeout(resolve, 2000)),
        ])
      }
    } catch {
      /* fall through to hard reload */
    } finally {
      window.clearTimeout(failsafe)
      hardReload()
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
        {busy ? (
          <button
            type="button"
            className="mt-3 text-sm font-bold text-[var(--accent-deep)] underline"
            onClick={() => hardReload()}
            data-testid="actualizar-force"
          >
            Si se queda pillado, toca aquí
          </button>
        ) : null}
      </div>
    </div>
  )
}
