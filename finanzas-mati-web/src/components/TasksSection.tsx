import { CalendarClock, CheckCircle2, Circle, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { formatTaskDue, type FamilyTask, type TaskStatus } from '../lib/tasks'
import { useAuthStore } from '../store/authStore'
import { useTasksStore } from '../store/tasksStore'

export function TasksSection() {
  const user = useAuthStore((s) => s.user)!
  const tasks = useTasksStore((s) => s.tasks)
  const loading = useTasksStore((s) => s.loading)
  const syncError = useTasksStore((s) => s.syncError)
  const subscribe = useTasksStore((s) => s.subscribe)
  const addTask = useTasksStore((s) => s.addTask)
  const updateTask = useTasksStore((s) => s.updateTask)
  const setTaskStatus = useTasksStore((s) => s.setTaskStatus)
  const deleteTask = useTasksStore((s) => s.deleteTask)

  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [editing, setEditing] = useState<FamilyTask | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => subscribe(), [subscribe])

  const pending = useMemo(() => tasks.filter((t) => t.status === 'pendiente'), [tasks])
  const done = useMemo(() => tasks.filter((t) => t.status === 'hecha'), [tasks])

  function resetForm() {
    setTitle('')
    setNotes('')
    setDueAt('')
    setEditing(null)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setBusy(true)
    try {
      if (editing) {
        await updateTask(editing.id, {
          title,
          notes,
          dueAt,
          status: editing.status,
        })
      } else {
        await addTask({ title, notes, dueAt }, user.uid)
      }
      resetForm()
    } finally {
      setBusy(false)
    }
  }

  function startEdit(task: FamilyTask) {
    setEditing(task)
    setTitle(task.title)
    setNotes(task.notes)
    setDueAt(task.dueAt)
  }

  return (
    <section className="animate-rise-delay rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow)] backdrop-blur sm:p-5">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <CalendarClock className="size-5 text-[var(--accent)]" aria-hidden />
            {editing ? 'Editar cita o tarea' : 'Citas y tareas'}
          </h2>
          <p className="mt-0.5 text-xs text-[var(--ink-soft)]">
            Pendientes del hogar · visibles para Sebas y Lore
          </p>
        </div>
        {!loading ? (
          <span className="rounded-lg bg-black/5 px-2 py-1 text-xs font-medium text-[var(--ink-soft)]">
            {pending.length} pendiente{pending.length === 1 ? '' : 's'}
          </span>
        ) : null}
      </div>

      {syncError ? (
        <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-[var(--warn)]" role="alert">
          {syncError}
        </p>
      ) : null}

      <form onSubmit={onSubmit} className="mb-4 grid gap-2">
        <input
          type="text"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Título (ej. Pediatra Matías)"
          className="rounded-xl border border-[var(--line)] bg-white/80 px-3 py-2.5 outline-none ring-[var(--accent)] focus:ring-2"
        />
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notas (opcional)"
          rows={2}
          className="resize-none rounded-xl border border-[var(--line)] bg-white/80 px-3 py-2.5 outline-none ring-[var(--accent)] focus:ring-2"
        />
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-[var(--ink-soft)]">Fecha y hora (opcional)</span>
          <input
            type="datetime-local"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            className="rounded-xl border border-[var(--line)] bg-white/80 px-3 py-2.5 outline-none ring-[var(--accent)] focus:ring-2"
          />
        </label>
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
              onClick={resetForm}
              className="rounded-xl border border-[var(--line)] bg-white/70 px-3 py-2.5"
              aria-label="Cancelar"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>
      </form>

      {loading ? (
        <p className="animate-pulse-soft text-sm text-[var(--ink-soft)]">Cargando citas…</p>
      ) : tasks.length === 0 ? (
        <p className="text-sm text-[var(--ink-soft)]">No hay citas ni tareas. Añade la primera.</p>
      ) : (
        <div className="space-y-4">
          <TaskList
            title="Pendientes"
            items={pending}
            empty="Nada pendiente."
            onToggle={(id, status) => void setTaskStatus(id, status)}
            onEdit={startEdit}
            onDelete={(id, label) => {
              if (confirm(`¿Eliminar «${label}»?`)) void deleteTask(id)
            }}
          />
          {done.length > 0 ? (
            <TaskList
              title="Hechas"
              items={done}
              empty=""
              onToggle={(id, status) => void setTaskStatus(id, status)}
              onEdit={startEdit}
              onDelete={(id, label) => {
                if (confirm(`¿Eliminar «${label}»?`)) void deleteTask(id)
              }}
            />
          ) : null}
        </div>
      )}
    </section>
  )
}

function TaskList({
  title,
  items,
  empty,
  onToggle,
  onEdit,
  onDelete,
}: {
  title: string
  items: FamilyTask[]
  empty: string
  onToggle: (id: string, status: TaskStatus) => void
  onEdit: (task: FamilyTask) => void
  onDelete: (id: string, label: string) => void
}) {
  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--ink-soft)]">
        {title}
      </h3>
      {items.length === 0 ? (
        empty ? <p className="text-sm text-[var(--ink-soft)]">{empty}</p> : null
      ) : (
        <ul className="divide-y divide-[var(--line)]">
          {items.map((task) => {
            const done = task.status === 'hecha'
            return (
              <li key={task.id} className="flex items-start gap-2 py-3">
                <button
                  type="button"
                  onClick={() => onToggle(task.id, done ? 'pendiente' : 'hecha')}
                  className="mt-0.5 rounded-lg p-1 text-[var(--accent)]"
                  aria-label={done ? 'Marcar pendiente' : 'Marcar hecha'}
                >
                  {done ? <CheckCircle2 className="size-5" /> : <Circle className="size-5" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={`font-medium ${done ? 'text-[var(--ink-soft)] line-through' : ''}`}>
                    {task.title}
                  </p>
                  {task.notes ? (
                    <p className="mt-0.5 text-sm text-[var(--ink-soft)]">{task.notes}</p>
                  ) : null}
                  {task.dueAt ? (
                    <p className="mt-1 text-xs font-medium text-[var(--accent-deep)]">
                      {formatTaskDue(task.dueAt)}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    onClick={() => onEdit(task)}
                    className="rounded-lg border border-[var(--line)] bg-white/70 p-2"
                    aria-label={`Editar ${task.title}`}
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(task.id, task.title)}
                    className="rounded-lg border border-[var(--line)] bg-white/70 p-2 text-red-700"
                    aria-label={`Eliminar ${task.title}`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
