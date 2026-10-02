import { Baby, CheckCircle2, Circle, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { AppShell } from '../components/AppShell'
import {
  FAMILY_MEMBERS,
  formatDateLabel,
  kindLabel,
  memberByKey,
  todayISO,
  type ItemKind,
  type MemberKey,
  type OrgItem,
} from '../lib/family'
import { useAuthStore } from '../store/authStore'
import { useOrgStore } from '../store/orgStore'

export function HomePage() {
  const user = useAuthStore((s) => s.user)!
  const isAdult = useAuthStore((s) => s.isAdult)
  const items = useOrgStore((s) => s.items)
  const loading = useOrgStore((s) => s.loading)
  const syncError = useOrgStore((s) => s.syncError)
  const filterMember = useOrgStore((s) => s.filterMember)
  const setFilterMember = useOrgStore((s) => s.setFilterMember)
  const subscribe = useOrgStore((s) => s.subscribe)
  const addItem = useOrgStore((s) => s.addItem)
  const updateItem = useOrgStore((s) => s.updateItem)
  const setStatus = useOrgStore((s) => s.setStatus)
  const deleteItem = useOrgStore((s) => s.deleteItem)

  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [kind, setKind] = useState<ItemKind>('tarea')
  const [assignee, setAssignee] = useState<MemberKey | 'todos'>('todos')
  const [date, setDate] = useState(todayISO())
  const [time, setTime] = useState('')
  const [editing, setEditing] = useState<OrgItem | null>(null)
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<'hoy' | 'proximos' | 'chores'>('hoy')

  useEffect(() => subscribe(), [subscribe])

  const today = todayISO()
  const filtered = useMemo(() => {
    return items.filter((i) => {
      if (filterMember !== 'todos' && i.assignee !== filterMember && i.assignee !== 'todos') {
        return false
      }
      if (!isAdult() && i.kind === 'bebe') return false
      return true
    })
  }, [items, filterMember, isAdult])

  const hoy = filtered.filter((i) => i.date === today || (!i.date && i.status === 'pendiente'))
  const proximos = filtered.filter((i) => i.date > today)
  const chores = filtered.filter((i) => i.kind === 'chore')
  const baby = filtered.filter((i) => i.kind === 'bebe')

  const list =
    tab === 'hoy' ? hoy : tab === 'proximos' ? proximos : chores

  function reset() {
    setTitle('')
    setNotes('')
    setKind('tarea')
    setAssignee('todos')
    setDate(todayISO())
    setTime('')
    setEditing(null)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    if (!isAdult() && kind === 'bebe') return
    setBusy(true)
    try {
      if (editing) {
        await updateItem(editing.id, {
          title,
          notes,
          kind,
          assignee,
          date,
          time,
          status: editing.status,
        })
      } else {
        await addItem({ title, notes, kind, assignee, date, time }, user.uid)
      }
      reset()
    } finally {
      setBusy(false)
    }
  }

  function startEdit(item: OrgItem) {
    setEditing(item)
    setTitle(item.title)
    setNotes(item.notes)
    setKind(item.kind)
    setAssignee(item.assignee)
    setDate(item.date || todayISO())
    setTime(item.time)
  }

  return (
    <AppShell title="Hoy, chores y cuidados · en color">
      {/* Profiles */}
      <section className="animate-rise flex gap-2 overflow-x-auto pb-1">
        <FilterChip
          active={filterMember === 'todos'}
          label="Todos"
          color="#431407"
          soft="#fff7ed"
          onClick={() => setFilterMember('todos')}
        />
        {FAMILY_MEMBERS.map((m) => (
          <FilterChip
            key={m.key}
            active={filterMember === m.key}
            label={`${m.emoji} ${m.name}`}
            color={m.color}
            soft={m.colorSoft}
            onClick={() => setFilterMember(m.key)}
            muted={!m.canLogin}
          />
        ))}
      </section>

      {syncError ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800" role="alert">
          {syncError}
        </p>
      ) : null}

      {/* Tabs */}
      <div className="flex gap-2 rounded-xl bg-black/5 p-1">
        {(
          [
            ['hoy', 'Hoy'],
            ['proximos', 'Próximos'],
            ['chores', 'Chores'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex-1 rounded-lg px-2 py-2 text-sm font-extrabold ${
              tab === id ? 'bg-white text-[var(--accent-deep)] shadow-sm' : 'text-[var(--ink-soft)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Form */}
      <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow)]">
        <h2 className="mb-3 text-lg font-bold">{editing ? 'Editar' : 'Nuevo pendiente'}</h2>
        <form className="grid gap-2" onSubmit={onSubmit}>
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título"
            className="rounded-xl border border-[var(--line)] bg-white/90 px-3 py-2.5 outline-none ring-[var(--accent)] focus:ring-2"
          />
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notas (opcional)"
            rows={2}
            className="resize-none rounded-xl border border-[var(--line)] bg-white/90 px-3 py-2.5 outline-none ring-[var(--accent)] focus:ring-2"
          />
          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm">
              <span className="mb-1 block font-bold text-[var(--ink-soft)]">Tipo</span>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as ItemKind)}
                className="w-full rounded-xl border border-[var(--line)] bg-white/90 px-3 py-2.5"
              >
                <option value="tarea">Tarea</option>
                <option value="cita">Cita</option>
                <option value="chore">Chore</option>
                {isAdult() ? <option value="bebe">Bebé</option> : null}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-bold text-[var(--ink-soft)]">Para</span>
              <select
                value={assignee}
                onChange={(e) => setAssignee(e.target.value as MemberKey | 'todos')}
                className="w-full rounded-xl border border-[var(--line)] bg-white/90 px-3 py-2.5"
              >
                <option value="todos">Todos</option>
                {FAMILY_MEMBERS.filter((m) => m.key !== 'bebe' || isAdult()).map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm">
              <span className="mb-1 block font-bold text-[var(--ink-soft)]">Fecha</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-xl border border-[var(--line)] bg-white/90 px-3 py-2.5"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-bold text-[var(--ink-soft)]">Hora</span>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full rounded-xl border border-[var(--line)] bg-white/90 px-3 py-2.5"
              />
            </label>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[var(--accent)] px-3 py-2.5 text-sm font-extrabold text-white disabled:opacity-60"
            >
              {editing ? <Pencil className="size-4" /> : <Plus className="size-4" />}
              {editing ? 'Guardar' : 'Añadir'}
            </button>
            {editing ? (
              <button type="button" onClick={reset} className="rounded-xl border border-[var(--line)] bg-white px-3">
                <X className="size-4" />
              </button>
            ) : null}
          </div>
        </form>
      </section>

      {/* List */}
      <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow)]">
        <h2 className="mb-3 text-lg font-bold">
          {tab === 'hoy' ? 'Agenda de hoy' : tab === 'proximos' ? 'Próximos días' : 'Chores'}
        </h2>
        {loading ? (
          <p className="text-sm text-[var(--ink-soft)]">Cargando…</p>
        ) : list.length === 0 ? (
          <p className="text-sm text-[var(--ink-soft)]">Nada por aquí. ¡Añade algo!</p>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {list.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                onToggle={() => void setStatus(item.id, item.status === 'hecha' ? 'pendiente' : 'hecha')}
                onEdit={() => startEdit(item)}
                onDelete={() => {
                  if (confirm(`¿Eliminar «${item.title}»?`)) void deleteItem(item.id)
                }}
              />
            ))}
          </ul>
        )}
      </section>

      {isAdult() ? (
        <section className="rounded-2xl border border-[var(--line)] bg-[#ffedd5]/70 p-4 shadow-[var(--shadow)]">
          <h2 className="mb-1 flex items-center gap-2 text-lg font-bold text-[#c2410c]">
            <Baby className="size-5" />
            Cuidados del bebé
          </h2>
          <p className="mb-3 text-xs text-[var(--ink-soft)]">
            Solo adultos. Citas, tomas o recordatorios ligeros — sin cuenta para el bebé.
          </p>
          {baby.length === 0 ? (
            <p className="text-sm text-[var(--ink-soft)]">
              Usa tipo «Bebé» al crear un pendiente para que aparezca aquí.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--line)]">
              {baby.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  onToggle={() =>
                    void setStatus(item.id, item.status === 'hecha' ? 'pendiente' : 'hecha')
                  }
                  onEdit={() => startEdit(item)}
                  onDelete={() => {
                    if (confirm(`¿Eliminar «${item.title}»?`)) void deleteItem(item.id)
                  }}
                />
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </AppShell>
  )
}

function FilterChip({
  active,
  label,
  color,
  soft,
  onClick,
  muted,
}: {
  active: boolean
  label: string
  color: string
  soft: string
  onClick: () => void
  muted?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-extrabold transition ${
        muted && !active ? 'opacity-80' : ''
      }`}
      style={
        active
          ? { background: soft, color, boxShadow: `0 0 0 2px ${color}` }
          : { background: 'rgba(255,255,255,0.7)', color: '#9a3412' }
      }
    >
      {label}
    </button>
  )
}

function ItemRow({
  item,
  onToggle,
  onEdit,
  onDelete,
}: {
  item: OrgItem
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const member = item.assignee === 'todos' ? null : memberByKey(item.assignee)
  const color = member?.color || '#ea580c'
  const soft = member?.colorSoft || '#ffedd5'
  const done = item.status === 'hecha'

  return (
    <li className="flex items-start gap-2 py-3">
      <button type="button" onClick={onToggle} className="mt-0.5 p-1" style={{ color }} aria-label="Toggle">
        {done ? <CheckCircle2 className="size-5" /> : <Circle className="size-5" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className={`font-bold ${done ? 'line-through opacity-60' : ''}`}>{item.title}</p>
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase"
            style={{ background: soft, color }}
          >
            {kindLabel(item.kind)}
          </span>
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-extrabold"
            style={{ background: soft, color }}
          >
            {member ? `${member.emoji} ${member.name}` : 'Todos'}
          </span>
        </div>
        {item.notes ? <p className="mt-0.5 text-sm text-[var(--ink-soft)]">{item.notes}</p> : null}
        <p className="mt-1 text-xs font-bold" style={{ color }}>
          {item.date ? formatDateLabel(item.date) : 'Sin fecha'}
          {item.time ? ` · ${item.time}` : ''}
        </p>
      </div>
      <div className="flex gap-1">
        <button type="button" onClick={onEdit} className="rounded-lg border border-[var(--line)] bg-white/80 p-2">
          <Pencil className="size-4" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-lg border border-[var(--line)] bg-white/80 p-2 text-red-700"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
    </li>
  )
}
