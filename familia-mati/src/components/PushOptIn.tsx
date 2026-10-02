import { Bell, BellOff, BellRing } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushStatus,
  isPushConfigured,
  type PushStatus,
} from '../lib/push'
import { useAuthStore } from '../store/authStore'

export function PushOptIn() {
  const user = useAuthStore((s) => s.user)
  const profile = useAuthStore((s) => s.profile)
  const [status, setStatus] = useState<PushStatus>('default')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const s = await getPushStatus(user?.uid)
    setStatus(s)
  }, [user?.uid])

  useEffect(() => {
    void refresh()
  }, [refresh])

  if (!user || !profile) return null

  async function onEnable() {
    setBusy(true)
    setError(null)
    setHint(null)
    try {
      await enablePushNotifications(user!.uid, profile!.memberKey)
      setHint('Avisos activados. Te avisaremos ~2 h antes de tus citas (app cerrada OK).')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron activar los avisos.')
    } finally {
      setBusy(false)
    }
  }

  async function onDisable() {
    setBusy(true)
    setError(null)
    setHint(null)
    try {
      await disablePushNotifications(user!.uid)
      setHint('Avisos desactivados en este dispositivo.')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron desactivar.')
    } finally {
      setBusy(false)
    }
  }

  const unsupported = status === 'unsupported' || status === 'missing-vapid'
  const subscribed = status === 'subscribed'

  return (
    <section
      className="rounded-2xl border-2 border-[#0369a1]/25 bg-gradient-to-br from-[#e0f2fe] to-[#bae6fd]/50 p-4 shadow-[var(--shadow)]"
      data-testid="push-opt-in"
    >
      <h2 className="mb-1 flex items-center gap-2 text-lg font-extrabold text-[#0369a1]">
        <BellRing className="size-5" aria-hidden />
        Avisos de agenda
      </h2>
      <p className="mb-2 text-xs font-semibold text-[#0c4a6e]/90">
        Te avisamos ~2 horas antes de citas y compromisos (entrenar, recoger al bebé…). Funciona con la
        app <span className="font-extrabold">cerrada</span> si instalaste Familia Mati en el inicio.
      </p>
      <p className="mb-3 text-[11px] leading-snug text-[#0c4a6e]/75">
        iPhone/iPad: iOS 16.4+ y atajo en pantalla de inicio (no solo Safari abierto). Android: Chrome
        + «Instalar app» / añadir a inicio.
      </p>

      {unsupported ? (
        <p className="rounded-xl bg-white/80 px-3 py-2 text-sm text-[var(--ink-soft)]">
          {!isPushConfigured()
            ? 'Avisos no configurados aún (falta clave VAPID pública en el despliegue).'
            : 'Este navegador no admite Web Push.'}
        </p>
      ) : status === 'denied' ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
          Notificaciones bloqueadas. Actívalas en ajustes del sistema / navegador para este sitio.
        </p>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          {subscribed ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void onDisable()}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-[#0369a1]/30 bg-white px-3 py-2.5 text-sm font-extrabold text-[#0369a1] disabled:opacity-60"
            >
              <BellOff className="size-4" />
              Desactivar avisos
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => void onEnable()}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#0284c7] px-3 py-2.5 text-sm font-extrabold text-white disabled:opacity-60"
              data-testid="push-enable-btn"
            >
              <Bell className="size-4" />
              Activar avisos
            </button>
          )}
        </div>
      )}

      {subscribed ? (
        <p className="mt-2 text-xs font-bold text-[#0369a1]">Estado: avisos activos en este dispositivo.</p>
      ) : null}
      {error ? (
        <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900" role="alert">
          {error}
        </p>
      ) : null}
      {hint ? <p className="mt-2 text-xs font-semibold text-[#0c4a6e]">{hint}</p> : null}
    </section>
  )
}
