import { registerSW } from 'virtual:pwa-register'

export type SwUpdateHandler = (reloadPage?: boolean) => Promise<void>

let updateSW: SwUpdateHandler | undefined
let started = false
const needRefreshListeners = new Set<() => void>()

/** Register the PWA SW once (prompt mode — Actualizar overlay). */
export function ensureFinanzasServiceWorker(): SwUpdateHandler | undefined {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return undefined
  if (!started) {
    started = true
    updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        needRefreshListeners.forEach((fn) => fn())
      },
    })
  }
  return updateSW
}

export function onFinanzasSwNeedRefresh(fn: () => void): () => void {
  needRefreshListeners.add(fn)
  ensureFinanzasServiceWorker()
  return () => {
    needRefreshListeners.delete(fn)
  }
}

export function getFinanzasSwUpdater(): SwUpdateHandler | undefined {
  return updateSW
}
