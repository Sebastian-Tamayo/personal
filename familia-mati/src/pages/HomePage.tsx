import { Baby, CalendarDays, CheckCircle2, Circle, Home, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { AppShell } from '../components/AppShell'
import { PushOptIn } from '../components/PushOptIn'
import {
  DAILY_TASK_SUGGESTIONS,
  FAMILY_MEMBERS,
  KIND_COLORS,
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

type AgendaTab = 'hoy' | 'proximos'
type ParaAssignee = MemberKey | 'todos'

const HOUSEHOLD = FAMILY_MEMBERS.filter((m) => m.key === 'sebas' || m.key === 'lore' || m.key === 'hellen')

/** Default "Para" from the active filter chip (not hardcoded todos). */
function assigneeFromFilter(filter: MemberKey | 'todos'): ParaAssignee {
  if (filter === 'todos' || filter === 'sebas' || filter === 'lore' || filter === 'hellen') {
    return filter
  }
  // bebé chip has no Para option / push target → Todos
  return 'todos'
}

export function HomePage() {
  const user = useAuthStore((s) => s.user)!
  const profile = useAuthStore((s) => s.profile)
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

  const filterDefault = assigneeFromFilter(filterMember)

  // —— Tareas diarias form ——
  const [dailyTitle, setDailyTitle] = useState('')
  const [dailyNotes, setDailyNotes] = useState('')
  const [dailyAssignee, setDailyAssignee] = useState<ParaAssignee>(() =>
    assigneeFromFilter(useOrgStore.getState().filterMember),
  )
  const [dailyAssigneeTouched, setDailyAssigneeTouched] = useState(false)
  const [dailyEditing, setDailyEditing] = useState<OrgItem | null>(null)
  const [dailyBusy, setDailyBusy] = useState(false)

  // —— Agenda form ——
  const [agendaTitle, setAgendaTitle] = useState('')
  const [agendaNotes, setAgendaNotes] = useState('')
  const [agendaKind, setAgendaKind] = useState<ItemKind>('cita')
  const [agendaAssignee, setAgendaAssignee] = useState<ParaAssignee>(() =>
    assigneeFromFilter(useOrgStore.getState().filterMember),
  )
  const [agendaAssigneeTouched, setAgendaAssigneeTouched] = useState(false)
  const [agendaDate, setAgendaDate] = useState(todayISO())
  const [agendaTime, setAgendaTime] = useState('')
  const [agendaEditing, setAgendaEditing] = useState<OrgItem | null>(null)
  const [agendaBusy, setAgendaBusy] = useState(false)
  const [agendaTab, setAgendaTab] = useState<AgendaTab>('hoy')

  useEffect(() => subscribe(), [subscribe])

  // Align filter chip with active profile once (Sebas profile → Sebas chip → Para sebas).
  useEffect(() => {
    const key = profile?.memberKey
    if (key === 'sebas' || key === 'lore' || key === 'hellen') {
      if (useOrgStore.getState().filterMember === 'todos') {
        setFilterMember(key)
      }
    }
    // only when profile identity settles
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.memberKey, setFilterMember])

  // Keep create-form Para aligned with the active chip unless the user (or edit) set it explicitly.
  useEffect(() => {
    if (!dailyEditing && !dailyAssigneeTouched) {
      setDailyAssignee(filterDefault)
    }
    if (!agendaEditing && !agendaAssigneeTouched) {
      setAgendaAssignee(filterDefault)
    }
  }, [filterDefault, dailyEditing, dailyAssigneeTouched, agendaEditing, agendaAssigneeTouched])

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

  const diariasHoy = filtered.filter(
    (i) =>
      i.kind === 'chore' &&
      (i.date === today || !i.date || (i.date < today && i.status === 'pendiente')),
  )
  const agendaItems = filtered.filter((i) => i.kind === 'cita' || i.kind === 'tarea')
  const agendaHoy = agendaItems.filter(
    (i) => i.date === today || (!i.date && i.status === 'pendiente'),
  )
  const agendaProximos = agendaItems.filter((i) => i.date > today)
  const agendaList = agendaTab === 'hoy' ? agendaHoy : agendaProximos
  const baby = filtered.filter((i) => i.kind === 'bebe')

  const dailyDone = diariasHoy.filter((i) => i.status === 'hecha').length
  const dailyPending = diariasHoy.length - dailyDone

  function resetDaily() {
    setDailyTitle('')
    setDailyNotes('')
    setDailyAssignee(assigneeFromFilter(useOrgStore.getState().filterMember))
    setDailyAssigneeTouched(false)
    setDailyEditing(null)
  }

  function resetAgenda() {
    setAgendaTitle('')
    setAgendaNotes('')
    setAgendaKind('cita')
    setAgendaAssignee(assigneeFromFilter(useOrgStore.getState().filterMember))
    setAgendaAssigneeTouched(false)
    setAgendaDate(todayISO())
    setAgendaTime('')
    setAgendaEditing(null)
  }

  async function onSubmitDaily(e: FormEvent) {
    e.preventDefault()
    if (!dailyTitle.trim()) return
    setDailyBusy(true)
    try {
      if (dailyEditing) {
        await updateItem(dailyEditing.id, {
          title: dailyTitle,
          notes: dailyNotes,
          kind: 'chore',
          assignee: dailyAssignee,
          date: dailyEditing.date || todayISO(),
          time: dailyEditing.time || '',
          status: dailyEditing.status,
        })
      } else {
        const para = dailyAssigneeTouched ? dailyAssignee : filterDefault
        await addItem(
          {
            title: dailyTitle,
            notes: dailyNotes,
            kind: 'chore',
            assignee: para,
            date: todayISO(),
            time: '',
          },
          user.uid,
        )
      }
      resetDaily()
    } finally {
      setDailyBusy(false)
    }
  }

  async function quickAddDaily(label: string) {
    setDailyBusy(true)
    try {
      await addItem(
        {
          title: label,
          notes: '',
          kind: 'chore',
          assignee: assigneeFromFilter(useOrgStore.getState().filterMember),
          date: todayISO(),
          time: '',
        },
        user.uid,
      )
    } finally {
      setDailyBusy(false)
    }
  }

  async function onSubmitAgenda(e: FormEvent) {
    e.preventDefault()
    if (!agendaTitle.trim()) return
    if (agendaKind === 'chore' || agendaKind === 'bebe') return
    setAgendaBusy(true)
    try {
      if (agendaEditing) {
        await updateItem(agendaEditing.id, {
          title: agendaTitle,
          notes: agendaNotes,
          kind: agendaKind,
          assignee: agendaAssignee,
          date: agendaDate,
          time: agendaTime,
          status: agendaEditing.status,
        })
      } else {
        const para = agendaAssigneeTouched ? agendaAssignee : filterDefault
        await addItem(
          {
            title: agendaTitle,
            notes: agendaNotes,
            kind: agendaKind,
            assignee: para,
            date: agendaDate || todayISO(),
            time: agendaTime,
          },
          user.uid,
        )
      }
      resetAgenda()
    } finally {
      setAgendaBusy(false)
    }
  }

  function startEditDaily(item: OrgItem) {
    setDailyEditing(item)
    setDailyTitle(item.title)
    setDailyNotes(item.notes)
    setDailyAssignee(item.assignee === 'bebe' ? 'todos' : item.assignee)
    setDailyAssigneeTouched(true)
  }

  function startEditAgenda(item: OrgItem) {
    setAgendaEditing(item)
    setAgendaTitle(item.title)
    setAgendaNotes(item.notes)
    setAgendaKind(item.kind === 'tarea' ? 'tarea' : 'cita')
    setAgendaAssignee(item.assignee === 'bebe' ? 'todos' : item.assignee)
    setAgendaAssigneeTouched(true)
    setAgendaDate(item.date || todayISO())
    setAgendaTime(item.time)
  }

  return (
    <AppShell title="En casa hoy · citas y compromisos">
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

      <PushOptIn />

      {/* ========== 1. TAREAS DIARIAS (primary, first) ========== */}
      <section className="overflow-hidden rounded-3xl border-2 border-[#ca8a04]/45 bg-gradient-to-br from-[#fef9c3] via-[#fef08a]/70 to-[#fde68a]/40 shadow-[var(--shadow)]">
        <div className="border-b border-[#ca8a04]/25 bg-[#ca8a04]/15 px-4 py-3">
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-[#854d0e]">
            <Home className="size-5" aria-hidden />
            Tareas diarias · En casa
          </h2>
          <p className="mt-0.5 text-xs font-semibold text-[#a16207]">
            Barrer, aspirar, comida… para Sebas, Lore y Hellen · {dailyPending} pendientes ·{' '}
            {dailyDone} hechas
          </p>
        </div>

        <div className="space-y-3 p-4">
          {!dailyEditing ? (
            <div className="flex flex-wrap gap-1.5">
              {DAILY_TASK_SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={dailyBusy}
                  onClick={() => void quickAddDaily(s)}
                  className="rounded-full border border-[#ca8a04]/50 bg-white/85 px-2.5 py-1 text-xs font-bold text-[#854d0e] disabled:opacity-50"
                >
                  + {s}
                </button>
              ))}
            </div>
          ) : null}

          <form className="grid gap-2 rounded-2xl border border-[#ca8a04]/30 bg-white/75 p-3" onSubmit={onSubmitDaily}>
            <p className="text-sm font-extrabold text-[#854d0e]">
              {dailyEditing ? 'Editar tarea diaria' : 'Nueva tarea diaria'}
            </p>
            <input
              required
              value={dailyTitle}
              onChange={(e) => setDailyTitle(e.target.value)}
              placeholder="Ej. Barrer el salón"
              className="rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 outline-none ring-[#ca8a04] focus:ring-2"
            />
            <textarea
              value={dailyNotes}
              onChange={(e) => setDailyNotes(e.target.value)}
              placeholder="Notas (opcional)"
              rows={2}
              className="resize-none rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 outline-none ring-[#ca8a04] focus:ring-2"
            />
            <label className="text-sm">
              <span className="mb-1 block font-bold text-[var(--ink-soft)]">Para</span>
              <select
                value={dailyAssignee}
                onChange={(e) => {
                  setDailyAssigneeTouched(true)
                  setDailyAssignee(e.target.value as ParaAssignee)
                }}
                className="w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5"
              >
                <option value="todos">Todos</option>
                {HOUSEHOLD.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={dailyBusy}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#ca8a04] px-3 py-2.5 text-sm font-extrabold text-white disabled:opacity-60"
              >
                {dailyEditing ? <Pencil className="size-4" /> : <Plus className="size-4" />}
                {dailyEditing ? 'Guardar' : 'Añadir'}
              </button>
              {dailyEditing ? (
                <button
                  type="button"
                  onClick={resetDaily}
                  className="rounded-xl border border-[var(--line)] bg-white px-3"
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </div>
          </form>

          <div>
            <h3 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-[#854d0e]">
              En casa hoy
            </h3>
            {loading ? (
              <p className="text-sm text-[var(--ink-soft)]">Cargando…</p>
            ) : diariasHoy.length === 0 ? (
              <p className="text-sm text-[var(--ink-soft)]">
                Nada en casa todavía. Usa una sugerencia o añade una tarea.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {diariasHoy.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    emphasizeDaily
                    onToggle={() =>
                      void setStatus(item.id, item.status === 'hecha' ? 'pendiente' : 'hecha')
                    }
                    onEdit={() => startEditDaily(item)}
                    onDelete={() => {
                      if (confirm(`¿Eliminar «${item.title}»?`)) void deleteItem(item.id)
                    }}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* ========== 2. AGENDA (citas / compromisos) — separate ========== */}
      <section className="overflow-hidden rounded-3xl border-2 border-[#0f766e]/30 bg-gradient-to-br from-[#f0fdfa] to-[#ccfbf1]/40 shadow-[var(--shadow)]">
        <div className="border-b border-[#0f766e]/20 bg-[#0f766e]/10 px-4 py-3">
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-[#0f766e]">
            <CalendarDays className="size-5" aria-hidden />
            Agenda · citas y compromisos
          </h2>
          <p className="mt-0.5 text-xs font-semibold text-[#0f766e]/80">
            Entrenar, recoger al bebé, deberes puntuales… no son tareas de casa.
          </p>
        </div>

        <div className="space-y-3 p-4">
          <div className="flex gap-2 rounded-xl bg-[#0f766e]/10 p-1">
            {(
              [
                ['hoy', 'Hoy'],
                ['proximos', 'Próximos'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setAgendaTab(id)}
                className={`flex-1 rounded-lg px-2 py-2 text-sm font-extrabold ${
                  agendaTab === id
                    ? 'bg-white text-[#0f766e] shadow-sm'
                    : 'text-[#0f766e]/70'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <form
            className="grid gap-2 rounded-2xl border border-[#0f766e]/20 bg-white/80 p-3"
            onSubmit={onSubmitAgenda}
          >
            <p className="text-sm font-extrabold text-[#0f766e]">
              {agendaEditing ? 'Editar compromiso' : 'Nuevo en la agenda'}
            </p>
            <input
              required
              value={agendaTitle}
              onChange={(e) => setAgendaTitle(e.target.value)}
              placeholder="Ej. Ir a entrenar · Recoger al bebé"
              className="rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 outline-none ring-[#0f766e] focus:ring-2"
            />
            <textarea
              value={agendaNotes}
              onChange={(e) => setAgendaNotes(e.target.value)}
              placeholder="Notas (opcional)"
              rows={2}
              className="resize-none rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 outline-none ring-[#0f766e] focus:ring-2"
            />
            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm">
                <span className="mb-1 block font-bold text-[var(--ink-soft)]">Tipo</span>
                <select
                  value={agendaKind}
                  onChange={(e) => setAgendaKind(e.target.value as ItemKind)}
                  className="w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5"
                >
                  <option value="cita">Cita</option>
                  <option value="tarea">Deber / puntual</option>
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-bold text-[var(--ink-soft)]">Para</span>
                <select
                  value={agendaAssignee}
                  onChange={(e) => {
                    setAgendaAssigneeTouched(true)
                    setAgendaAssignee(e.target.value as ParaAssignee)
                  }}
                  className="w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5"
                >
                  <option value="todos">Todos</option>
                  {HOUSEHOLD.map((m) => (
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
                  value={agendaDate}
                  onChange={(e) => setAgendaDate(e.target.value)}
                  className="w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-bold text-[var(--ink-soft)]">Hora</span>
                <input
                  type="time"
                  value={agendaTime}
                  onChange={(e) => setAgendaTime(e.target.value)}
                  className="w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5"
                />
              </label>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={agendaBusy}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#0f766e] px-3 py-2.5 text-sm font-extrabold text-white disabled:opacity-60"
              >
                {agendaEditing ? <Pencil className="size-4" /> : <Plus className="size-4" />}
                {agendaEditing ? 'Guardar' : 'Añadir a agenda'}
              </button>
              {agendaEditing ? (
                <button
                  type="button"
                  onClick={resetAgenda}
                  className="rounded-xl border border-[var(--line)] bg-white px-3"
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </div>
          </form>

          <div>
            <h3 className="mb-2 text-sm font-extrabold text-[#0f766e]">
              {agendaTab === 'hoy' ? 'Hoy en la agenda' : 'Próximos días'}
            </h3>
            {loading ? (
              <p className="text-sm text-[var(--ink-soft)]">Cargando…</p>
            ) : agendaList.length === 0 ? (
              <p className="text-sm text-[var(--ink-soft)]">Nada aquí. Añade una cita o compromiso.</p>
            ) : (
              <ul className="divide-y divide-[#0f766e]/15 rounded-2xl border border-[#0f766e]/15 bg-white/70">
                {agendaList.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    onToggle={() =>
                      void setStatus(item.id, item.status === 'hecha' ? 'pendiente' : 'hecha')
                    }
                    onEdit={() => startEditAgenda(item)}
                    onDelete={() => {
                      if (confirm(`¿Eliminar «${item.title}»?`)) void deleteItem(item.id)
                    }}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {isAdult() ? (
        <section className="rounded-2xl border border-[var(--line)] bg-[#ffedd5]/70 p-4 shadow-[var(--shadow)]">
          <h2 className="mb-1 flex items-center gap-2 text-lg font-bold text-[#c2410c]">
            <Baby className="size-5" />
            Cuidados del bebé
          </h2>
          <p className="mb-3 text-xs text-[var(--ink-soft)]">
            Solo adultos. Notas ligeras — sin cuenta para el bebé. Para «recoger al bebé» usa la
            Agenda (cita).
          </p>
          {baby.length === 0 ? (
            <p className="text-sm text-[var(--ink-soft)]">Sin notas de cuidados por ahora.</p>
          ) : (
            <ul className="divide-y divide-[var(--line)]">
              {baby.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  onToggle={() =>
                    void setStatus(item.id, item.status === 'hecha' ? 'pendiente' : 'hecha')
                  }
                  onEdit={() => undefined}
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
  emphasizeDaily,
}: {
  item: OrgItem
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
  emphasizeDaily?: boolean
}) {
  const member = item.assignee === 'todos' ? null : memberByKey(item.assignee)
  const color = member?.color || '#ea580c'
  const soft = member?.colorSoft || '#ffedd5'
  const kindStyle = KIND_COLORS[item.kind]
  const done = item.status === 'hecha'

  return (
    <li
      className={`flex items-start gap-2 rounded-xl px-2 py-3 ${emphasizeDaily ? 'border border-[#fde68a] bg-white/80 shadow-sm' : 'px-3'}`}
      style={{
        borderLeft: `4px solid ${color}`,
        background: emphasizeDaily
          ? done
            ? '#fffbeb'
            : undefined
          : done
            ? 'transparent'
            : `${soft}66`,
      }}
    >
      <button type="button" onClick={onToggle} className="mt-0.5 p-1" style={{ color }} aria-label="Marcar">
        {done ? <CheckCircle2 className="size-5" /> : <Circle className="size-5" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className={`font-bold ${done ? 'line-through opacity-60' : ''}`}>{item.title}</p>
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase"
            style={{ background: kindStyle.soft, color: kindStyle.color }}
          >
            {kindLabel(item.kind)}
          </span>
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-extrabold"
            style={{ background: soft, color }}
          >
            {member ? `${member.emoji} ${member.name}` : '👥 Todos'}
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
