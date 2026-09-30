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
import { getDb } from '../lib/firebase'
import type { FamilyTask, TaskStatus } from '../lib/tasks'

interface TasksState {
  tasks: FamilyTask[]
  loading: boolean
  syncError: string | null
  subscribe: () => () => void
  addTask: (
    input: { title: string; notes: string; dueAt: string },
    uid: string,
  ) => Promise<void>
  updateTask: (
    id: string,
    input: { title: string; notes: string; dueAt: string; status: TaskStatus },
  ) => Promise<void>
  setTaskStatus: (id: string, status: TaskStatus) => Promise<void>
  deleteTask: (id: string) => Promise<void>
}

let tasksUnsub: Unsubscribe | null = null

function mapDoc(id: string, data: Record<string, unknown>): FamilyTask {
  return {
    id,
    title: String(data.title ?? ''),
    notes: String(data.notes ?? ''),
    dueAt: String(data.dueAt ?? ''),
    status: data.status === 'hecha' ? 'hecha' : 'pendiente',
    createdAt: Number(data.createdAt) || 0,
    updatedAt: Number(data.updatedAt) || 0,
    createdBy: String(data.createdBy || ''),
  }
}

export const useTasksStore = create<TasksState>((set, get) => ({
  tasks: [],
  loading: true,
  syncError: null,

  subscribe: () => {
    tasksUnsub?.()
    set({ loading: true, syncError: null })
    const db = getDb()
    tasksUnsub = onSnapshot(
      query(collection(db, 'tasks'), orderBy('createdAt', 'desc')),
      (snap) => {
        const tasks = snap.docs.map((d) => mapDoc(d.id, d.data() as Record<string, unknown>))
        set({ tasks, loading: false })
      },
      (err) => set({ syncError: err.message, loading: false }),
    )
    return () => {
      tasksUnsub?.()
      tasksUnsub = null
    }
  },

  addTask: async ({ title, notes, dueAt }, uid) => {
    const tempId = `local-${crypto.randomUUID()}`
    const now = Date.now()
    const optimistic: FamilyTask = {
      id: tempId,
      title: title.trim(),
      notes: notes.trim(),
      dueAt,
      status: 'pendiente',
      createdAt: now,
      updatedAt: now,
      createdBy: uid,
    }
    set((s) => ({ tasks: [optimistic, ...s.tasks], syncError: null }))
    try {
      const ref = await addDoc(collection(getDb(), 'tasks'), {
        title: optimistic.title,
        notes: optimistic.notes,
        dueAt: optimistic.dueAt,
        status: 'pendiente',
        createdAt: now,
        updatedAt: now,
        createdBy: uid,
      })
      set((s) => ({
        tasks: s.tasks.map((t) => (t.id === tempId ? { ...t, id: ref.id } : t)),
      }))
    } catch (err) {
      set((s) => ({
        tasks: s.tasks.filter((t) => t.id !== tempId),
        syncError: err instanceof Error ? err.message : 'No se pudo guardar la tarea',
      }))
      throw err
    }
  },

  updateTask: async (id, input) => {
    const prev = get().tasks.find((t) => t.id === id)
    if (!prev) return
    const now = Date.now()
    const next = {
      ...prev,
      title: input.title.trim(),
      notes: input.notes.trim(),
      dueAt: input.dueAt,
      status: input.status,
      updatedAt: now,
    }
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? next : t)), syncError: null }))
    try {
      await updateDoc(doc(getDb(), 'tasks', id), {
        title: next.title,
        notes: next.notes,
        dueAt: next.dueAt,
        status: next.status,
        updatedAt: now,
      })
    } catch (err) {
      set((s) => ({
        tasks: s.tasks.map((t) => (t.id === id ? prev : t)),
        syncError: err instanceof Error ? err.message : 'No se pudo actualizar la tarea',
      }))
      throw err
    }
  },

  setTaskStatus: async (id, status) => {
    const prev = get().tasks.find((t) => t.id === id)
    if (!prev || prev.status === status) return
    const now = Date.now()
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, status, updatedAt: now } : t)),
      syncError: null,
    }))
    try {
      await updateDoc(doc(getDb(), 'tasks', id), { status, updatedAt: now })
    } catch (err) {
      set((s) => ({
        tasks: s.tasks.map((t) => (t.id === id ? prev : t)),
        syncError: err instanceof Error ? err.message : 'No se pudo cambiar el estado',
      }))
      throw err
    }
  },

  deleteTask: async (id) => {
    const prev = get().tasks
    set({ tasks: prev.filter((t) => t.id !== id), syncError: null })
    try {
      await deleteDoc(doc(getDb(), 'tasks', id))
    } catch (err) {
      set({
        tasks: prev,
        syncError: err instanceof Error ? err.message : 'No se pudo eliminar la tarea',
      })
      throw err
    }
  },
}))
