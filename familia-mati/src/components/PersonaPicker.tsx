import { Users } from 'lucide-react'
import { memberByKey, type PersonaKey } from '../lib/family'
import { useAuthStore } from '../store/authStore'

/**
 * Full-screen / card picker after login on shared Lore+Hellen Auth account (legacy dual).
 */
export function PersonaPickerModal() {
  const profile = useAuthStore((s) => s.profile)
  const needsPersonaPick = useAuthStore((s) => s.needsPersonaPick)
  const setActivePersona = useAuthStore((s) => s.setActivePersona)

  if (!needsPersonaPick || !profile) return null
  const dual = profile.personas.filter((p) => p === 'lore' || p === 'hellen')
  if (dual.length < 2) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="persona-picker-title"
      data-testid="persona-picker"
    >
      <div className="w-full max-w-sm animate-rise rounded-3xl border border-[var(--line)] bg-white p-5 shadow-xl">
        <h2
          id="persona-picker-title"
          className="mb-1 flex items-center gap-2 text-lg font-extrabold text-[var(--accent-deep)]"
        >
          <Users className="size-5" aria-hidden />
          ¿Quién eres?
        </h2>
        <p className="mb-4 text-sm font-semibold text-[var(--ink-soft)]">
          Misma cuenta (correo de Lore). Elige perfil — avisos y permisos van por separado.
        </p>
        <div className="grid grid-cols-2 gap-3">
          {dual.map((key) => {
            const m = memberByKey(key)!
            return (
              <button
                key={key}
                type="button"
                data-testid={`persona-pick-${key}`}
                onClick={() => void setActivePersona(key as PersonaKey)}
                className="rounded-2xl border-2 px-3 py-5 text-center shadow-sm transition active:scale-[0.98]"
                style={{ background: m.colorSoft, borderColor: m.color, color: m.color }}
              >
                <span className="mb-1 block text-3xl" aria-hidden>
                  {m.emoji}
                </span>
                <span className="text-base font-extrabold">{m.name}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** Compact switcher in the app header when dual personas exist. */
export function PersonaSwitcher() {
  const profile = useAuthStore((s) => s.profile)
  const setActivePersona = useAuthStore((s) => s.setActivePersona)
  const addHellenPersona = useAuthStore((s) => s.addHellenPersona)

  if (!profile) return null
  const dual = profile.personas.includes('lore') && profile.personas.includes('hellen')
  const canAddHellen =
    (profile.personas.includes('lore') || profile.memberKey === 'lore') &&
    !profile.personas.includes('hellen')

  if (!dual && !canAddHellen) return null

  return (
    <div className="mt-2" data-testid="persona-switcher">
      {dual ? (
        <div className="flex gap-2 rounded-xl bg-black/5 p-1">
          {(['lore', 'hellen'] as const).map((key) => {
            const m = memberByKey(key)!
            const active = profile.memberKey === key
            return (
              <button
                key={key}
                type="button"
                data-testid={`persona-switch-${key}`}
                onClick={() => void setActivePersona(key)}
                className={`flex-1 rounded-lg px-2 py-2 text-sm font-extrabold transition ${
                  active ? 'shadow-sm' : 'opacity-70'
                }`}
                style={
                  active
                    ? { background: m.colorSoft, color: m.color }
                    : { color: m.color }
                }
                aria-pressed={active}
              >
                {m.emoji} {m.name}
              </button>
            )
          })}
        </div>
      ) : canAddHellen ? (
        <button
          type="button"
          data-testid="add-hellen-persona"
          onClick={() => void addHellenPersona()}
          className="w-full rounded-xl border border-dashed border-[#6d28d9]/50 bg-[#ede9fe]/60 px-3 py-2 text-xs font-bold text-[#6d28d9]"
        >
          + Añadir perfil Hellen (mismo correo)
        </button>
      ) : null}
    </div>
  )
}
