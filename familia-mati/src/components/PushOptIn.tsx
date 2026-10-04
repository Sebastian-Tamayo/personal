import { Bell, BellRing, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import {
  dismissPushPromptSession,
  enablePushNotifications,
  getPushStatus,
  isLikelyIos,
  isPushConfigured,
  isPushPromptSessionDismissed,
  isStandaloneDisplay,
  isThisUserPushActive,
  pushConfigBlockReason,
  type PushStatus,
} from '../lib/push'
import { useAuthStore } from '../store/authStore'

/**
 * Opt-in for Web Push only. Lead time is chosen in Tarea/Cita create/edit forms
 * (per-item reminderLeadMinutes) — not on the home board.
 */
export function PushOptIn() {
  const user = useAuthStore((s) => s.user)
  const profile = useAuthStore((s) => s.profile)
  const [status, setStatus] = useState<PushStatus | 'loading'>('loading')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessionHidden, setSessionHidden] = useState(false)
  const [ready, setReady] = useState(false)

  const uid = user?.uid
  const memberKey = profile?.memberKey

  const refresh = useCallback(async () => {
    if (!uid || !memberKey) {
      setStatus('default')
      setReady(true)
      return
    }
    const [s, active] = await Promise.all([
      getPushStatus(uid, memberKey),
      isThisUserPushActive(uid, memberKey),
    ])
    setStatus(active ? 'subscribed' : s)
    setSessionHidden(isPushPromptSessionDismissed(uid, memberKey))
    setReady(true)
  }, [uid, memberKey])

  useEffect(() => {
    setReady(false)
    void refresh()
  }, [refresh])

  if (!user || !profile || !ready) return null

  // Already enabled — no home lead editor (antelación lives in Tarea/Cita forms).
  if (status === 'subscribed') return null

  if (sessionHidden) return null

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
    dismissPushPromptSession(user!.uid, profile!.memberKey)
    setSessionHidden(true)
  }

  const unsupported = status === 'unsupported' || status === 'missing-vapid'
  const iosNeedsHomeScreen = isLikelyIos() && !isStandaloneDisplay()

  return (
    <section
      className="relative rounded-2xl border-2 border-[#0284c7] bg-gradient-to-br from-[#e0f2fe] to-[#7dd3fc]/55 p-4 shadow-[var(--shadow)] ring-2 ring-[#0284c7]/20"
      data-testid="push-opt-in"
      data-avisos-user={profile.memberKey}
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
        Activa los avisos al móvil. La antelación (30 min / 1 h / …) la eliges al crear cada{' '}
        <span className="font-extrabold">tarea</span> o <span className="font-extrabold">cita</span>.
      </p>
      {iosNeedsHomeScreen ? (
        <p
          className="mb-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-950"
          data-testid="ios-homescreen-hint"
        >
          En iPhone: Safari → Compartir → <span className="font-extrabold">Añadir a inicio</span>.
          Abre la app desde ese icono (no desde Safari) y luego toca Activar avisos. iOS 16.4+.
        </p>
      ) : null}
      <ul className="mb-3 list-disc space-y-1 pl-4 text-xs font-semibold text-[#0c4a6e]/90">
        <li>
          <span className="font-extrabold">Citas</span> y{' '}
          <span className="font-extrabold">tareas con hora</span> — antelación en el formulario de
          cada una. Sin hora en la tarea, no hay push.
        </li>
        <li>Mismo correo de Lore → dos perfiles; cada uno confirma avisos por su lado.</li>
        <li>
          Funciona con la app <span className="font-extrabold">cerrada</span> (PWA en el inicio).
        </li>
        <li>Solo te llegan los avisos asignados a ti (o a Todos).</li>
      </ul>
      <p className="mb-3 text-[11px] leading-snug text-[#0c4a6e]/75">
        iPhone: iOS 16.4+ e icono en pantalla de inicio. Android: Chrome → Instalar / Añadir a inicio.
      </p>

      {unsupported ? (
        <p className="rounded-xl bg-white/80 px-3 py-2 text-sm text-[var(--ink-soft)]">
          {(() => {
            const why = pushConfigBlockReason()
            if (why === 'no-vapid') {
              return 'Avisos no configurados en el servidor (falta clave VAPID pública en el build). Avisa a Sebas.'
            }
            if (why === 'no-firebase') {
              return 'Firebase no está configurado en esta instalación.'
            }
            if (why === 'no-browser-push') {
              return 'Este navegador no admite avisos push aquí. En iPhone: iOS 16.4+, abre desde el icono en la pantalla de inicio (no desde Safari suelto). En Android: usa Chrome e instala / añade a inicio.'
            }
            return isPushConfigured()
              ? 'Este navegador no admite Web Push.'
              : 'Avisos no disponibles en este dispositivo.'
          })()}
        </p>
      ) : status === 'denied' ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
          Notificaciones bloqueadas. Actívalas en Ajustes del iPhone/Android para este sitio y vuelve
          a abrir Familia Hellen y Mati.
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
