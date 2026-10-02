import { Bell, BellRing, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import {
  dismissPushPromptSession,
  enablePushNotifications,
  getPushStatus,
  isPushConfigured,
  isPushPromptSessionDismissed,
  isThisDevicePushActive,
  type PushStatus,
} from '../lib/push'
import { useAuthStore } from '../store/authStore'

/**
 * Persistent "Activar avisos" for every logged-in user until THIS device
 * successfully enables push. Then the card disappears (no more nagging).
 */
export function PushOptIn() {
  const user = useAuthStore((s) => s.user)
  const profile = useAuthStore((s) => s.profile)
  const [status, setStatus] = useState<PushStatus | 'loading'>('loading')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessionHidden, setSessionHidden] = useState(false)
  const [ready, setReady] = useState(false)

  const refresh = useCallback(async () => {
    if (!user?.uid) {
      setStatus('default')
      setReady(true)
      return
    }
    const [s, active] = await Promise.all([getPushStatus(user.uid), isThisDevicePushActive()])
    setStatus(active ? 'subscribed' : s)
    setSessionHidden(isPushPromptSessionDismissed())
    setReady(true)
  }, [user?.uid])

  useEffect(() => {
    void refresh()
  }, [refresh])

  if (!user || !profile || !ready) return null

  // After real enable on this device → gone permanently (until they clear site data / disable)
  if (status === 'subscribed') return null

  // Soft-dismiss this visit only
  if (sessionHidden) return null

  const unsupported = status === 'unsupported' || status === 'missing-vapid'

  async function onEnable() {
    setBusy(true)
    setError(null)
    try {
      await enablePushNotifications(user!.uid, profile!.memberKey)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron activar los avisos.')
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  function onDismiss() {
    dismissPushPromptSession()
    setSessionHidden(true)
  }

  return (
    <section
      className="relative rounded-2xl border-2 border-[#0284c7] bg-gradient-to-br from-[#e0f2fe] to-[#7dd3fc]/55 p-4 shadow-[var(--shadow)] ring-2 ring-[#0284c7]/20"
      data-testid="push-opt-in"
    >
      <button
        type="button"
        onClick={onDismiss}
        className="absolute right-2 top-2 rounded-lg p-1.5 text-[#0369a1]/70 hover:bg-white/60"
        aria-label="Cerrar por ahora"
        data-testid="push-dismiss"
      >
        <X className="size-4" />
      </button>

      <h2 className="mb-1 flex items-center gap-2 pr-8 text-lg font-extrabold text-[#0369a1]">
        <BellRing className="size-5" aria-hidden />
        Activar avisos
      </h2>
      <p className="mb-2 text-sm font-semibold text-[#0c4a6e]">
        Actívalos en <span className="font-extrabold">este móvil</span> para recibir avisos ~2 h antes
        de tus citas y compromisos.
      </p>
      <ul className="mb-3 list-disc space-y-1 pl-4 text-xs font-semibold text-[#0c4a6e]/90">
        <li>
          Funciona con la app <span className="font-extrabold">cerrada</span> (PWA en el inicio).
        </li>
        <li>Solo te llegan los avisos asignados a ti (o a Todos).</li>
        <li>Cuando des OK, este mensaje desaparece en este dispositivo.</li>
      </ul>
      <p className="mb-3 text-[11px] leading-snug text-[#0c4a6e]/75">
        iPhone: iOS 16.4+ e icono en pantalla de inicio. Android: Chrome → Instalar / Añadir a inicio.
      </p>

      {unsupported ? (
        <p className="rounded-xl bg-white/80 px-3 py-2 text-sm text-[var(--ink-soft)]">
          {!isPushConfigured()
            ? 'Avisos no configurados aún en el servidor (falta VAPID).'
            : 'Este navegador no admite Web Push.'}
        </p>
      ) : status === 'denied' ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
          Notificaciones bloqueadas. Actívalas en Ajustes del iPhone/Android para este sitio y vuelve
          a abrir Familia Mati.
        </p>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => void onEnable()}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#0284c7] px-3 py-3 text-sm font-extrabold text-white shadow-sm disabled:opacity-60"
          data-testid="push-enable-btn"
        >
          <Bell className="size-4" />
          {busy ? 'Activando…' : 'Activar avisos'}
        </button>
      )}

      {error ? (
        <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  )
}
