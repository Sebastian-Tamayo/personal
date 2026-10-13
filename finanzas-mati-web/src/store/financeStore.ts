import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore'
import { create } from 'zustand'
import {
  DEFAULT_SAVINGS_PER_PERSON,
  DEFAULT_SHARED_EXPENSES,
  contributionPerPerson,
  currentMonthId,
  expensesForMonth,
  parseExpense,
  parseMonthRecord,
  sharedTotal,
  type Expense,
  type MonthRecord,
  type MonthStatus,
} from '../lib/finance'
import { getDb } from '../lib/firebase'

interface FinanceState {
  /** Gastos del mes seleccionado (únicos que entran en totales) */
  expenses: Expense[]
  month: MonthRecord | null
  monthId: string
  loading: boolean
  seeding: boolean
  syncError: string | null
  hydrated: boolean
  subscribe: (uid: string) => () => void
  setMonthId: (monthId: string) => void
  addExpense: (name: string, amount: number, uid: string) => Promise<void>
  updateExpense: (id: string, name: string, amount: number) => Promise<void>
  deleteExpense: (id: string) => Promise<void>
  setMonthStatus: (status: MonthStatus, uid: string) => Promise<void>
  setSavingsSettings: (
    opts: { includeSavings: boolean; savingsAmount: number },
    uid: string,
  ) => Promise<void>
  totals: () => { shared: number; contribution: number; includeSavings: boolean; savingsAmount: number }
}

let expensesUnsub: Unsubscribe | null = null
let monthUnsub: Unsubscribe | null = null
let seedingInFlight = false
/** Caché completa para filtrar al cambiar de mes sin re-fetch */
let allExpensesCache: Expense[] = []
/** Evita reescribir monthId legacy en bucle */
const monthIdBackfillDone = new Set<string>()

function defaultMonth(id: string, uid = ''): MonthRecord {
  return {
    id,
    status: 'pendiente',
    includeSavings: true,
    savingsAmount: DEFAULT_SAVINGS_PER_PERSON,
    updatedAt: Date.now(),
    updatedBy: uid,
  }
}

function publishMonthExpenses(
  monthId: string,
  set: (partial: Partial<FinanceState>) => void,
  extra?: Partial<FinanceState>,
) {
  set({
    expenses: expensesForMonth(allExpensesCache, monthId),
    ...extra,
  })
}

function bindMonthSnapshot(monthId: string, set: (partial: Partial<FinanceState>) => void) {
  if (monthUnsub) {
    monthUnsub()
    monthUnsub = null
  }
  const db = getDb()
  monthUnsub = onSnapshot(
    doc(db, 'months', monthId),
    (snap) => {
      if (!snap.exists()) {
        set({ month: defaultMonth(monthId) })
        return
      }
      set({ month: parseMonthRecord(snap.id, snap.data() as Record<string, unknown>) })
    },
    (err) => set({ syncError: err.message }),
  )
}

async function backfillMissingMonthIds(expenses: Expense[]): Promise<void> {
  const db = getDb()
  const pending = expenses.filter((e) => !monthIdBackfillDone.has(e.id) && !e.id.startsWith('local-'))
  if (pending.length === 0) return

  // Solo docs que en Firestore aún no tienen monthId (detectados al parsear desde raw)
  // Aquí reescribimos siempre el monthId resuelto una vez por id.
  const chunk = pending.slice(0, 40)
  await Promise.all(
    chunk.map(async (e) => {
      monthIdBackfillDone.add(e.id)
      try {
        await updateDoc(doc(db, 'expenses', e.id), { monthId: e.monthId })
      } catch {
        monthIdBackfillDone.delete(e.id)
      }
    }),
  )
}

async function seedDefaultsIfEmpty(uid: string): Promise<void> {
  if (seedingInFlight) return
  seedingInFlight = true
  try {
    const db = getDb()
    const snap = await getDocs(collection(db, 'expenses'))
    if (!snap.empty) return

    const batch = writeBatch(db)
    const now = Date.now()
    const monthId = currentMonthId()
    for (const item of DEFAULT_SHARED_EXPENSES) {
      const ref = doc(collection(db, 'expenses'))
      batch.set(ref, {
        name: item.name,
        amount: item.amount,
        monthId,
        createdAt: now,
        updatedAt: now,
        createdBy: uid,
      })
    }
    const monthRef = doc(db, 'months', monthId)
    batch.set(
      monthRef,
      {
        status: 'pendiente',
        includeSavings: true,
        savingsAmount: DEFAULT_SAVINGS_PER_PERSON,
        updatedAt: now,
        updatedBy: uid,
      },
      { merge: true },
    )
    await batch.commit()
  } finally {
    seedingInFlight = false
  }
}

