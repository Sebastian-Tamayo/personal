import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore'
import { create } from 'zustand'
import type { ItemKind, ItemStatus, MemberKey, OrgItem } from '../lib/family'
import { normalizeMemberKey } from '../lib/family'
import { getDb } from '../lib/firebase'

interface OrgState {
  items: OrgItem[]
  loading: boolean
  syncError: string | null
  filterMember: MemberKey | 'todos'
  setFilterMember: (m: MemberKey | 'todos') => void
  subscribe: () => () => void
  addItem: (
    input: {
      title: string
      notes: string
      kind: ItemKind
      assignee: MemberKey | 'todos'
      date: string
      time: string
    },
    uid: string,
  ) => Promise<void>
  updateItem: (
    id: string,
    input: {
      title: string
      notes: string
      kind: ItemKind
      assignee: MemberKey | 'todos'
      date: string
      time: string
      status: ItemStatus
    },
  ) => Promise<void>
  setStatus: (id: string, status: ItemStatus) => Promise<void>
  deleteItem: (id: string) => Promise<void>
}

let unsub: Unsubscribe | null = null

function mapItem(id: string, data: Record<string, unknown>): OrgItem {
  const rawAssignee = String(data.assignee ?? 'todos')
  const normalized = normalizeMemberKey(rawAssignee)
  const assignee: MemberKey | 'todos' =
    normalized === 'todos' || normalized === 'sebas' || normalized === 'lore' || normalized === 'hellen' || normalized === 'bebe'
      ? normalized
      : 'todos'
  return {
    id,
    title: String(data.title ?? ''),
    notes: String(data.notes ?? ''),
    kind: (data.kind as ItemKind) || 'tarea',
    status: data.status === 'hecha' ? 'hecha' : 'pendiente',
    assignee,
    date: String(data.date ?? ''),
    time: String(data.time ?? ''),
    createdAt: Number(data.createdAt) || 0,
    updatedAt: Number(data.updatedAt) || 0,
    createdBy: String(data.createdBy || ''),
  }
}

export const useOrgStore = create<OrgState>((set, get) => ({
  items: [],
  loading: true,
  syncError: null,
  filterMember: 'todos',

  setFilterMember: (filterMember) => set({ filterMember }),

  subscribe: () => {
    unsub?.()
    set({ loading: true, syncError: null })
    unsub = onSnapshot(
      query(collection(getDb(), 'familia_items'), orderBy('date', 'asc')),
      (snap) => {
        const items = snap.docs.map((d) => mapItem(d.id, d.data() as Record<string, unknown>))
        // secondary sort by time
        items.sort((a, b) => {
          const da = a.date || '9999'
          const db = b.date || '9999'
          if (da !== db) return da.localeCompare(db)
          return (a.time || '').localeCompare(b.time || '')
        })
        set({ items, loading: false })
      },
      (err) => set({ syncError: err.message, loading: false }),
    )
    return () => {
      unsub?.()
      unsub = null
    }
  },

  addItem: async (input, uid) => {
    const tempId = `local-${crypto.randomUUID()}`
    const now = Date.now()
    const optimistic: OrgItem = {
      id: tempId,
      title: input.title.trim(),
      // Keep internal newlines; only trim edges (notes may be multi-line schedules).
      notes: input.notes.replace(/^\s+|\s+$/g, ''),
      kind: input.kind,
      status: 'pendiente',
      assignee: input.assignee,
      date: input.date,
      time: input.time,
      createdAt: now,
      updatedAt: now,
      createdBy: uid,
    }
    set((s) => ({ items: [...s.items, optimistic], syncError: null }))
    try {
      const ref = await addDoc(collection(getDb(), 'familia_items'), {
        title: optimistic.title,
        notes: optimistic.notes,
        kind: optimistic.kind,
        status: 'pendiente',
        assignee: optimistic.assignee,
        date: optimistic.date,
        time: optimistic.time,
        createdAt: now,
        updatedAt: now,
        createdBy: uid,
      })
      set((s) => ({
        items: s.items.map((i) => (i.id === tempId ? { ...i, id: ref.id } : i)),
      }))
    } catch (err) {
      set((s) => ({
        items: s.items.filter((i) => i.id !== tempId),
        syncError: err instanceof Error ? err.message : 'No se pudo guardar',
      }))
      throw err
    }
  },

  updateItem: async (id, input) => {
    const prev = get().items.find((i) => i.id === id)
    if (!prev) return
    const now = Date.now()
    const next = {
      ...prev,
      title: input.title.trim(),
      notes: input.notes.replace(/^\s+|\s+$/g, ''),
      kind: input.kind,
      assignee: input.assignee,
      date: input.date,
      time: input.time,
      status: input.status,
      updatedAt: now,
    }
    set((s) => ({ items: s.items.map((i) => (i.id === id ? next : i)), syncError: null }))
    try {
      await updateDoc(doc(getDb(), 'familia_items', id), {
        title: next.title,
        notes: next.notes,
        kind: next.kind,
        assignee: next.assignee,
        date: next.date,
        time: next.time,
        status: next.status,
        updatedAt: now,
      })
    } catch (err) {
      set((s) => ({
        items: s.items.map((i) => (i.id === id ? prev : i)),
        syncError: err instanceof Error ? err.message : 'No se pudo actualizar',
      }))
      throw err
    }
  },

  setStatus: async (id, status) => {
    const prev = get().items.find((i) => i.id === id)
    if (!prev) return
    const now = Date.now()
    set((s) => ({
      items: s.items.map((i) => (i.id === id ? { ...i, status, updatedAt: now } : i)),
      syncError: null,
    }))
    try {
      await updateDoc(doc(getDb(), 'familia_items', id), { status, updatedAt: now })
    } catch (err) {
      set((s) => ({
        items: s.items.map((i) => (i.id === id ? prev : i)),
        syncError: err instanceof Error ? err.message : 'No se pudo cambiar estado',
      }))
      throw err
    }
  },

  deleteItem: async (id) => {
    const prev = get().items
    set({ items: prev.filter((i) => i.id !== id), syncError: null })
    try {
      await deleteDoc(doc(getDb(), 'familia_items', id))
    } catch (err) {
      set({
        items: prev,
        syncError: err instanceof Error ? err.message : 'No se pudo eliminar',
      })
      throw err
    }
  },
}))
