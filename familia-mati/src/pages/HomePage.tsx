import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Home,
  Pencil,
  Plus,
  Repeat,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { AppShell } from '../components/AppShell'
import { Capybara, EmptyCapybara } from '../components/Capybara'
import { PushOptIn } from '../components/PushOptIn'
import {
  DAILY_TASK_SUGGESTIONS,
  FAMILY_MEMBERS,
  KIND_COLORS,
  ROUTINE_SUGGESTIONS,
  cadenceLabel,
  formatDateLabel,
  kindLabel,
  memberByKey,
  normalizeMemberKey,
  shiftISODate,
  todayISO,
  type FamiliaRoutine,
  type ItemKind,
  type OrgItem,
  type PersonaKey,
  type RoutineCadence,
} from '../lib/family'
import { useAuthStore } from '../store/authStore'
import { useOrgStore } from '../store/orgStore'
import { useRoutinesStore } from '../store/routinesStore'

type AgendaTab = 'hoy' | 'proximos' | 'pasados'
type ParaAssignee = 'sebas' | 'lore' | 'hellen' | 'todos'
/** Todos = ver todo el hogar; persona = esa persona + compartidos. */
type ViewFilter = ParaAssignee

const HOUSEHOLD = FAMILY_MEMBERS.filter((m) => m.key === 'sebas' || m.key === 'lore' || m.key === 'hellen')

function asPersona(key: string | null | undefined): PersonaKey | null {
  const n = normalizeMemberKey(key)
  return n === 'sebas' || n === 'lore' || n === 'hellen' ? n : null
}

