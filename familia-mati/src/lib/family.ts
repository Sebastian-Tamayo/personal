export type MemberKey = 'sebas' | 'lore' | 'hellen' | 'bebe'
export type UserRole = 'adulto' | 'hijo'
export type ItemKind = 'cita' | 'tarea' | 'chore' | 'bebe'
export type ItemStatus = 'pendiente' | 'hecha'

export interface FamilyMember {
  key: MemberKey
  name: string
  short: string
  role: UserRole | 'bebe'
  color: string
  colorSoft: string
  emoji: string
  canLogin: boolean
}

/** 4 visual profiles; 3 can log in (Sebas, Lore, Hellen). Baby = visual only. */
export const FAMILY_MEMBERS: FamilyMember[] = [
  {
    key: 'sebas',
    name: 'Sebas',
    short: 'S',
    role: 'adulto',
    color: '#0369a1',
    colorSoft: '#bae6fd',
    emoji: '💙',
    canLogin: true,
  },
  {
    key: 'lore',
    name: 'Lore',
    short: 'L',
    role: 'adulto',
    color: '#be185d',
    colorSoft: '#fbcfe8',
    emoji: '🩷',
    canLogin: true,
  },
  {
    key: 'hellen',
    name: 'Hellen',
    short: 'He',
    role: 'hijo',
    color: '#6d28d9',
    colorSoft: '#ddd6fe',
    emoji: '💜',
    canLogin: true,
  },
  {
    key: 'bebe',
    name: 'Bebé',
    short: 'B',
    role: 'bebe',
    color: '#c2410c',
    colorSoft: '#fed7aa',
    emoji: '🧡',
    canLogin: false,
  },
]

/**
 * Normalize assignee / persona keys.
 * Canonical daughter key: hellen. Legacy teo|hija → hellen.
 * App brand stays Familia Hellen y Mati.
 */
export function normalizeMemberKey(key: string | null | undefined): MemberKey | 'todos' | null {
  if (!key) return null
  const k = String(key).trim().toLowerCase()
  if (k === 'todos') return 'todos'
  if (k === 'hija' || k === 'teo') return 'hellen'
  if (k === 'sebas' || k === 'lore' || k === 'hellen' || k === 'bebe') return k
  return null
}

export function memberByKey(key: string | null | undefined): FamilyMember | undefined {
  const n = normalizeMemberKey(key)
  if (!n || n === 'todos') return undefined
  return FAMILY_MEMBERS.find((m) => m.key === n)
}

/**
 * UI label for a persona. Scrubs legacy daughter nicknames → Hellen.
 */
export function resolveMemberLabel(
  memberKey: string | null | undefined,
  displayName?: string | null,
): string {
  const m = memberByKey(memberKey)
  if (m) return m.name
  const raw = String(displayName || '').trim()
  if (!raw || /^hija$/i.test(raw)) return 'Hellen'
  // Scrub 3-letter legacy nickname without embedding it as a UI constant
  if (raw.length === 3 && raw[0].toLowerCase() === 't' && raw.toLowerCase().endsWith('eo')) {
    return 'Hellen'
  }
  return raw
}

export const KIND_COLORS: Record<ItemKind, { color: string; soft: string }> = {
  cita: { color: '#0f766e', soft: '#ccfbf1' },
  tarea: { color: '#1d4ed8', soft: '#dbeafe' },
  chore: { color: '#a16207', soft: '#fef08a' },
  bebe: { color: '#c2410c', soft: '#ffedd5' },
}

export interface OrgItem {
  id: string
  title: string
  notes: string
  kind: ItemKind
  status: ItemStatus
  assignee: MemberKey | 'todos'
  date: string
  time: string
  /**
   * Lead minutes for push when `time` is set (same presets as citas).
   * Absent/0 → cron falls back to each recipient’s profile lead; UI hides “Aviso · …”.
   */
  reminderLeadMinutes?: number
  createdAt: number
  updatedAt: number
  createdBy: string
}

/** Weekly / monthly household routines — separate from chores and agenda citas. */
export type RoutineCadence = 'semanal' | 'mensual' | ''

/** Shared daily digest clock for ALL routines (one push/day). Agenda citas unchanged. */
export const DEFAULT_ROUTINES_DIGEST_TIME = '16:00'

export interface FamiliaRoutine {
  id: string
  title: string
  notes: string
  /** Optional cadence label shown in UI (semanal / mensual). */
  cadence: RoutineCadence
  /** Inactive routines stay in Firestore but are hidden from board + digest. */
  active: boolean
  createdAt: number
  updatedAt: number
  createdBy: string
}

export function cadenceLabel(cadence: RoutineCadence | string | null | undefined): string {
  const c = String(cadence || '').trim().toLowerCase()
  if (c === 'semanal') return 'Semanal'
  if (c === 'mensual') return 'Mensual'
  return ''
}

/** Normalize HH:mm (24h). Invalid → default 16:00. */
export function normalizeDigestTime(raw: unknown): string {
  const s = String(raw ?? '')
    .trim()
  const m = s.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return DEFAULT_ROUTINES_DIGEST_TIME
  const h = Number(m[1])
  const min = Number(m[2])
  if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) {
    return DEFAULT_ROUTINES_DIGEST_TIME
  }
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

