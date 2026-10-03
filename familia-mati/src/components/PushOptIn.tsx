import { Bell, BellRing, Clock3, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import {
  DEFAULT_REMINDER_LEAD_MINUTES,
  REMINDER_LEAD_PRESETS,
  formatLeadLabel,
  normalizeReminderLeadMinutes,
  resolveMemberLabel,
} from '../lib/family'
import {
  dismissPushPromptSession,
  enablePushNotifications,
  getPushStatus,
  isPushConfigured,
  isPushPromptSessionDismissed,
  isThisUserPushActive,
  pushConfigBlockReason,
  type PushStatus,
} from '../lib/push'
import { useAuthStore } from '../store/authStore'

/**
 * Per active persona (Sebas / Lore / Hellen), not per Auth email alone.
 * On shared Lore+Hellen account: Lore enabling does not hide Hellen's prompt.
 */
export function PushOptIn() {
  const user = useAuthStore((s) => s.user)
  const profile = useAuthStore((s) => s.profile)
  const updateReminderLeadMinutes = useAuthStore((s) => s.updateReminderLeadMinutes)
  const [status, setStatus] = useState<PushStatus | 'loading'>('loading')
  const [busy, setBusy] = useState(false)
  const [leadBusy, setLeadBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [leadError, setLeadError] = useState<string | null>(null)
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

  const who = resolveMemberLabel(profile.memberKey, profile.displayName)
  const leadMinutes = normalizeReminderLeadMinutes(
    profile.reminderLeadMinutes ?? DEFAULT_REMINDER_LEAD_MINUTES,
  )

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

  async function onLeadChange(minutes: number) {
    if (minutes === leadMinutes) return
    setLeadBusy(true)
    setLeadError(null)
    try {
      await updateReminderLeadMinutes(minutes)
    } catch (e) {
      setLeadError(e instanceof Error ? e.message : 'No se pudo guardar la antelación.')
    } finally {
      setLeadBusy(false)
    }
  }

  if (status === 'subscribed') {
    return (
      <section
        className="rounded-2xl border border-[#7dd3fc] bg-gradient-to-br from-[#f0f9ff] to-[#e0f2fe]/80 p-4 shadow-[var(--shadow)]"
        data-testid="avisos-lead-settings"
        data-avisos-user={profile.memberKey}
      >
        <h2 className="mb-1 flex items-center gap-2 text-lg font-extrabold text-[#0369a1]">
          <Clock3 className="size-5" aria-hidden />
          Elegimos el tiempo del aviso
        </h2>
        <p className="mb-3 text-sm font-semibold text-[#0c4a6e]/90">
          Avisos activos para <span className="font-extrabold">{who}</span> · solo{' '}
          <span className="font-extrabold">Agenda (citas)</span>. Elige la antelación: 30 min, 1 h,
          2 h, 3 h o 1 día.
        </p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Antelación del aviso">
          {REMINDER_LEAD_PRESETS.map((p) => {
            const selected = p.minutes === leadMinutes
            return (
              <button
                key={p.minutes}
                type="button"
                disabled={leadBusy}
                onClick={() => void onLeadChange(p.minutes)}
                className={
                  selected
                    ? 'rounded-xl bg-[#0284c7] px-3 py-2.5 text-sm font-extrabold text-white shadow-sm disabled:opacity-60'
                    : 'rounded-xl border-2 border-[#7dd3fc] bg-white/90 px-3 py-2.5 text-sm font-bold text-[#0369a1] hover:bg-[#e0f2fe] disabled:opacity-60'
                }
                aria-pressed={selected}
                data-testid={`lead-preset-${p.minutes}`}
              >
                {p.label}
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-xs font-semibold text-[#0c4a6e]/75">
        Ahora: {formatLeadLabel(leadMinutes)} antes de citas/compromisos de la agenda.
      </p>
        {leadError ? (
          <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900" role="alert">
            {leadError}
          </p>
        ) : null}
      </section>
    )
  }

  if (sessionHidden) return null

  const unsupported = status === 'unsupported' || status === 'missing-vapid'

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
        Perfil <span className="font-extrabold">{who}</span>: avisos al móvil para la{' '}
        <span className="font-extrabold">Agenda · citas y compromisos</span> (no para tareas
        diarias de casa). Lore y Hellen aprueban por separado.
      </p>
      <ul className="mb-3 list-disc space-y-1 pl-4 text-xs font-semibold text-[#0c4a6e]/90">
        <li>
          Solo <span className="font-extrabold">citas y compromisos</span> con fecha y hora — las
          tareas diarias (barrer, platos…) no envían aviso.
        </li>
        <li>Mismo correo de Lore → dos perfiles; cada uno confirma avisos por su lado.</li>
        <li>
          Funciona con la app <span className="font-extrabold">cerrada</span> (PWA en el inicio).
        </li>
        <li>Solo te llegan los avisos asignados a ti (o a Todos).</li>
        <li>Al dar OK, el aviso desaparece solo para este perfil.</li>
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
          {busy ? 'Activando…' : `Activar avisos · ${who}`}
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
