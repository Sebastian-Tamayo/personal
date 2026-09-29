export const SAVINGS_PER_PERSON = 500

export const DEFAULT_SHARED_EXPENSES = [
  { name: 'Internet', amount: 40 },
  { name: 'Luz', amount: 75 },
  { name: 'Comida', amount: 200 },
  { name: 'Gasolina', amount: 100 },
  { name: 'Matías', amount: 100 },
  { name: 'Alquiler', amount: 480 },
] as const

export type MonthStatus = 'pagado' | 'pendiente'

export interface Expense {
  id: string
  name: string
  amount: number
  createdAt: number
  updatedAt: number
  createdBy: string
}

export interface MonthRecord {
  id: string // yyyy-mm
  status: MonthStatus
  updatedAt: number
  updatedBy: string
}

export function currentMonthId(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

export function formatMonthLabel(monthId: string): string {
  const [y, m] = monthId.split('-').map(Number)
  const date = new Date(y, m - 1, 1)
  return date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
}

export function sharedTotal(expenses: Pick<Expense, 'amount'>[]): number {
  return expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
}

/** (suma compartida / 2) + 500 = aporte de cada persona */
export function contributionPerPerson(expenses: Pick<Expense, 'amount'>[]): number {
  return sharedTotal(expenses) / 2 + SAVINGS_PER_PERSON
}

export function formatMoney(value: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value)
}
