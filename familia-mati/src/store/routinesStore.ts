import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore'
import { create } from 'zustand'
import {
  DEFAULT_ROUTINES_DIGEST_TIME,
  normalizeDigestTime,
  type FamiliaRoutine,
  type RoutineCadence,
} from '../lib/family'
import { getDb } from '../lib/firebase'

const COLLECTION = 'familia_routines'
/** Shared household setting — one digest clock for all routines (not agenda). */
const DIGEST_DOC = ['familia_settings', 'routinesDigest'] as const

interface RoutinesState {
  routines: FamiliaRoutine[]
  /** HH:mm Europe/Madrid — one shared alarm for the whole routines list. */
  digestTime: string
  loading: boolean
  syncError: string | null
  subscribe: () => () => void
  setDigestTime: (time: string, uid: string) => Promise<void>
  addRoutine: (
    input: { title: string; notes: string; cadence: RoutineCadence },
    uid: string,
  ) => Promise<void>
  updateRoutine: (
    id: string,
    input: { title: string; notes: string; cadence: RoutineCadence; active: boolean },
  ) => Promise<void>
  deleteRoutine: (id: string) => Promise<void>
}

let unsubRoutines: Unsubscribe | null = null
let unsubDigest: Unsubscribe | null = null

function normalizeCadence(raw: unknown): RoutineCadence {
  const c = String(raw || '')
    .trim()
    .toLowerCase()
  if (c === 'semanal' || c === 'mensual') return c
  return ''
}

function mapRoutine(id: string, data: Record<string, unknown>): FamiliaRoutine {
  return {
    id,
    title: String(data.title ?? ''),
    notes: String(data.notes ?? ''),
    cadence: normalizeCadence(data.cadence),
    active: data.active !== false,
    createdAt: Number(data.createdAt) || 0,
    updatedAt: Number(data.updatedAt) || 0,
    createdBy: String(data.createdBy || ''),
  }
}

export const useRoutinesStore = create<RoutinesState>((set, get) => ({
  routines: [],
  digestTime: DEFAULT_ROUTINES_DIGEST_TIME,
  loading: true,
  syncError: null,

  subscribe: () => {
    unsubRoutines?.()
    unsubDigest?.()
    set({ loading: true, syncError: null })

    unsubRoutines = onSnapshot(
      query(collection(getDb(), COLLECTION), orderBy('createdAt', 'asc')),
      (snap) => {
        const routines = snap.docs
          .map((d) => mapRoutine(d.id, d.data() as Record<string, unknown>))
          .filter((r) => r.active)
        set({ routines, loading: false })
      },
      (err) => set({ syncError: err.message, loading: false }),
    )

    unsubDigest = onSnapshot(
      doc(getDb(), DIGEST_DOC[0], DIGEST_DOC[1]),
      (snap) => {
        const data = (snap.data() || {}) as Record<string, unknown>
        set({ digestTime: normalizeDigestTime(data.time ?? DEFAULT_ROUTINES_DIGEST_TIME) })
      },
      (err) => set({ syncError: err.message }),
    )

    return () => {
      unsubRoutines?.()
      unsubDigest?.()
      unsubRoutines = null
      unsubDigest = null
    }
  },

  setDigestTime: async (time, uid) => {
    const next = normalizeDigestTime(time)
    const prev = get().digestTime
    set({ digestTime: next, syncError: null })
    try {
      await setDoc(
        doc(getDb(), DIGEST_DOC[0], DIGEST_DOC[1]),
        {
          time: next,
          tz: 'Europe/Madrid',
          updatedAt: Date.now(),
          updatedBy: uid,
        },
        { merge: true },
      )
    } catch (err) {
      set({
        digestTime: prev,
        syncError: err instanceof Error ? err.message : 'No se pudo guardar la hora del aviso',
      })
      throw err
    }
  },

  addRoutine: async (input, uid) => {
    const tempId = `local-${crypto.randomUUID()}`
    const now = Date.now()
    const optimistic: FamiliaRoutine = {
      id: tempId,
      title: input.title.trim(),
      notes: input.notes.trim(),
      cadence: input.cadence,
      active: true,
      createdAt: now,
      updatedAt: now,
      createdBy: uid,
    }
    set((s) => ({ routines: [...s.routines, optimistic], syncError: null }))
    try {
      const ref = await addDoc(collection(getDb(), COLLECTION), {
        title: optimistic.title,
        notes: optimistic.notes,
        cadence: optimistic.cadence,
        active: true,
        createdAt: now,
        updatedAt: now,
        createdBy: uid,
      })
      set((s) => ({
        routines: s.routines.map((r) => (r.id === tempId ? { ...r, id: ref.id } : r)),
      }))
    } catch (err) {
      set((s) => ({
        routines: s.routines.filter((r) => r.id !== tempId),
        syncError: err instanceof Error ? err.message : 'No se pudo guardar la rutina',
      }))
      throw err
    }
  },

  updateRoutine: async (id, input) => {
    const prev = get().routines.find((r) => r.id === id)
    if (!prev) return
    const now = Date.now()
    const next: FamiliaRoutine = {
      ...prev,
      title: input.title.trim(),
      notes: input.notes.trim(),
      cadence: input.cadence,
      active: input.active,
      updatedAt: now,
    }
    set((s) => ({
      routines: input.active
        ? s.routines.map((r) => (r.id === id ? next : r))
        : s.routines.filter((r) => r.id !== id),
      syncError: null,
    }))
    try {
      await updateDoc(doc(getDb(), COLLECTION, id), {
        title: next.title,
        notes: next.notes,
        cadence: next.cadence,
        active: next.active,
        updatedAt: now,
      })
    } catch (err) {
      set((s) => ({
        routines: prev
          ? [...s.routines.filter((r) => r.id !== id), prev].sort((a, b) => a.createdAt - b.createdAt)
          : s.routines,
        syncError: err instanceof Error ? err.message : 'No se pudo actualizar la rutina',
      }))
      throw err
    }
  },

  deleteRoutine: async (id) => {
    const prev = get().routines
    set({ routines: prev.filter((r) => r.id !== id), syncError: null })
    try {
      await deleteDoc(doc(getDb(), COLLECTION, id))
    } catch (err) {
      set({
        routines: prev,
        syncError: err instanceof Error ? err.message : 'No se pudo eliminar la rutina',
      })
      throw err
    }
  },
}))