export function HomePage() {
  const user = useAuthStore((s) => s.user)!
  const profile = useAuthStore((s) => s.profile)
  const items = useOrgStore((s) => s.items)
  const loading = useOrgStore((s) => s.loading)
  const syncError = useOrgStore((s) => s.syncError)
  const subscribe = useOrgStore((s) => s.subscribe)
  const addItem = useOrgStore((s) => s.addItem)
  const updateItem = useOrgStore((s) => s.updateItem)
  const setStatus = useOrgStore((s) => s.setStatus)
  const deleteItem = useOrgStore((s) => s.deleteItem)

  const myKey = asPersona(profile?.memberKey) || 'sebas'

  const [viewFilter, setViewFilter] = useState<ViewFilter>('todos')

  const [showDailyForm, setShowDailyForm] = useState(false)
  const [dailyTitle, setDailyTitle] = useState('')
  const [dailyNotes, setDailyNotes] = useState('')
  const [dailyAssignee, setDailyAssignee] = useState<ParaAssignee>(myKey)
  const [dailyDate, setDailyDate] = useState(todayISO())
  const [dailyEditing, setDailyEditing] = useState<OrgItem | null>(null)
  const [dailyBusy, setDailyBusy] = useState(false)

  const [showAgendaForm, setShowAgendaForm] = useState(false)
  const [agendaTitle, setAgendaTitle] = useState('')
  const [agendaNotes, setAgendaNotes] = useState('')
  const [agendaKind, setAgendaKind] = useState<ItemKind>('cita')
  const [agendaAssignee, setAgendaAssignee] = useState<ParaAssignee>(myKey)
  const [agendaDate, setAgendaDate] = useState(todayISO())
  const [agendaTime, setAgendaTime] = useState('')
  const [agendaEditing, setAgendaEditing] = useState<OrgItem | null>(null)
  const [agendaBusy, setAgendaBusy] = useState(false)
  const [agendaTab, setAgendaTab] = useState<AgendaTab>('hoy')

  const routines = useRoutinesStore((s) => s.routines)
  const digestTime = useRoutinesStore((s) => s.digestTime)
  const routinesLoading = useRoutinesStore((s) => s.loading)
  const routinesSyncError = useRoutinesStore((s) => s.syncError)
  const subscribeRoutines = useRoutinesStore((s) => s.subscribe)
  const setDigestTime = useRoutinesStore((s) => s.setDigestTime)
  const addRoutine = useRoutinesStore((s) => s.addRoutine)
  const updateRoutine = useRoutinesStore((s) => s.updateRoutine)
  const deleteRoutine = useRoutinesStore((s) => s.deleteRoutine)

  const [showRoutineForm, setShowRoutineForm] = useState(false)
  const [routineTitle, setRoutineTitle] = useState('')
  const [routineNotes, setRoutineNotes] = useState('')
  const [routineCadence, setRoutineCadence] = useState<RoutineCadence>('semanal')
  const [routineEditing, setRoutineEditing] = useState<FamiliaRoutine | null>(null)
  const [routineBusy, setRoutineBusy] = useState(false)
  const [digestBusy, setDigestBusy] = useState(false)

  useEffect(() => subscribe(), [subscribe])
  useEffect(() => subscribeRoutines(), [subscribeRoutines])

  useEffect(() => {
    const defaultPara: ParaAssignee = viewFilter === 'todos' ? myKey : viewFilter
    if (!showDailyForm && !dailyEditing) setDailyAssignee(defaultPara)
    if (!showAgendaForm && !agendaEditing) setAgendaAssignee(defaultPara)
  }, [myKey, viewFilter, showDailyForm, showAgendaForm, dailyEditing, agendaEditing])

  const today = todayISO()

  /** Everyone always sees all household items; chips only set default «Para». */
  const visibleItems = useMemo(() => items.filter((i) => i.kind !== 'bebe'), [items])

  const diariasHoy = visibleItems.filter(
    (i) =>
      i.kind === 'chore' &&
      (i.date === today || !i.date || (i.date < today && i.status === 'pendiente')),
  )
  const agendaItems = visibleItems.filter((i) => i.kind === 'cita' || i.kind === 'tarea')
  const agendaHoy = agendaItems.filter(
    (i) => i.date === today || (!i.date && i.status === 'pendiente'),
  )
  const agendaProximos = agendaItems.filter((i) => i.date > today)
  const agendaPasados = agendaItems.filter((i) => !!i.date && i.date < today)
  const agendaList =
    agendaTab === 'hoy' ? agendaHoy : agendaTab === 'proximos' ? agendaProximos : agendaPasados

  const dailyPending = diariasHoy.filter((i) => i.status === 'pendiente').length
  const dailyDone = diariasHoy.filter((i) => i.status === 'hecha').length
  const agendaPending = agendaHoy.filter((i) => i.status === 'pendiente').length

  function closeDailyForm() {
    setDailyTitle('')
    setDailyNotes('')
    setDailyAssignee(myKey)
    setDailyDate(todayISO())
    setDailyEditing(null)
    setShowDailyForm(false)
  }

  function closeAgendaForm() {
    setAgendaTitle('')
    setAgendaNotes('')
    setAgendaKind('cita')
    setAgendaAssignee(myKey)
    setAgendaDate(todayISO())
    setAgendaTime('')
    setAgendaEditing(null)
    setShowAgendaForm(false)
  }

  function closeRoutineForm() {
    setRoutineTitle('')
    setRoutineNotes('')
    setRoutineCadence('semanal')
    setRoutineEditing(null)
    setShowRoutineForm(false)
  }

  function openNewDaily() {
    setDailyEditing(null)
    setDailyTitle('')
    setDailyNotes('')
    setDailyAssignee(myKey)
    setDailyDate(todayISO())
    setShowDailyForm(true)
    setShowAgendaForm(false)
    setShowRoutineForm(false)
    setRoutineEditing(null)
  }

  function openNewAgenda() {
    setAgendaEditing(null)
    setAgendaTitle('')
    setAgendaNotes('')
    setAgendaKind('cita')
    setAgendaAssignee(myKey)
    setAgendaDate(todayISO())
    setAgendaTime('')
    setShowAgendaForm(true)
    setShowDailyForm(false)
    setShowRoutineForm(false)
    setRoutineEditing(null)
  }

  function openNewRoutine() {
    setRoutineEditing(null)
    setRoutineTitle('')
    setRoutineNotes('')
    setRoutineCadence('semanal')
    setShowRoutineForm(true)
    setShowDailyForm(false)
    setShowAgendaForm(false)
    setDailyEditing(null)
    setAgendaEditing(null)
  }

  async function onSubmitDaily(e: FormEvent) {
    e.preventDefault()
    if (!dailyTitle.trim()) return
    setDailyBusy(true)
    try {
      const date = dailyDate || todayISO()
      if (dailyEditing) {
        await updateItem(dailyEditing.id, {
          title: dailyTitle,
          notes: dailyNotes,
          kind: 'chore',
          assignee: dailyAssignee,
          date,
          time: dailyEditing.time || '',
          status: dailyEditing.status,
        })
      } else {
        await addItem(
          {
            title: dailyTitle,
            notes: dailyNotes,
            kind: 'chore',
            assignee: dailyAssignee,
            date,
            time: '',
          },
          user.uid,
        )
      }
      closeDailyForm()
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
          assignee: myKey,
          date: dailyDate || todayISO(),
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
        // Time is immutable after create — changing it would skip a fresh push aviso.
        await updateItem(agendaEditing.id, {
          title: agendaTitle,
          notes: agendaNotes,
          kind: agendaKind,
          assignee: agendaAssignee,
          date: agendaDate,
          time: agendaEditing.time,
          status: agendaEditing.status,
        })
      } else {
        await addItem(
          {
            title: agendaTitle,
            notes: agendaNotes,
            kind: agendaKind,
            assignee: agendaAssignee,
            date: agendaDate || todayISO(),
            time: agendaTime,
          },
          user.uid,
        )
      }
      closeAgendaForm()
    } finally {
      setAgendaBusy(false)
    }
  }

  async function onSubmitRoutine(e: FormEvent) {
    e.preventDefault()
    if (!routineTitle.trim()) return
    setRoutineBusy(true)
    try {
      if (routineEditing) {
        await updateRoutine(routineEditing.id, {
          title: routineTitle,
          notes: routineNotes,
          cadence: routineCadence,
          active: true,
        })
      } else {
        await addRoutine(
          {
            title: routineTitle,
            notes: routineNotes,
            cadence: routineCadence,
          },
          user.uid,
        )
      }
      closeRoutineForm()
    } finally {
      setRoutineBusy(false)
    }
  }

  function startEditDaily(item: OrgItem) {
    setDailyEditing(item)
    setDailyTitle(item.title)
    setDailyNotes(item.notes)
    setDailyAssignee(
      item.assignee === 'sebas' || item.assignee === 'lore' || item.assignee === 'hellen'
        ? item.assignee
        : 'todos',
    )
    setDailyDate(item.date || todayISO())
    setShowDailyForm(true)
    setShowAgendaForm(false)
    setShowRoutineForm(false)
    setRoutineEditing(null)
  }

  function startEditAgenda(item: OrgItem) {
    setAgendaEditing(item)
    setAgendaTitle(item.title)
    setAgendaNotes(item.notes)
    setAgendaKind(item.kind === 'tarea' ? 'tarea' : 'cita')
    setAgendaAssignee(
      item.assignee === 'sebas' || item.assignee === 'lore' || item.assignee === 'hellen'
        ? item.assignee
        : 'todos',
    )
    setAgendaDate(item.date || todayISO())
    setAgendaTime(item.time)
    setShowAgendaForm(true)
    setShowDailyForm(false)
    setShowRoutineForm(false)
    setRoutineEditing(null)
  }

  function startEditRoutine(item: FamiliaRoutine) {
    setRoutineEditing(item)
    setRoutineTitle(item.title)
    setRoutineNotes(item.notes)
    setRoutineCadence(item.cadence || 'semanal')
    setShowRoutineForm(true)
    setShowDailyForm(false)
    setShowAgendaForm(false)
    setDailyEditing(null)
    setAgendaEditing(null)
  }

  const dailyFormOpen = showDailyForm || !!dailyEditing
  const agendaFormOpen = showAgendaForm || !!agendaEditing
  const routineFormOpen = showRoutineForm || !!routineEditing

  return (
    <AppShell>
      <section
        className="animate-rise flex gap-2 overflow-x-auto pb-1"
        data-testid="filter-chips"
        aria-label="Para por defecto al crear (todos ven todas las listas)"
      >
        <FilterChip
          active={viewFilter === 'todos'}
          label="👥 Todos"
          color="#431407"
          soft="#fff7ed"
          onClick={() => setViewFilter('todos')}
        />
        {HOUSEHOLD.map((m) => (
          <FilterChip
            key={m.key}
            active={viewFilter === m.key}
            label={`${m.emoji} ${m.name}`}
            color={m.color}
            soft={m.colorSoft}
            onClick={() => setViewFilter(m.key as ParaAssignee)}
          />
        ))}
      </section>

      {/* Decorative capybara in the chip/actions gap */}
      <div className="pointer-events-none flex justify-end pr-1 opacity-80" aria-hidden>
        <Capybara variant="peek" className="h-10 w-auto" title="" />
      </div>

      {syncError || routinesSyncError ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800" role="alert">
          {syncError || routinesSyncError}
        </p>
      ) : null}

      <PushOptIn />

      <section className="animate-rise grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={openNewDaily}
          className="inline-flex items-center justify-center gap-1.5 rounded-2xl border-2 border-[#ca8a04]/50 bg-gradient-to-br from-[#fef9c3] to-[#fde68a] px-2 py-3 text-xs font-extrabold text-[#854d0e] shadow-sm sm:text-sm"
          data-testid="btn-nueva-tarea"
        >
          <Plus className="size-4 shrink-0" aria-hidden />
          Nueva tarea
        </button>
        <button
          type="button"
          onClick={openNewRoutine}
          className="inline-flex items-center justify-center gap-1.5 rounded-2xl border-2 border-[#0369a1]/40 bg-gradient-to-br from-[#e0f2fe] to-[#bae6fd] px-2 py-3 text-xs font-extrabold text-[#075985] shadow-sm sm:text-sm"
          data-testid="btn-nueva-rutina"
        >
          <Plus className="size-4 shrink-0" aria-hidden />
          Nueva rutina
        </button>
        <button
          type="button"
          onClick={openNewAgenda}
          className="inline-flex items-center justify-center gap-1.5 rounded-2xl border-2 border-[#0f766e]/40 bg-gradient-to-br from-[#f0fdfa] to-[#ccfbf1] px-2 py-3 text-xs font-extrabold text-[#0f766e] shadow-sm sm:text-sm"
          data-testid="btn-nueva-cita"
        >
          <Plus className="size-4 shrink-0" aria-hidden />
          Nueva cita
        </button>
      </section>

      {/* ========== TAREAS DIARIAS ========== */}
      <section className="overflow-hidden rounded-3xl border-2 border-[#ca8a04]/45 bg-gradient-to-br from-[#fef9c3] via-[#fef08a]/70 to-[#fde68a]/40 shadow-[var(--shadow)]">
        <div className="border-b border-[#ca8a04]/25 bg-[#ca8a04]/15 px-4 py-3">
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-[#854d0e]">
            <Home className="size-5" aria-hidden />
            Tareas diarias
          </h2>
          <p className="mt-0.5 text-xs font-semibold text-[#a16207]">
            {dailyPending} pendientes · {dailyDone} hechas · todos los perfiles
          </p>
        </div>

        <div className="space-y-3 p-4">
          {dailyFormOpen ? (
            <form
              className="grid gap-2 rounded-2xl border border-[#ca8a04]/30 bg-white/90 p-3"
              onSubmit={onSubmitDaily}
              data-testid="form-nueva-tarea"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-extrabold text-[#854d0e]">
                  {dailyEditing ? 'Editar tarea' : 'Nueva tarea diaria'}
                </p>
                <button
                  type="button"
                  onClick={closeDailyForm}
                  className="rounded-lg border border-[var(--line)] bg-white p-1.5"
                  aria-label="Cerrar"
                >
                  <X className="size-4" />
                </button>
              </div>
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
              <input
                required
                autoFocus
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
                  onChange={(e) => setDailyAssignee(e.target.value as ParaAssignee)}
                  className="w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5"
                >
                  <option value="todos">Todos</option>
                  {HOUSEHOLD.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.emoji} {m.name}
                    </option>
                  ))}
                </select>
              </label>
              <DateStepper
                label="Fecha"
                value={dailyDate}
                onChange={setDailyDate}
                accent="#ca8a04"
                testId="daily-date-stepper"
              />
              <button
                type="submit"
                disabled={dailyBusy}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#ca8a04] px-3 py-2.5 text-sm font-extrabold text-white disabled:opacity-60"
              >
                {dailyEditing ? <Pencil className="size-4" /> : <Plus className="size-4" />}
                {dailyEditing ? 'Guardar' : 'Añadir'}
              </button>
            </form>
          ) : null}

          {loading ? (
            <p className="text-sm text-[var(--ink-soft)]">Cargando…</p>
          ) : diariasHoy.length === 0 ? (
            <EmptyCapybara
              variant="sit"
              accent="warm"
              message={
                <>
                  Nada pendiente. Pulsa <span className="font-extrabold">Nueva tarea</span>.
                </>
              }
            />
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
      </section>

      {/* ========== RUTINAS (semanales / mensuales — no son tareas ni citas) ========== */}
      <section
        className="overflow-hidden rounded-3xl border-2 border-[#0369a1]/35 bg-gradient-to-br from-[#e0f2fe] via-[#bae6fd]/60 to-[#7dd3fc]/30 shadow-[var(--shadow)]"
        data-testid="section-rutinas"
      >
        <div className="border-b border-[#0369a1]/25 bg-[#0369a1]/12 px-4 py-3">
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-[#075985]">
            <Repeat className="size-5" aria-hidden />
            Rutinas semanales / mensuales
          </h2>
          <p className="mt-0.5 text-xs font-semibold text-[#0369a1]">
            Un solo aviso al día para todas las rutinas · visibles para todos
          </p>
        </div>

        <div className="space-y-3 p-4">
          <div
            className="rounded-2xl border border-[#0369a1]/25 bg-white/85 p-3"
            data-testid="routines-digest-time"
          >
            <label className="flex flex-wrap items-end gap-3">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-extrabold text-[#075985]">
                  Hora del aviso (compartida)
                </span>
                <span className="mt-0.5 block text-[11px] font-semibold leading-snug text-[#0369a1]">
                  Todas las rutinas usan esta misma alarma · Europe/Madrid · no afecta a la agenda
                </span>
              </span>
              <input
                type="time"
                value={digestTime}
                disabled={digestBusy}
                onChange={(e) => {
                  const next = e.target.value
                  if (!next) return
                  setDigestBusy(true)
                  void setDigestTime(next, user.uid).finally(() => setDigestBusy(false))
                }}
                className="rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 font-extrabold text-[#075985] outline-none ring-[#0369a1] focus:ring-2 disabled:opacity-60"
                data-testid="routines-digest-time-input"
              />
            </label>
          </div>

          {routineFormOpen ? (
            <form
              className="grid gap-2 rounded-2xl border border-[#0369a1]/25 bg-white/90 p-3"
              onSubmit={onSubmitRoutine}
              data-testid="form-nueva-rutina"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-extrabold text-[#075985]">
                  {routineEditing ? 'Editar rutina' : 'Nueva rutina'}
                </p>
                <button
                  type="button"
                  onClick={closeRoutineForm}
                  className="rounded-lg border border-[var(--line)] bg-white p-1.5"
                  aria-label="Cerrar"
                >
                  <X className="size-4" />
                </button>
              </div>
              {!routineEditing ? (
                <div className="flex flex-wrap gap-1.5">
                  {ROUTINE_SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={routineBusy}
                      onClick={() => setRoutineTitle(s)}
                      className="rounded-full border border-[#0369a1]/40 bg-white/85 px-2.5 py-1 text-xs font-bold text-[#075985] disabled:opacity-50"
                    >
                      + {s}
                    </button>
                  ))}
                </div>
              ) : null}
              <input
                required
                autoFocus
                value={routineTitle}
                onChange={(e) => setRoutineTitle(e.target.value)}
                placeholder="Ej. Revisar nevera · Pagar luz"
                className="rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 outline-none ring-[#0369a1] focus:ring-2"
              />
              <label className="text-sm">
                <span className="mb-1 block font-bold text-[var(--ink-soft)]">Cadencia</span>
                <select
                  value={routineCadence}
                  onChange={(e) => setRoutineCadence(e.target.value as RoutineCadence)}
                  className="w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5"
                  data-testid="routine-cadence"
                >
                  <option value="semanal">Semanal</option>
                  <option value="mensual">Mensual</option>
                  <option value="">Sin etiqueta</option>
                </select>
              </label>
              <textarea
                value={routineNotes}
                onChange={(e) => setRoutineNotes(e.target.value)}
                placeholder="Notas (opcional)"
                rows={2}
                className="resize-none rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 outline-none ring-[#0369a1] focus:ring-2"
              />
              <button
                type="submit"
                disabled={routineBusy}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#0369a1] px-3 py-2.5 text-sm font-extrabold text-white disabled:opacity-60"
              >
                {routineEditing ? <Pencil className="size-4" /> : <Plus className="size-4" />}
                {routineEditing ? 'Guardar' : 'Añadir rutina'}
              </button>
            </form>
          ) : null}

          {routinesLoading ? (
            <p className="text-sm text-[var(--ink-soft)]">Cargando…</p>
          ) : routines.length === 0 ? (
            <EmptyCapybara
              variant="leaf"
              accent="teal"
              message={
                <>
                  Sin rutinas aún. Pulsa <span className="font-extrabold">Nueva rutina</span>.
                </>
              }
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {routines.map((item) => {
                const cad = cadenceLabel(item.cadence)
                return (
                  <li
                    key={item.id}
                    className="flex items-start gap-2 rounded-xl border border-[#7dd3fc]/60 bg-white/85 px-3 py-3 shadow-sm"
                    style={{ borderLeft: '4px solid #0369a1' }}
                    data-testid="routine-row"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="font-bold text-[#075985]">{item.title}</p>
                        {cad ? (
                          <span className="rounded-full bg-[#e0f2fe] px-2 py-0.5 text-[10px] font-extrabold uppercase text-[#0369a1]">
                            {cad}
                          </span>
                        ) : null}
                      </div>
                      {item.notes ? (
                        <p className="mt-0.5 text-sm text-[var(--ink-soft)]">{item.notes}</p>
                      ) : null}
                    </div>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => startEditRoutine(item)}
                        className="rounded-lg border border-[var(--line)] bg-white/80 p-2"
                        aria-label={`Editar ${item.title}`}
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`¿Eliminar rutina «${item.title}»?`)) {
                            void deleteRoutine(item.id)
                          }
                        }}
                        className="rounded-lg border border-[var(--line)] bg-white/80 p-2 text-red-700"
                        aria-label={`Eliminar ${item.title}`}
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
      </section>

      {/* ========== AGENDA ========== */}
      <section className="overflow-hidden rounded-3xl border-2 border-[#0f766e]/30 bg-gradient-to-br from-[#f0fdfa] to-[#ccfbf1]/40 shadow-[var(--shadow)]">
        <div className="border-b border-[#0f766e]/20 bg-[#0f766e]/10 px-4 py-3">
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-[#0f766e]">
            <CalendarDays className="size-5" aria-hidden />
            Agenda
          </h2>
          <p className="mt-0.5 text-xs font-semibold text-[#0f766e]/80">
            {agendaPending} pendientes hoy · avisos con la antelación que elijas
          </p>
        </div>

        <div className="space-y-3 p-4">
          <div className="flex gap-1 rounded-xl bg-[#0f766e]/10 p-1">
            {(
              [
                ['hoy', 'Hoy'],
                ['proximos', 'Próximos'],
                ['pasados', 'Pasados'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setAgendaTab(id)}
                className={`flex-1 rounded-lg px-2 py-2 text-xs font-extrabold sm:text-sm ${
                  agendaTab === id ? 'bg-white text-[#0f766e] shadow-sm' : 'text-[#0f766e]/70'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {agendaFormOpen ? (
            <form
              className="grid gap-2 rounded-2xl border border-[#0f766e]/20 bg-white/90 p-3"
              onSubmit={onSubmitAgenda}
              data-testid="form-nueva-cita"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-extrabold text-[#0f766e]">
                  {agendaEditing ? 'Editar cita' : 'Nueva cita / compromiso'}
                </p>
                <button
                  type="button"
                  onClick={closeAgendaForm}
                  className="rounded-lg border border-[var(--line)] bg-white p-1.5"
                  aria-label="Cerrar"
                >
                  <X className="size-4" />
                </button>
              </div>
              <input
                required
                autoFocus
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
                    onChange={(e) => setAgendaAssignee(e.target.value as ParaAssignee)}
                    className="w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5"
                  >
                    <option value="todos">Todos</option>
                    {HOUSEHOLD.map((m) => (
                      <option key={m.key} value={m.key}>
                        {m.emoji} {m.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <DateStepper
                label="Fecha"
                value={agendaDate}
                onChange={setAgendaDate}
                accent="#0f766e"
                testId="agenda-date-stepper"
              />
              {agendaEditing ? (
                <div className="text-sm" data-testid="agenda-time-locked">
                  <span className="mb-1 block font-bold text-[var(--ink-soft)]">Hora</span>
                  <p className="rounded-xl border border-dashed border-[#0f766e]/35 bg-[#f0fdfa] px-3 py-2.5 font-extrabold text-[#0f766e]">
                    {agendaEditing.time || '—'}
                  </p>
                  <p className="mt-1 text-[11px] font-semibold leading-snug text-[#0f766e]/75">
                    Para cambiar la hora, elimina y crea de nuevo
                  </p>
                </div>
              ) : (
                <label className="text-sm">
                  <span className="mb-1 block font-bold text-[var(--ink-soft)]">Hora</span>
                  <input
                    type="time"
                    value={agendaTime}
                    onChange={(e) => setAgendaTime(e.target.value)}
                    className="w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5"
                    data-testid="agenda-time-input"
                  />
                </label>
              )}
              <button
                type="submit"
                disabled={agendaBusy}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#0f766e] px-3 py-2.5 text-sm font-extrabold text-white disabled:opacity-60"
              >
                {agendaEditing ? <Pencil className="size-4" /> : <Plus className="size-4" />}
                {agendaEditing ? 'Guardar' : 'Añadir a agenda'}
              </button>
            </form>
          ) : null}

          {loading ? (
            <p className="text-sm text-[var(--ink-soft)]">Cargando…</p>
          ) : agendaList.length === 0 ? (
            <EmptyCapybara
              variant={agendaTab === 'pasados' ? 'leaf' : 'peek'}
              accent="teal"
              message={
                agendaTab === 'pasados' ? (
                  <>No hay citas pasadas en este filtro.</>
                ) : (
                  <>
                    Nada aquí. Pulsa <span className="font-extrabold">Nueva cita</span>.
                  </>
                )
              }
            />
          ) : (
            <ul className="divide-y divide-[#0f766e]/15 rounded-2xl border border-[#0f766e]/15 bg-white/70">
              {agendaList.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  emphasizeAssignee
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
      </section>
    </AppShell>
  )
}

/** Prev/next day switcher — previous goes into the past (no min=today). */
function DateStepper({
  label,
  value,
  onChange,
  accent,
  testId,
}: {
  label: string
  value: string
  onChange: (iso: string) => void
  accent: string
  testId: string
}) {
  return (
    <div className="text-sm" data-testid={testId}>
      <span className="mb-1 block font-bold text-[var(--ink-soft)]">{label}</span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onChange(shiftISODate(value || todayISO(), -1))}
          className="rounded-xl border border-[var(--line)] bg-white p-2.5 shadow-sm"
          aria-label="Día anterior"
          data-testid={`${testId}-prev`}
          style={{ color: accent }}
        >
          <ChevronLeft className="size-5" />
        </button>
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value || todayISO())}
          className="min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-white px-3 py-2.5"
          data-testid={`${testId}-input`}
        />
        <button
          type="button"
          onClick={() => onChange(shiftISODate(value || todayISO(), 1))}
          className="rounded-xl border border-[var(--line)] bg-white p-2.5 shadow-sm"
          aria-label="Día siguiente"
          data-testid={`${testId}-next`}
          style={{ color: accent }}
        >
          <ChevronRight className="size-5" />
        </button>
      </div>
      <p className="mt-1 text-xs font-semibold" style={{ color: accent }}>
        {formatDateLabel(value)} · puedes ir a días pasados
      </p>
    </div>
  )
}

function FilterChip({
  active,
  label,
  color,
  soft,
  onClick,
}: {
  active: boolean
  label: string
  color: string
  soft: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 rounded-full px-3 py-1.5 text-sm font-extrabold transition"
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

function assigneeLabel(assignee: OrgItem['assignee']): {
  key: string
  name: string
  emoji: string
  color: string
  soft: string
} {
  if (assignee === 'todos') {
    return { key: 'todos', name: 'Todos', emoji: '👥', color: '#ea580c', soft: '#ffedd5' }
  }
  const member = assignee === 'bebe' ? null : memberByKey(assignee)
  if (member) {
    return {
      key: member.key,
      name: member.name,
      emoji: member.emoji,
      color: member.color,
      soft: member.colorSoft,
    }
  }
  return { key: 'todos', name: 'Todos', emoji: '👥', color: '#ea580c', soft: '#ffedd5' }
}

function ItemRow({
  item,
  onToggle,
  onEdit,
  onDelete,
  emphasizeDaily,
  emphasizeAssignee,
}: {
  item: OrgItem
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
  emphasizeDaily?: boolean
  /** Larger «Para · Name» tag — used on agenda citas/compromisos. */
  emphasizeAssignee?: boolean
}) {
  const who = assigneeLabel(item.assignee)
  const color = who.color
  const soft = who.soft
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
            className={
              emphasizeAssignee
                ? 'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-extrabold shadow-sm ring-1 ring-black/5'
                : 'rounded-full px-2 py-0.5 text-[10px] font-extrabold'
            }
            style={{ background: soft, color }}
            data-testid="assignee-label"
            data-assignee={who.key}
            title={`Aviso para ${who.name}`}
          >
            {emphasizeAssignee ? (
              <>
                <span className="opacity-80">Para</span>
                <span aria-hidden>{who.emoji}</span>
                <span>{who.name}</span>
              </>
            ) : (
              `${who.emoji} ${who.name}`
            )}
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
