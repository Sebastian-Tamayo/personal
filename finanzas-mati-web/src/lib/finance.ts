export const DEFAULT_SAVINGS_PER_PERSON = 500

export const DEFAULT_SHARED_EXPENSES = [
  { name: 'Internet', amount: 40 },
  { name: 'Luz', amount: 75 },
  { name: 'Comida', amount: 200 },
  { name: 'Gasolina', amount: 100 },
  { name: 'Matías', amount: 100 },
  { name: 'Alquiler', amount: 480 },
] as const

/** @deprecated use DEFAULT_SAVINGS_PER_PERSON */
export const SAVINGS_PER_PERSON = DEFAULT_SAVINGS_PER_PERSON

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
  /** Incluir ahorro individual en el aporte del mes */
  includeSavings: boolean
  /** Monto de ahorro c/u cuando includeSavings es true */
  savingsAmount: number
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

/**
 * Aporte de cada persona.
 * - Sin ahorro: shared / 2
 * - Con ahorro: (shared / 2) + savingsAmount
 */
export function contributionPerPerson(
  expenses: Pick<Expense, 'amount'>[],
  opts?: { includeSavings?: boolean; savingsAmount?: number },
): number {
  const half = sharedTotal(expenses) / 2
  if (opts?.includeSavings === false) return half
  const savings =
    opts?.savingsAmount != null && Number.isFinite(opts.savingsAmount)
      ? Number(opts.savingsAmount)
      : DEFAULT_SAVINGS_PER_PERSON
  return half + savings
}

export function parseMonthRecord(
  id: string,
  data: Record<string, unknown> | undefined,
): MonthRecord {
  const includeSavings =
    typeof data?.includeSavings === 'boolean' ? data.includeSavings : true
  const rawSavings = Number(data?.savingsAmount)
  const savingsAmount =
    Number.isFinite(rawSavings) && rawSavings >= 0 ? rawSavings : DEFAULT_SAVINGS_PER_PERSON
  return {
    id,
    status: (data?.status as MonthStatus) || 'pendiente',
    includeSavings,
    savingsAmount,
    updatedAt: Number(data?.updatedAt) || Date.now(),
    updatedBy: String(data?.updatedBy || ''),
  }
}

export function formatMoney(value: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value)
}
