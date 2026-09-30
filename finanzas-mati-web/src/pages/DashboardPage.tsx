import { CheckCircle2, CircleDollarSign, Pencil, PiggyBank, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { AppShell } from '../components/AppShell'
import { InstallHint } from '../components/InstallHint'
import { TasksSection } from '../components/TasksSection'
import {
  DEFAULT_SAVINGS_PER_PERSON,
  contributionPerPerson,
  currentMonthId,
  formatMoney,
  formatMonthLabel,
  sharedTotal,
  type Expense,
  type MonthStatus,
} from '../lib/finance'
import { useAuthStore } from '../store/authStore'
import { useFinanceStore } from '../store/financeStore'

function monthOptions(count = 6): string[] {
  const out: string[] = []
  const now = new Date()
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    out.push(currentMonthId(d))
  }
  return out
}

export function DashboardPage() {
  const user = useAuthStore((s) => s.user)!
  const expenses = useFinanceStore((s) => s.expenses)
  const month = useFinanceStore((s) => s.month)
  const monthId = useFinanceStore((s) => s.monthId)
  const loading = useFinanceStore((s) => s.loading)
  const seeding = useFinanceStore((s) => s.seeding)
  const syncError = useFinanceStore((s) => s.syncError)
  const subscribe = useFinanceStore((s) => s.subscribe)
  const setMonthId = useFinanceStore((s) => s.setMonthId)
  const addExpense = useFinanceStore((s) => s.addExpense)
  const updateExpense = useFinanceStore((s) => s.updateExpense)
  const deleteExpense = useFinanceStore((s) => s.deleteExpense)
  const setMonthStatus = useFinanceStore((s) => s.setMonthStatus)
  const setSavingsSettings = useFinanceStore((s) => s.setSavingsSettings)

  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [editing, setEditing] = useState<Expense | null>(null)
  const [busy, setBusy] = useState(false)
  const [savingsDraft, setSavingsDraft] = useState(String(DEFAULT_SAVINGS_PER_PERSON))

  useEffect(() => {
    return subscribe(user.uid)
  }, [subscribe, user.uid])

  const includeSavings = month?.includeSavings ?? true
  const savingsAmount = month?.savingsAmount ?? DEFAULT_SAVINGS_PER_PERSON

  useEffect(() => {
    setSavingsDraft(String(savingsAmount))
  }, [savingsAmount, monthId])

  const shared = useMemo(() => sharedTotal(expenses), [expenses])
  const contribution = useMemo(
    () => contributionPerPerson(expenses, { includeSavings, savingsAmount }),
    [expenses, includeSavings, savingsAmount],
  )
  const status: MonthStatus = month?.status ?? 'pendiente'
  const months = useMemo(() => monthOptions(8), [])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const parsed = Number(amount.replace(',', '.'))
    if (!name.trim() || !Number.isFinite(parsed) || parsed < 0) return
    setBusy(true)
    try {
      if (editing) {
        await updateExpense(editing.id, name, parsed)
        setEditing(null)
      } else {
        await addExpense(name, parsed, user.uid)
      }
      setName('')
      setAmount('')
    } finally {
      setBusy(false)
    }
  }

  function startEdit(expense: Expense) {
    setEditing(expense)
    setName(expense.name)
    setAmount(String(expense.amount))
  }

  function cancelEdit() {
    setEditing(null)
    setName('')
    setAmount('')
  }

  async function onToggleSavings() {
    const next = !includeSavings
    await setSavingsSettings(
      {
        includeSavings: next,
        savingsAmount: next ? savingsAmount || DEFAULT_SAVINGS_PER_PERSON : savingsAmount,
      },
      user.uid,
    )
  }

  async function onSavingsAmountCommit() {
    const parsed = Number(savingsDraft.replace(',', '.'))
    if (!Number.isFinite(parsed) || parsed < 0) {
      setSavingsDraft(String(savingsAmount))
      return
    }
    if (parsed === savingsAmount) return
    await setSavingsSettings({ includeSavings, savingsAmount: parsed }, user.uid)
  }

  const aporteHint = includeSavings
    ? `(compartido ÷ 2) + ${savingsAmount}`
    : 'compartido ÷ 2 (sin ahorro)'

  return (
    <AppShell title="Panel compartido · Sebas & Lore">
      {syncError ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-[var(--warn)]" role="alert">
          {syncError}
        </p>
      ) : null}

      <section className="animate-rise grid gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow)] backdrop-blur sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-[var(--ink-soft)]">Mes</span>
            <select
              value={monthId}
              onChange={(e) => setMonthId(e.target.value)}
              className="rounded-xl border border-[var(--line)] bg-white/80 px-3 py-2 capitalize outline-none ring-[var(--accent)] focus:ring-2"
            >
              {months.map((id) => (
                <option key={id} value={id} className="capitalize">
                  {formatMonthLabel(id)}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold ${
                status === 'pagado'
                  ? 'bg-emerald-100 text-[var(--ok)]'
                  : 'bg-amber-100 text-[var(--warn)]'
              }`}
            >
              {status === 'pagado' ? (
                <CheckCircle2 className="size-4" />
              ) : (
                <CircleDollarSign className="size-4" />
              )}
              {status === 'pagado' ? 'Pagado' : 'Pendiente'}
            </span>
            <button
              type="button"
              onClick={() =>
                void setMonthStatus(status === 'pagado' ? 'pendiente' : 'pagado', user.uid)
              }
              className="rounded-xl border border-[var(--line)] bg-white/70 px-3 py-2 text-sm font-medium transition hover:bg-white"
            >
              Marcar {status === 'pagado' ? 'Pendiente' : 'Pagado'}
            </button>
          </div>
        </div>

        {includeSavings ? (
          <div className="rounded-xl border border-[var(--line)] bg-white/55 px-3 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-[var(--ink)]">
                  <PiggyBank className="size-4 text-[var(--accent)]" aria-hidden />
                  Incluir ahorro individual
                </p>
                <p className="mt-0.5 text-xs text-[var(--ink-soft)]">
                  Se suma al aporte de cada uno. No es un gasto compartido.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={true}
                aria-label="Quitar ahorro individual"
                onClick={() => void onToggleSavings()}
                className="relative h-8 w-14 shrink-0 rounded-full bg-[var(--accent)] transition"
              >
                <span className="absolute top-1 left-1 size-6 translate-x-6 rounded-full bg-white shadow transition" />
              </button>
            </div>

            <label className="mt-3 flex flex-col gap-1 text-sm">
              <span className="font-medium text-[var(--ink-soft)]">Monto ahorro c/u (€)</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={savingsDraft}
                onChange={(e) => setSavingsDraft(e.target.value)}
                onBlur={() => void onSavingsAmountCommit()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void onSavingsAmountCommit()
                  }
                }}
                className="max-w-[10rem] rounded-xl border border-[var(--line)] bg-white/90 px-3 py-2 outline-none ring-[var(--accent)] focus:ring-2"
              />
            </label>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void onToggleSavings()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--line)] bg-white/40 px-3 py-2.5 text-sm font-medium text-[var(--ink-soft)] transition hover:bg-white/70 hover:text-[var(--ink)]"
          >
            <PiggyBank className="size-4" aria-hidden />
            Añadir ahorro individual
          </button>
        )}

        <div
          className={`grid grid-cols-1 gap-3 ${includeSavings ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}
        >
          <Stat label="Total compartido" value={formatMoney(shared)} />
          {includeSavings ? (
            <Stat
              label="Ahorro c/u"
              value={formatMoney(savingsAmount)}
              hint="Se suma al aporte de cada uno"
            />
          ) : null}
          <Stat
            label="Aporte de cada uno"
            value={formatMoney(contribution)}
            hint={aporteHint}
            emphasize
          />
        </div>
      </section>

      <section className="animate-rise-delay rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow)] backdrop-blur sm:p-5">
        <h2 className="mb-3 text-lg font-semibold">
          {editing ? 'Editar gasto' : 'Gastos compartidos'}
        </h2>

        <form onSubmit={onSubmit} className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_7rem_auto]">
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre (ej. Internet)"
            className="rounded-xl border border-[var(--line)] bg-white/80 px-3 py-2.5 outline-none ring-[var(--accent)] focus:ring-2"
          />
          <input
            type="number"
            required
            min={0}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Monto"
            className="rounded-xl border border-[var(--line)] bg-white/80 px-3 py-2.5 outline-none ring-[var(--accent)] focus:ring-2"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[var(--accent)] px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--accent-deep)] disabled:opacity-60"
            >
              {editing ? <Pencil className="size-4" /> : <Plus className="size-4" />}
              {editing ? 'Guardar' : 'Añadir'}
            </button>
            {editing ? (
              <button
                type="button"
                onClick={cancelEdit}
                className="rounded-xl border border-[var(--line)] bg-white/70 px-3 py-2.5"
                aria-label="Cancelar edición"
              >
                <X className="size-4" />
              </button>
            ) : null}
          </div>
        </form>

        {loading || seeding ? (
          <p className="animate-pulse-soft text-sm text-[var(--ink-soft)]">
            {seeding ? 'Sembrando gastos por defecto…' : 'Cargando gastos…'}
          </p>
        ) : expenses.length === 0 ? (
          <p className="text-sm text-[var(--ink-soft)]">No hay gastos. Añade el primero.</p>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {expenses.map((expense) => (
              <li key={expense.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{expense.name}</p>
                  <p className="text-sm text-[var(--ink-soft)]">{formatMoney(expense.amount)}</p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    onClick={() => startEdit(expense)}
                    className="rounded-lg border border-[var(--line)] bg-white/70 p-2 transition hover:bg-white"
                    aria-label={`Editar ${expense.name}`}
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`¿Eliminar «${expense.name}»?`)) {
                        void deleteExpense(expense.id)
                      }
                    }}
                    className="rounded-lg border border-[var(--line)] bg-white/70 p-2 text-red-700 transition hover:bg-white"
                    aria-label={`Eliminar ${expense.name}`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <TasksSection />

      <InstallHint />

      <p className="animate-rise-delay-2 text-center text-xs text-[var(--ink-soft)]">
        Los totales se actualizan al instante; Firestore solo sincroniza en segundo plano.
      </p>
    </AppShell>
  )
}

function Stat({
  label,
  value,
  hint,
  emphasize,
}: {
  label: string
  value: string
  hint?: string
  emphasize?: boolean
}) {
  return (
    <div
      className={`rounded-xl border border-[var(--line)] px-3 py-3 ${
        emphasize ? 'bg-[var(--accent-soft)]/60' : 'bg-white/50'
      }`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--ink-soft)]">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${emphasize ? 'text-[var(--accent-deep)]' : ''}`}>
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-[var(--ink-soft)]">{hint}</p> : null}
    </div>
  )
}
