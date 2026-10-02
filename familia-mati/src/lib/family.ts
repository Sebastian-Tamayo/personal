export type MemberKey = 'sebas' | 'lore' | 'teo' | 'bebe'
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

/** 4 visual profiles; 3 can log in (Sebas, Lore, Teo). Baby = visual only. */
export const FAMILY_MEMBERS: FamilyMember[] = [
  {
    key: 'sebas',
    name: 'Sebas',
    short: 'S',
    role: 'adulto',
    color: '#0369a1',
    colorSoft: '#bae6fd',
    emoji: '🔵',
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
    key: 'teo',
    name: 'Teo',
    short: 'T',
    role: 'hijo',
    color: '#6d28d9',
    colorSoft: '#ddd6fe',
    emoji: '🟣',
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
 * Legacy: hija → teo, hellen → teo (profile label is Teo; app brand stays Familia Hellen y Mati).
 */
export function normalizeMemberKey(key: string | null | undefined): MemberKey | 'todos' | null {
  if (!key) return null
  const k = String(key).trim().toLowerCase()
  if (k === 'todos') return 'todos'
  if (k === 'hija' || k === 'hellen') return 'teo'
  if (k === 'sebas' || k === 'lore' || k === 'teo' || k === 'bebe') return k
  return null
}

export function memberByKey(key: string | null | undefined): FamilyMember | undefined {
  const n = normalizeMemberKey(key)
  if (!n || n === 'todos') return undefined
  return FAMILY_MEMBERS.find((m) => m.key === n)
}

/**
 * UI label for a persona. Never shows legacy “Hellen” as the person name
 * (app brand “Familia Hellen y Mati” is separate).
 */
export function resolveMemberLabel(
  memberKey: string | null | undefined,
  displayName?: string | null,
): string {
  const m = memberByKey(memberKey)
  if (m) return m.name
  const raw = String(displayName || '').trim()
  if (!raw || /^hellen$/i.test(raw) || /^hija$/i.test(raw)) return 'Teo'
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
  createdAt: number
  updatedAt: number
  createdBy: string
}

/** Presets for “Avisar con antelación” (minutes before event). Default 2 h. */
export const REMINDER_LEAD_PRESETS = [
  { minutes: 30, label: '30 min' },
  { minutes: 60, label: '1 h' },
  { minutes: 120, label: '2 h' },
  { minutes: 180, label: '3 h' },
  { minutes: 1440, label: '1 día' },
] as const

export const DEFAULT_REMINDER_LEAD_MINUTES = 120

export function normalizeReminderLeadMinutes(raw: unknown): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return DEFAULT_REMINDER_LEAD_MINUTES
  const allowed = REMINDER_LEAD_PRESETS.map((p) => p.minutes)
  return allowed.includes(n as (typeof allowed)[number]) ? n : DEFAULT_REMINDER_LEAD_MINUTES
}

export function formatLeadLabel(minutes: number): string {
  const preset = REMINDER_LEAD_PRESETS.find((p) => p.minutes === minutes)
  return preset?.label || `${minutes} min`
}

/** Login personas available on one Auth account (legacy Lore+Teo share email). */
export type PersonaKey = 'sebas' | 'lore' | 'teo'

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
  /** Personas linked to this Auth uid (e.g. lore+teo). */
  personas: PersonaKey[]
  /** Per-persona settings (lead time, etc.). */
  personaSettings: Partial<Record<PersonaKey, PersonaSettings>>
  updatedAt: number
}

export function isPersonaKey(k: string | null | undefined): k is PersonaKey {
  const n = normalizeMemberKey(k)
  return n === 'sebas' || n === 'lore' || n === 'teo'
}

/** Dedicated Teo Auth emails (own account — not Lore’s shared dual-profile). */
export const TEO_OWN_EMAILS = ['teodoro31@gmail.com'] as const
/** @deprecated use TEO_OWN_EMAILS */
export const HELLEN_OWN_EMAILS = TEO_OWN_EMAILS

export function isTeoOwnEmail(email: string | null | undefined): boolean {
  const e = String(email || '')
    .trim()
    .toLowerCase()
  return TEO_OWN_EMAILS.includes(e as (typeof TEO_OWN_EMAILS)[number])
}

/** @deprecated use isTeoOwnEmail */
export const isHellenOwnEmail = isTeoOwnEmail

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

export function formatDateLabel(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const t = todayISO()
  if (iso === t) return 'Hoy'
  const tom = new Date()
  tom.setDate(tom.getDate() + 1)
  if (iso === todayISO(tom)) return 'Mañana'
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
] as const
