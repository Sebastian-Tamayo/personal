export type TaskStatus = 'pendiente' | 'hecha'

export interface FamilyTask {
  id: string
  title: string
  notes: string
  /** ISO local datetime string yyyy-mm-ddThh:mm or empty */
  dueAt: string
  status: TaskStatus
  createdAt: number
  updatedAt: number
  createdBy: string
}

export function formatTaskDue(dueAt: string): string {
  if (!dueAt) return ''
  const d = new Date(dueAt)
  if (Number.isNaN(d.getTime())) return dueAt
  return d.toLocaleString('es-ES', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