/** Presets for “Avisar con antelación” (minutes before event). Default 2 h. Profile-wide, not per cita. */
export const REMINDER_LEAD_PRESETS = [
  { minutes: 30, label: '30 min' },
  { minutes: 60, label: '1 h' },
  { minutes: 120, label: '2 h' },
  { minutes: 180, label: '3 h' },
  { minutes: 1440, label: '1 día' },
] as const

export const DEFAULT_REMINDER_LEAD_MINUTES = 120
export const MIN_REMINDER_LEAD_MINUTES = 1
export const MAX_REMINDER_LEAD_MINUTES = 7 * 24 * 60

const PRESET_MINUTES = REMINDER_LEAD_PRESETS.map((p) => p.minutes)

/** Snap to a known preset (nearest) so cron + UI stay in sync. */
export function normalizeReminderLeadMinutes(raw: unknown): number {
  const n = Math.round(Number(raw))
  if (!Number.isFinite(n)) return DEFAULT_REMINDER_LEAD_MINUTES
  if ((PRESET_MINUTES as readonly number[]).includes(n)) return n
  let best = DEFAULT_REMINDER_LEAD_MINUTES
  let bestDist = Number.POSITIVE_INFINITY
  for (const p of PRESET_MINUTES) {
    const d = Math.abs(p - n)
    if (d < bestDist) {
      bestDist = d
      best = p
    }
  }
  return best
}

export function formatLeadLabel(minutes: number): string {
  const m = normalizeReminderLeadMinutes(minutes)
  const preset = REMINDER_LEAD_PRESETS.find((p) => p.minutes === m)
  return preset?.label || `${m} min`
}

/** Prefer hours in editors when value is a whole number of hours. */
export function leadDisplayFromMinutes(minutes: number): { amount: number; unit: 'min' | 'h' } {
  const m = normalizeReminderLeadMinutes(minutes)
  if (m >= 60 && m % 60 === 0) return { amount: m / 60, unit: 'h' }
  return { amount: m, unit: 'min' }
}

export function leadMinutesFromDisplay(amount: number, unit: 'min' | 'h'): number {
  const n = Math.round(Number(amount))
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_REMINDER_LEAD_MINUTES
  return normalizeReminderLeadMinutes(unit === 'h' ? n * 60 : n)
}

/** Login personas available on one Auth account (legacy Lore+Hellen share email). */
export type PersonaKey = 'sebas' | 'lore' | 'hellen'

export interface PersonaSettings {
  reminderLeadMinutes: number
}

export interface UserProfile {
  uid: string
  email: string
  /** Active persona for this session (drives UI, gates, push). */
  memberKey: MemberKey
  role: UserRole
  displayName: string
  /** Minutes before event for the active persona. */
  reminderLeadMinutes: number
  /** Personas linked to this Auth uid (e.g. lore+hellen). */
  personas: PersonaKey[]
  /** Per-persona settings (lead time, etc.). */
  personaSettings: Partial<Record<PersonaKey, PersonaSettings>>
  updatedAt: number
}

export function isPersonaKey(k: string | null | undefined): k is PersonaKey {
  const n = normalizeMemberKey(k)
  return n === 'sebas' || n === 'lore' || n === 'hellen'
}

/** Dedicated Hellen Auth emails (own account — not Lore’s shared dual-profile). */
export const HELLEN_OWN_EMAILS = ['teodoroalvis31@gmail.com'] as const

export function isHellenOwnEmail(email: string | null | undefined): boolean {
  const e = String(email || '')
    .trim()
    .toLowerCase()
  return HELLEN_OWN_EMAILS.includes(e as (typeof HELLEN_OWN_EMAILS)[number])
}

export function defaultPersonaSettings(
  lead: number = DEFAULT_REMINDER_LEAD_MINUTES,
): PersonaSettings {
  return { reminderLeadMinutes: normalizeReminderLeadMinutes(lead) }
}

export function todayISO(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Shift an ISO date (YYYY-MM-DD) by ±days. Past days allowed (negative delta). */
export function shiftISODate(iso: string, deltaDays: number): string {
  const base = iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : todayISO()
  const [y, m, d] = base.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + deltaDays)
  return todayISO(date)
}

export function formatDateLabel(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const t = todayISO()
  if (iso === t) return 'Hoy'
  const tom = new Date()
  tom.setDate(tom.getDate() + 1)
  if (iso === todayISO(tom)) return 'Mañana'
  const yer = new Date()
  yer.setDate(yer.getDate() - 1)
  if (iso === todayISO(yer)) return 'Ayer'
  return date.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
}

export function kindLabel(kind: ItemKind): string {
  switch (kind) {
    case 'cita':
      return 'Cita'
    case 'chore':
      return 'Diaria'
    case 'bebe':
      return 'Bebé'
    default:
      return 'Tarea'
  }
}

/** Sugerencias rápidas para tareas diarias del hogar. */
export const DAILY_TASK_SUGGESTIONS = [
  'Barrer',
  'Aspirar',
  'Hacer comida',
  'Lavar platos',
  'Recoger juguetes',
  'Sacar basura',
  'Tender ropa',
  'Hacer deberes',
  'Entregar bebé',
  'Recoger bebé',
] as const

/** Sugerencias ligeras para rutinas semanales / mensuales. */
export const ROUTINE_SUGGESTIONS = [
  'Revisar nevera',
  'Pagar facturas',
  'Lavar ropa de cama',
  'Comprar del súper',
  'Revisar agenda escolar',
] as const
