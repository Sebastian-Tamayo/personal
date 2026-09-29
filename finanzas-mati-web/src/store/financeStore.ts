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
  DEFAULT_SHARED_EXPENSES,
  contributionPerPerson,
  currentMonthId,
  sharedTotal,
  type Expense,
  type MonthRecord,
  type MonthStatus,
} from '../lib/finance'
import { getDb } from '../lib/firebase'

interface FinanceState {
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
  totals: () => { shared: number; contribution: number }
}

let expensesUnsub: Unsubscribe | null = null
let monthUnsub: Unsubscribe | null = null
let seedingInFlight = false

async function seedDefaultsIfEmpty(uid: string): Promise<void> {
  if (seedingInFlight) return
  seedingInFlight = true
  try {
    const db = getDb()
    const snap = await getDocs(collection(db, 'expenses'))
    if (!snap.empty) return

    const batch = writeBatch(db)
    const now = Date.now()
    for (const item of DEFAULT_SHARED_EXPENSES) {
      const ref = doc(collection(db, 'expenses'))
      batch.set(ref, {
        name: item.name,
        amount: item.amount,
        createdAt: now,
        updatedAt: now,
        createdBy: uid,
      })
    }
    // Mes actual pendiente por defecto
    const monthRef = doc(db, 'months', currentMonthId())
    batch.set(
      monthRef,
      {
        status: 'pendiente',
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
    return {
      shared: sharedTotal(expenses),
      contribution: contributionPerPerson(expenses),
    }
  },

  setMonthId: (monthId) => {
    set({ monthId })
    // Re-subscribe month doc only — caller should re-call subscribe or we handle below
    if (monthUnsub) {
      monthUnsub()
      monthUnsub = null
    }
    const db = getDb()
    monthUnsub = onSnapshot(
      doc(db, 'months', monthId),
      (snap) => {
        if (!snap.exists()) {
          set({ month: null })
          return
        }
        const data = snap.data()
        set({
          month: {
            id: snap.id,
            status: (data.status as MonthStatus) || 'pendiente',
            updatedAt: Number(data.updatedAt) || Date.now(),
            updatedBy: String(data.updatedBy || ''),
          },
        })
      },
      (err) => set({ syncError: err.message }),
    )
  },

  subscribe: (uid: string) => {
    // cleanup previous
    expensesUnsub?.()
    monthUnsub?.()
    set({ loading: true, syncError: null, hydrated: false })

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
        const expenses: Expense[] = snap.docs.map((d) => {
          const data = d.data()
          return {
            id: d.id,
            name: String(data.name ?? ''),
            amount: Number(data.amount) || 0,
            createdAt: Number(data.createdAt) || 0,
            updatedAt: Number(data.updatedAt) || 0,
            createdBy: String(data.createdBy || ''),
          }
        })
        set({ expenses, loading: false, hydrated: true })
      },
      (err) => set({ syncError: err.message, loading: false }),
    )

    monthUnsub = onSnapshot(
      doc(db, 'months', monthId),
      (snap) => {
        if (!snap.exists()) {
          set({ month: null })
          return
        }
        const data = snap.data()
        set({
          month: {
            id: snap.id,
            status: (data.status as MonthStatus) || 'pendiente',
            updatedAt: Number(data.updatedAt) || Date.now(),
            updatedBy: String(data.updatedBy || ''),
          },
        })
      },
      (err) => set({ syncError: err.message }),
    )

    return () => {
      expensesUnsub?.()
      monthUnsub?.()
      expensesUnsub = null
      monthUnsub = null
    }
  },

  addExpense: async (name, amount, uid) => {
    const tempId = `local-${crypto.randomUUID()}`
    const now = Date.now()
    const optimistic: Expense = {
      id: tempId,
      name: name.trim(),
      amount,
      createdAt: now,
      updatedAt: now,
      createdBy: uid,
    }
    set((s) => ({ expenses: [...s.expenses, optimistic], syncError: null }))
    try {
      const ref = await addDoc(collection(getDb(), 'expenses'), {
        name: optimistic.name,
        amount: optimistic.amount,
        createdAt: now,
        updatedAt: now,
        createdBy: uid,
        _server: serverTimestamp(),
      })
      // Replace temp id if snapshot hasn't landed yet
      set((s) => ({
        expenses: s.expenses.map((e) => (e.id === tempId ? { ...e, id: ref.id } : e)),
      }))
    } catch (err) {
      set((s) => ({
        expenses: s.expenses.filter((e) => e.id !== tempId),
        syncError: err instanceof Error ? err.message : 'No se pudo guardar el gasto',
      }))
      throw err
    }
  },

  updateExpense: async (id, name, amount) => {
    const prev = get().expenses.find((e) => e.id === id)
    if (!prev) return
    const now = Date.now()
    set((s) => ({
      expenses: s.expenses.map((e) =>
        e.id === id ? { ...e, name: name.trim(), amount, updatedAt: now } : e,
      ),
      syncError: null,
    }))
    try {
      await updateDoc(doc(getDb(), 'expenses', id), {
        name: name.trim(),
        amount,
        updatedAt: now,
      })
    } catch (err) {
      set((s) => ({
        expenses: s.expenses.map((e) => (e.id === id ? prev : e)),
        syncError: err instanceof Error ? err.message : 'No se pudo actualizar el gasto',
      }))
      throw err
    }
  },

  deleteExpense: async (id) => {
    const prev = get().expenses
    set({ expenses: prev.filter((e) => e.id !== id), syncError: null })
    try {
      await deleteDoc(doc(getDb(), 'expenses', id))
    } catch (err) {
      set({
        expenses: prev,
        syncError: err instanceof Error ? err.message : 'No se pudo eliminar el gasto',
      })
      throw err
    }
  },

  setMonthStatus: async (status, uid) => {
    const monthId = get().monthId
    const prev = get().month
    const now = Date.now()
    const next: MonthRecord = {
      id: monthId,
      status,
      updatedAt: now,
      updatedBy: uid,
    }
    set({ month: next, syncError: null })
    try {
      await setDoc(
        doc(getDb(), 'months', monthId),
        { status, updatedAt: now, updatedBy: uid },
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
}))
