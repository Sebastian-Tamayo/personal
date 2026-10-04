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
import { normalizeMemberKey, normalizeReminderLeadMinutes } from '../lib/family'
import { getDb } from '../lib/firebase'

type ItemInput = {
  title: string
  notes: string
  kind: ItemKind
  assignee: MemberKey | 'todos'
  date: string
  time: string
  /** Set when timed (aviso); omit/clear when no time. */
  reminderLeadMinutes?: number | null
}

interface OrgState {
  items: OrgItem[]
  loading: boolean
  syncError: string | null
  filterMember: MemberKey | 'todos'
  setFilterMember: (m: MemberKey | 'todos') => void
  subscribe: () => () => void
  addItem: (input: ItemInput, uid: string) => Promise<void>
  updateItem: (id: string, input: ItemInput & { status: ItemStatus }) => Promise<void>
  setStatus: (id: string, status: ItemStatus) => Promise<void>
  deleteItem: (id: string) => Promise<void>
}

let unsub: Unsubscribe | null = null

function mapLead(raw: unknown, hasTime: boolean): number | undefined {
  if (!hasTime) return undefined
  if (raw === undefined || raw === null || raw === '') return undefined
  const n = normalizeReminderLeadMinutes(raw)
  return n
}

function mapItem(id: string, data: Record<string, unknown>): OrgItem {
  const rawAssignee = String(data.assignee ?? 'todos')
  const normalized = normalizeMemberKey(rawAssignee)
  const assignee: MemberKey | 'todos' =
    normalized === 'todos' ||
    normalized === 'sebas' ||
    normalized === 'lore' ||
    normalized === 'hellen' ||
    normalized === 'bebe'
      ? normalized
      : 'todos'
  const time = String(data.time ?? '')
  const hasTime = /^\d{2}:\d{2}/.test(time)
  const lead = mapLead(data.reminderLeadMinutes, hasTime)
  return {
    id,
    title: String(data.title ?? ''),
    notes: String(data.notes ?? ''),
    kind: (data.kind as ItemKind) || 'tarea',
    status: data.status === 'hecha' ? 'hecha' : 'pendiente',
    assignee,
    date: String(data.date ?? ''),
    time,
    ...(lead != null ? { reminderLeadMinutes: lead } : {}),
    createdAt: Number(data.createdAt) || 0,
    updatedAt: Number(data.updatedAt) || 0,
    createdBy: String(data.createdBy || ''),
  }
}

function leadPayload(time: string, lead: number | null | undefined): Record<string, unknown> {
  const hasTime = /^\d{2}:\d{2}/.test(time)
  if (!hasTime || lead == null) return { reminderLeadMinutes: null }
  return { reminderLeadMinutes: normalizeReminderLeadMinutes(lead) }
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
    const time = input.time || ''
    const leadFields = leadPayload(time, input.reminderLeadMinutes)
    const optimistic: OrgItem = {
      id: tempId,
      title: input.title.trim(),
      notes: input.notes.replace(/^\s+|\s+$/g, ''),
      kind: input.kind,
      status: 'pendiente',
      assignee: input.assignee,
      date: input.date,
      time,
      ...(typeof leadFields.reminderLeadMinutes === 'number'
        ? { reminderLeadMinutes: leadFields.reminderLeadMinutes }
        : {}),
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
        ...leadFields,
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
    const time = input.time || ''
    const leadFields = leadPayload(time, input.reminderLeadMinutes)
    const next: OrgItem = {
      ...prev,
      title: input.title.trim(),
      notes: input.notes.replace(/^\s+|\s+$/g, ''),
      kind: input.kind,
      assignee: input.assignee,
      date: input.date,
      time,
      status: input.status,
      updatedAt: now,
    }
    if (typeof leadFields.reminderLeadMinutes === 'number') {
      next.reminderLeadMinutes = leadFields.reminderLeadMinutes
    } else {
      delete next.reminderLeadMinutes
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
        ...leadFields,
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
    const prevItems = get().items
    set({ items: prevItems.filter((i) => i.id !== id), syncError: null })
    try {
      await deleteDoc(doc(getDb(), 'familia_items', id))
    } catch (err) {
      set({
        items: prevItems,
        syncError: err instanceof Error ? err.message : 'No se pudo eliminar',
      })
      throw err
    }
  },
}))
