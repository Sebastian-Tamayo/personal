import { registerSW } from 'virtual:pwa-register'

export type SwUpdateHandler = (reloadPage?: boolean) => Promise<void>

let updateSW: SwUpdateHandler | undefined
let started = false
const needRefreshListeners = new Set<() => void>()

/** Register the PWA SW once (required before Activar avisos / iOS push). */
export function ensureFamiliaServiceWorker(): SwUpdateHandler | undefined {
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

export function onFamiliaSwNeedRefresh(fn: () => void): () => void {
  needRefreshListeners.add(fn)
  ensureFamiliaServiceWorker()
  return () => {
    needRefreshListeners.delete(fn)
  }
}

export function getFamiliaSwUpdater(): SwUpdateHandler | undefined {
  return updateSW
}