export const useFinanceStore = create<FinanceState>((set, get) => ({
  expenses: [],
  month: null,
  monthId: currentMonthId(),
  loading: true,
  seeding: false,
  syncError: null,
  hydrated: false,

  totals: () => {
    const expenses = get().expenses
    const month = get().month
    const includeSavings = month?.includeSavings ?? true
    const savingsAmount = month?.savingsAmount ?? DEFAULT_SAVINGS_PER_PERSON
    return {
      shared: sharedTotal(expenses),
      contribution: contributionPerPerson(expenses, { includeSavings, savingsAmount }),
      includeSavings,
      savingsAmount,
    }
  },

  setMonthId: (monthId) => {
    set({ monthId, month: defaultMonth(monthId) })
    publishMonthExpenses(monthId, set)
    bindMonthSnapshot(monthId, set)
  },

  subscribe: (uid: string) => {
    expensesUnsub?.()
    monthUnsub?.()
    allExpensesCache = []
    set({ loading: true, syncError: null, hydrated: false, expenses: [] })

    const db = getDb()
    const monthId = get().monthId

    void (async () => {
      set({ seeding: true })
      try {
        await seedDefaultsIfEmpty(uid)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error al sembrar gastos'
        set({ syncError: message })
      } finally {
        set({ seeding: false })
      }
    })()

    expensesUnsub = onSnapshot(
      query(collection(db, 'expenses'), orderBy('createdAt', 'asc')),
      (snap) => {
        const parsed: Expense[] = snap.docs.map((d) =>
          parseExpense(d.id, d.data() as Record<string, unknown>),
        )
        allExpensesCache = parsed
        publishMonthExpenses(get().monthId, set, { loading: false, hydrated: true })

        // Persist monthId on legacy docs (once) so history stays per-month.
        const needsBackfill = snap.docs.filter((d) => {
          const raw = d.data().monthId
          return typeof raw !== 'string' || !/^\d{4}-\d{2}$/.test(raw)
        })
        if (needsBackfill.length > 0) {
          void backfillMissingMonthIds(
            needsBackfill.map((d) => parseExpense(d.id, d.data() as Record<string, unknown>)),
          )
        }
      },
      (err) => set({ syncError: err.message, loading: false }),
    )

    bindMonthSnapshot(monthId, set)

    return () => {
      expensesUnsub?.()
      monthUnsub?.()
      expensesUnsub = null
      monthUnsub = null
      allExpensesCache = []
    }
  },

  addExpense: async (name, amount, uid) => {
    const monthId = get().monthId
    const tempId = `local-${crypto.randomUUID()}`
    const now = Date.now()
    const optimistic: Expense = {
      id: tempId,
      name: name.trim(),
      amount,
      monthId,
      createdAt: now,
      updatedAt: now,
      createdBy: uid,
    }
    allExpensesCache = [...allExpensesCache, optimistic]
    publishMonthExpenses(monthId, set, { syncError: null })
    try {
      const ref = await addDoc(collection(getDb(), 'expenses'), {
        name: optimistic.name,
        amount: optimistic.amount,
        monthId,
        createdAt: now,
        updatedAt: now,
        createdBy: uid,
        _server: serverTimestamp(),
      })
      allExpensesCache = allExpensesCache.map((e) =>
        e.id === tempId ? { ...e, id: ref.id } : e,
      )
      publishMonthExpenses(get().monthId, set)
    } catch (err) {
      allExpensesCache = allExpensesCache.filter((e) => e.id !== tempId)
      publishMonthExpenses(get().monthId, set, {
        syncError: err instanceof Error ? err.message : 'No se pudo guardar el gasto',
      })
      throw err
    }
  },

  updateExpense: async (id, name, amount) => {
    const prev = allExpensesCache.find((e) => e.id === id)
    if (!prev) return
    const now = Date.now()
    allExpensesCache = allExpensesCache.map((e) =>
      e.id === id ? { ...e, name: name.trim(), amount, updatedAt: now } : e,
    )
    publishMonthExpenses(get().monthId, set, { syncError: null })
    try {
      await updateDoc(doc(getDb(), 'expenses', id), {
        name: name.trim(),
        amount,
        updatedAt: now,
        monthId: prev.monthId,
      })
    } catch (err) {
      allExpensesCache = allExpensesCache.map((e) => (e.id === id ? prev : e))
      publishMonthExpenses(get().monthId, set, {
        syncError: err instanceof Error ? err.message : 'No se pudo actualizar el gasto',
      })
      throw err
    }
  },

  deleteExpense: async (id) => {
    const prev = allExpensesCache
    allExpensesCache = prev.filter((e) => e.id !== id)
    publishMonthExpenses(get().monthId, set, { syncError: null })
    try {
      await deleteDoc(doc(getDb(), 'expenses', id))
    } catch (err) {
      allExpensesCache = prev
      publishMonthExpenses(get().monthId, set, {
        syncError: err instanceof Error ? err.message : 'No se pudo eliminar el gasto',
      })
      throw err
    }
  },

  setMonthStatus: async (status, uid) => {
    const monthId = get().monthId
    const prev = get().month
    const now = Date.now()
    const base = prev ?? defaultMonth(monthId, uid)
    const next: MonthRecord = { ...base, status, updatedAt: now, updatedBy: uid }
    set({ month: next, syncError: null })
    try {
      await setDoc(
        doc(getDb(), 'months', monthId),
        {
          status,
          includeSavings: next.includeSavings,
          savingsAmount: next.savingsAmount,
          updatedAt: now,
          updatedBy: uid,
        },
        { merge: true },
      )
    } catch (err) {
      set({
        month: prev,
        syncError: err instanceof Error ? err.message : 'No se pudo actualizar el mes',
      })
      throw err
    }
  },

  setSavingsSettings: async ({ includeSavings, savingsAmount }, uid) => {
    const monthId = get().monthId
    const prev = get().month
    const now = Date.now()
    const amount =
      Number.isFinite(savingsAmount) && savingsAmount >= 0
        ? savingsAmount
        : DEFAULT_SAVINGS_PER_PERSON
    const base = prev ?? defaultMonth(monthId, uid)
    const next: MonthRecord = {
      ...base,
      includeSavings,
      savingsAmount: amount,
      updatedAt: now,
      updatedBy: uid,
    }
    set({ month: next, syncError: null })
    try {
      await setDoc(
        doc(getDb(), 'months', monthId),
        {
          status: next.status,
          includeSavings,
          savingsAmount: amount,
          updatedAt: now,
          updatedBy: uid,
        },
        { merge: true },
      )
    } catch (err) {
      set({
        month: prev,
        syncError: err instanceof Error ? err.message : 'No se pudo guardar el ahorro',
      })
      throw err
    }
  },
}))
