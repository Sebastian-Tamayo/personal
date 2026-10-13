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
  /** Mes contable YYYY-MM — totales/listado solo usan el mes seleccionado */
  monthId: string
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

/**
 * Meses seleccionables: años completos alrededor del actual
 * (por defecto año anterior → año siguiente), más el mes activo si queda fuera.
 * Orden: más reciente primero. Sin tope en meses futuros.
 */
export function buildMonthOptions(
  now = new Date(),
  opts?: { pastYears?: number; futureYears?: number; ensure?: string },
): string[] {
  const pastYears = opts?.pastYears ?? 1
  const futureYears = opts?.futureYears ?? 1
  const y0 = now.getFullYear() - pastYears
  const y1 = now.getFullYear() + futureYears
  const out: string[] = []
  for (let y = y1; y >= y0; y--) {
    for (let m = 12; m >= 1; m--) {
      out.push(`${y}-${String(m).padStart(2, '0')}`)
    }
  }
  const ensure = opts?.ensure
  if (ensure && /^\d{4}-\d{2}$/.test(ensure) && !out.includes(ensure)) {
    out.push(ensure)
    out.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
  }
  return out
}

/** Mes del gasto: campo explícito, o legacy → mes de createdAt. */
export function resolveExpenseMonthId(
  data: { monthId?: unknown; createdAt?: unknown },
  fallback = currentMonthId(),
): string {
  const raw = typeof data.monthId === 'string' ? data.monthId.trim() : ''
  if (/^\d{4}-\d{2}$/.test(raw)) return raw
  const created = Number(data.createdAt)
  if (Number.isFinite(created) && created > 0) return currentMonthId(new Date(created))
  return fallback
}

export function parseExpense(id: string, data: Record<string, unknown>): Expense {
  return {
    id,
    name: String(data.name ?? ''),
    amount: Number(data.amount) || 0,
    monthId: resolveExpenseMonthId(data),
    createdAt: Number(data.createdAt) || 0,
    updatedAt: Number(data.updatedAt) || 0,
    createdBy: String(data.createdBy || ''),
  }
}

/** Solo gastos del mes abierto — base de TOTAL compartido y aporte. */
export function expensesForMonth(
  expenses: Expense[],
  monthId: string,
): Expense[] {
  return expenses.filter((e) => e.monthId === monthId)
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
