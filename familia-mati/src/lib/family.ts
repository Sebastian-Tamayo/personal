export type MemberKey = 'sebas' | 'lore' | 'hija' | 'bebe'
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

/** 4 visual profiles; 3 can log in */
export const FAMILY_MEMBERS: FamilyMember[] = [
  {
    key: 'sebas',
    name: 'Sebas',
    short: 'S',
    role: 'adulto',
    color: '#0284c7',
    colorSoft: '#e0f2fe',
    emoji: '👨',
    canLogin: true,
  },
  {
    key: 'lore',
    name: 'Lore',
    short: 'L',
    role: 'adulto',
    color: '#db2777',
    colorSoft: '#fce7f3',
    emoji: '👩',
    canLogin: true,
  },
  {
    key: 'hija',
    name: 'Hija',
    short: 'H',
    role: 'hijo',
    color: '#7c3aed',
    colorSoft: '#ede9fe',
    emoji: '👧',
    canLogin: true,
  },
  {
    key: 'bebe',
    name: 'Bebe',
    short: 'B',
    role: 'bebe',
    color: '#ea580c',
    colorSoft: '#ffedd5',
    emoji: '👶',
    canLogin: false,
  },
]

export function memberByKey(key: string | null | undefined): FamilyMember | undefined {
  return FAMILY_MEMBERS.find((m) => m.key === key)
}

export interface OrgItem {
  id: string
  title: string
  notes: string
  kind: ItemKind
  status: ItemStatus
  assignee: MemberKey | 'todos'
  /** yyyy-mm-dd or empty */
  date: string
  /** HH:mm optional */
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
