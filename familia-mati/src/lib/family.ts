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
    key: 'hellen',
    name: 'Hellen',
    short: 'He',
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

/** Normalize legacy assignee keys (hija → hellen). */
export function normalizeMemberKey(key: string | null | undefined): MemberKey | 'todos' | null {
  if (!key) return null
  if (key === 'todos') return 'todos'
  if (key === 'hija') return 'hellen'
  if (key === 'sebas' || key === 'lore' || key === 'hellen' || key === 'bebe') return key
  return null
}

export function memberByKey(key: string | null | undefined): FamilyMember | undefined {
  const n = normalizeMemberKey(key)
  if (!n || n === 'todos') return undefined
  return FAMILY_MEMBERS.find((m) => m.key === n)
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

export interface UserProfile {
  uid: string
  email: string
  memberKey: MemberKey
  role: UserRole
  displayName: string
  updatedAt: number
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
      return 'Chore'
    case 'bebe':
      return 'Bebé'
    default:
      return 'Tarea'
  }
}
