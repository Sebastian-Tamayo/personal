#!/usr/bin/env node
/**
 * Send Web Push for:
 * 1) Agenda · citas y compromisos ONLY (kinds: cita, tarea).
 *    NEVER notifies for Tareas diarias (kind: chore) or bebé items.
 *    Lead time is per-user/persona (familia_users.personaSettings / reminderLeadMinutes); default 120 min.
 * 2) Rutinas digest — ONE push/day to TODOS (all household push subs), listing active
 *    familia_routines titles. Clock from familia_settings/routinesDigest.time (HH:mm, default 16:00
 *    Europe/Madrid). Does NOT affect agenda/cita lead timing. Deduped via
 *    familia_routines_digest_sent/{YYYY-MM-DD}.
 *
 * Runs outside the browser (GitHub Actions cron / repository_dispatch). Mobile Web Push — not email.
 *
 * Required env (never commit):
 *   FIREBASE_SERVICE_ACCOUNT_JSON  — full service account JSON string
 *   VAPID_PUBLIC_KEY
 *   VAPID_PRIVATE_KEY
 * Optional:
 *   VAPID_SUBJECT=mailto:you@example.com
 *   REMINDER_TZ=Europe/Madrid
 *   REMINDER_WINDOW_MINUTES=45   — primary window after remindAt; catch-up continues until event
 *   ROUTINES_DIGEST_TIME=16:00   — fallback if Firestore setting missing
 *   ROUTINES_DIGEST_WINDOW_MINUTES=12  — fire if Madrid local ∈ [digestTime, digestTime+window)
 *   VAPID_KEYS_FILE=/path/to/secrets/vapid.json  (local fallback)
 */
import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const require = createRequire(import.meta.url)

const DEFAULT_LEAD_MINUTES = 120
const LEAD_PRESETS = [30, 60, 120, 180, 1440]
const MAX_LEAD_MINUTES = Math.max(...LEAD_PRESETS)

/** Snap to nearest preset so UI + cron stay aligned (legacy free-form → nearest). */
function normalizeLeadMinutes(raw) {
  const n = Math.round(Number(raw))
  if (!Number.isFinite(n)) return DEFAULT_LEAD_MINUTES
  if (LEAD_PRESETS.includes(n)) return n
  let best = DEFAULT_LEAD_MINUTES
  let bestDist = Number.POSITIVE_INFINITY
  for (const p of LEAD_PRESETS) {
    const d = Math.abs(p - n)
    if (d < bestDist) {
      bestDist = d
      best = p
    }
  }
  return best
}

function formatLeadBody(minutes) {
  const m = normalizeLeadMinutes(minutes)
  if (m === 30) return 'En ~30 min'
  if (m === 60) return 'En ~1 h'
  if (m === 120) return 'En ~2 h'
  if (m === 180) return 'En ~3 h'
  if (m === 1440) return 'En ~1 día'
  return `En ~${m} min`
}

function loadVapid() {
  let publicKey = process.env.VAPID_PUBLIC_KEY || ''
  let privateKey = process.env.VAPID_PRIVATE_KEY || ''
  let subject = process.env.VAPID_SUBJECT || 'mailto:familia-mati@localhost'
  const file =
    process.env.VAPID_KEYS_FILE ||
    join(process.cwd(), 'secrets/vapid.json')
  if ((!publicKey || !privateKey) && existsSync(file)) {
    const j = JSON.parse(readFileSync(file, 'utf8'))
    publicKey = publicKey || j.publicKey
    privateKey = privateKey || j.privateKey
    subject = j.subject || subject
  }
  if (!publicKey || !privateKey) {
    throw new Error('Missing VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (or secrets/vapid.json)')
  }
  return { publicKey, privateKey, subject }
}

function loadServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (raw) return JSON.parse(raw)
  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (path && existsSync(path)) return JSON.parse(readFileSync(path, 'utf8'))
  const local = join(process.cwd(), 'secrets/firebase-service-account.json')
  if (existsSync(local)) return JSON.parse(readFileSync(local, 'utf8'))
  throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_JSON (Firebase Admin service account)')
}

/** Interpret YYYY-MM-DD + HH:MM as local wall time in tz, return UTC ms (minute precision). */
function eventUtcMs(dateStr, timeStr, timeZone) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const [hh, mm] = timeStr.split(':').map(Number)
  let lo = Date.UTC(y, m - 1, d - 1, 0, 0, 0)
  let hi = Date.UTC(y, m - 1, d + 1, 23, 59, 59)
  const target = { y, m, d, hh, mm }
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  function parts(ms) {
    const p = Object.fromEntries(
      fmt.formatToParts(new Date(ms)).filter((x) => x.type !== 'literal').map((x) => [x.type, x.value]),
    )
    return {
      y: Number(p.year),
      m: Number(p.month),
      d: Number(p.day),
      hh: Number(p.hour),
      mm: Number(p.minute),
    }
  }
  function cmp(a, b) {
    if (a.y !== b.y) return a.y - b.y
    if (a.m !== b.m) return a.m - b.m
    if (a.d !== b.d) return a.d - b.d
    if (a.hh !== b.hh) return a.hh - b.hh
    return a.mm - b.mm
  }
  let best = null
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2)
    const c = cmp(parts(mid), target)
    if (c === 0) {
      best = mid
      // Prefer earliest ms in the matching minute
      hi = mid - 1
      continue
    }
    if (c < 0) lo = mid + 1
    else hi = mid - 1
  }
  if (best != null) return best
  // Last resort: probe from a UTC guess shifted for CET/CEST (±0..3h)
  for (const offsetH of [0, 1, 2, -1, 3]) {
    const guess = Date.UTC(y, m - 1, d, hh, mm, 0) - offsetH * 3600 * 1000
    if (cmp(parts(guess), target) === 0) return guess
  }
  throw new Error(`Cannot resolve ${dateStr} ${timeStr} in ${timeZone}`)
}

const HOUSEHOLD = new Set(['sebas', 'lore', 'hellen'])

/** Normalize assignee / para → sebas|lore|hellen|todos|null (legacy teo|hija → hellen).
 * Empty / unknown → null (NEVER silently becomes todos). */
function normalizeAssignee(raw) {
  const v = String(raw || '')
    .trim()
    .toLowerCase()
  if (!v) return null
  if (v === 'todos' || v === 'all' || v === 'everyone') return 'todos'
  if (v === 'hija' || v === 'teo') return 'hellen'
  if (HOUSEHOLD.has(v)) return v
  return null
}

/**
 * STRICT targeting by item.assignee / para only:
 * - sebas|lore|hellen → only that memberKey’s push devices
 * - todos → all household members with push enabled
 * - missing/invalid → nobody (never broadcast)
 * Creator of the item is irrelevant.
 */
function recipientsForItem(item, subs) {
  const who = normalizeAssignee(item.assignee ?? item.para)
  if (!who) return []
  if (who === 'todos') {
    return subs.filter((s) => {
      const mk = normalizeAssignee(s.memberKey)
      return mk && HOUSEHOLD.has(mk)
    })
  }
  // Exact member only — never fan out
  return subs.filter((s) => normalizeAssignee(s.memberKey) === who)
}

function assertTargeting(who, recipients) {
  const keys = [...new Set(recipients.map((r) => normalizeAssignee(r.memberKey)).filter(Boolean))]
  if (!who) return { ok: keys.length === 0, keys }
  if (who === 'todos') {
    return { ok: keys.every((k) => HOUSEHOLD.has(k)), keys }
  }
  return { ok: keys.length === 0 || (keys.length === 1 && keys[0] === who), keys }
}

/** Madrid (or REMINDER_TZ) calendar day YYYY-MM-DD + wall clock hour/minute. */
function madridParts(ms, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  const p = Object.fromEntries(
    fmt.formatToParts(new Date(ms)).filter((x) => x.type !== 'literal').map((x) => [x.type, x.value]),
  )
  return {
    day: `${p.year}-${p.month}-${p.day}`,
    hour: Number(p.hour),
    minute: Number(p.minute),
  }
}

/** Parse HH:mm → { hour, minute }. Invalid → 16:00. */
function parseDigestClock(raw) {
  const s = String(raw ?? '').trim()
  const m = s.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return { hour: 16, minute: 0, time: '16:00' }
  const hour = Number(m[1])
  const minute = Number(m[2])
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return { hour: 16, minute: 0, time: '16:00' }
  }
  const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  return { hour, minute, time }
}

/**
 * Window from configured digest clock (hour:minute) for `windowMinutes`.
 * Agenda/cita lead windows are unrelated — this is Rutinas-only.
 */
function inRoutinesDigestWindow(ms, timeZone, digestHour, digestMinute, windowMinutes) {
  const { day, hour: h, minute: m } = madridParts(ms, timeZone)
  const mins = h * 60 + m
  const start = digestHour * 60 + digestMinute
  const end = start + windowMinutes
  return { ok: mins >= start && mins < end, day, hour: h, minute: m, start, end }
}

function truncateBody(text, maxLen = 180) {
  const s = String(text || '').replace(/\s+/g, ' ').trim()
  if (s.length <= maxLen) return s
  return `${s.slice(0, maxLen - 1).trimEnd()}…`
}

/**
 * ONE notification listing active routines for all household push devices.
 * Clock from familia_settings/routinesDigest (shared for all routines; not per-routine, not agenda).
 * Marks familia_routines_digest_sent/{madridDay} so 5‑min cron ticks do not re-fire.
 */
async function sendRoutinesDigest({ db, webpush, subs, now, tz }) {
  const windowMinutes = Number(process.env.ROUTINES_DIGEST_WINDOW_MINUTES || 12)
  let settingTime = process.env.ROUTINES_DIGEST_TIME || '16:00'
  try {
    const settingSnap = await db.collection('familia_settings').doc('routinesDigest').get()
    if (settingSnap.exists) {
      const d = settingSnap.data() || {}
      if (d.time) settingTime = d.time
    }
  } catch (e) {
    console.warn('routinesDigest setting read failed; using fallback', String(e?.message || e))
  }
  const clock = parseDigestClock(settingTime)
  const win = inRoutinesDigestWindow(now, tz, clock.hour, clock.minute, windowMinutes)
  const endMins = clock.hour * 60 + clock.minute + windowMinutes
  const endH = Math.floor(endMins / 60) % 24
  const endM = endMins % 60
  const windowLabel = `${clock.time}–${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`
  if (!win.ok) {
    return {
      sent: 0,
      skipped: true,
      reason: 'outside_window',
      digestTime: clock.time,
      madridDay: win.day,
      madridClock: `${String(win.hour).padStart(2, '0')}:${String(win.minute).padStart(2, '0')}`,
      window: windowLabel,
    }
  }

  const sentRef = db.collection('familia_routines_digest_sent').doc(win.day)
  const already = await sentRef.get()
  if (already.exists) {
    return {
      sent: 0,
      skipped: true,
      reason: 'already_sent_today',
      digestTime: clock.time,
      madridDay: win.day,
      madridClock: `${String(win.hour).padStart(2, '0')}:${String(win.minute).padStart(2, '0')}`,
    }
  }

  const routinesSnap = await db.collection('familia_routines').get()
  const active = routinesSnap.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() || {}) }))
    .filter((r) => r.active !== false && String(r.title || '').trim())
    .sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0))

  if (!active.length) {
    // Prefer retry if someone adds a routine later in the same window — do NOT mark.
    return {
      sent: 0,
      skipped: true,
      reason: 'no_active_routines',
      digestTime: clock.time,
      madridDay: win.day,
      madridClock: `${String(win.hour).padStart(2, '0')}:${String(win.minute).padStart(2, '0')}`,
    }
  }

  const names = active.map((r) => {
    const title = String(r.title).trim()
    const cad = String(r.cadence || '')
      .trim()
      .toLowerCase()
    if (cad === 'semanal' || cad === 'mensual') return `${title} (${cad})`
    return title
  })
  const title = 'Familia · Rutinas de hoy'
  const body = truncateBody(names.join(' · '))
  const payload = JSON.stringify({
    title,
    body,
    url: '/personal/familia/',
    tag: `rutinas-digest-${win.day}`,
  })

  // TODOS: every household member with push enabled (one payload per device).
  const targets = subs.filter((s) => s.memberKey && HOUSEHOLD.has(s.memberKey))
  if (!targets.length) {
    return {
      sent: 0,
      skipped: true,
      reason: 'no_push_subs',
      digestTime: clock.time,
      madridDay: win.day,
      routineCount: active.length,
    }
  }

  let okCount = 0
  const errors = []
  const deliveredTo = []
  for (const s of targets) {
    try {
      await webpush.sendNotification(
        {
          endpoint: s.endpoint,
          keys: { p256dh: s.keys.p256dh, auth: s.keys.auth },
        },
        payload,
        { TTL: 60 * 60 * 12, urgency: 'normal' },
      )
      okCount++
      deliveredTo.push(s.memberKey)
    } catch (e) {
      const status = e?.statusCode
      errors.push({
        uid: s.uid || s.id,
        memberKey: s.memberKey,
        status,
        message: String(e?.message || e),
      })
      if (status === 404 || status === 410) {
        await db.collection('familia_push_subs').doc(s.id).set({ enabled: false, dead: true }, { merge: true })
      }
    }
  }

  if (okCount === 0) {
    return {
      sent: 0,
      skipped: true,
      reason: 'all_devices_failed',
      digestTime: clock.time,
      madridDay: win.day,
      routineCount: active.length,
      errors: errors.slice(0, 10),
    }
  }

  await sentRef.set({
    at: now,
    madridDay: win.day,
    digestTime: clock.time,
    recipients: okCount,
    deliveredTo: [...new Set(deliveredTo)],
    routineIds: active.map((r) => r.id),
    titles: names,
    title,
    body,
  })

  return {
    sent: okCount,
    skipped: false,
    reason: 'sent',
    digestTime: clock.time,
    madridDay: win.day,
    madridClock: `${String(win.hour).padStart(2, '0')}:${String(win.minute).padStart(2, '0')}`,
    routineCount: active.length,
    titles: names,
    deliveredTo: [...new Set(deliveredTo)],
    errors: errors.slice(0, 10),
  }
}

/**
 * Fire when:
 * 1) Primary window: [remindAt, remindAt + windowMs) — ideal cron hit
 * 2) Catch-up: missed primary window but still before event (+ short grace)
 *    so late Activar avisos / delayed cron still deliver once.
 */
function shouldRemind(now, eventAt, leadMinutes, windowMs) {
  const remindAt = eventAt - leadMinutes * 60 * 1000
  if (now < remindAt) return { ok: false, reason: 'too_early', remindAt }
  if (now < remindAt + windowMs) return { ok: true, reason: 'primary_window', remindAt }
  if (now < eventAt + windowMs) return { ok: true, reason: 'catch_up', remindAt }
  return { ok: false, reason: 'past_event', remindAt }
}

async function main() {
  const admin = require('firebase-admin')
  const webpush = require('web-push')

  const vapid = loadVapid()
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey)

  const sa = loadServiceAccount()
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(sa) })
  }
  const db = admin.firestore()

  const tz = process.env.REMINDER_TZ || 'Europe/Madrid'
  const windowMin = Number(process.env.REMINDER_WINDOW_MINUTES || 45)
  const now = Date.now()
  const windowMs = windowMin * 60 * 1000

  // Profile map uid → memberKey; lead per persona (personaSettings) or legacy reminderLeadMinutes
  const usersSnap = await db.collection('familia_users').get()
  const memberByUid = new Map()
  const leadByUid = new Map()
  const leadByMember = new Map()
  const leadByUidMember = new Map() // `${uid}:${memberKey}` → minutes
  for (const doc of usersSnap.docs) {
    const d = doc.data() || {}
    const key = normalizeAssignee(d.activeMemberKey || d.memberKey)
    const legacyLead = normalizeLeadMinutes(d.reminderLeadMinutes)
    leadByUid.set(doc.id, legacyLead)
    if (key && key !== 'todos') memberByUid.set(doc.id, key)

    const settings = d.personaSettings && typeof d.personaSettings === 'object' ? d.personaSettings : {}
    const personas = Array.isArray(d.personas) ? d.personas : key ? [key] : []
    const personaKeys = new Set(
      [...personas, ...Object.keys(settings)].map((p) => normalizeAssignee(p)).filter(Boolean),
    )
    for (const mk of personaKeys) {
      if (!mk || mk === 'todos') continue
      const entry = settings[mk]
      const lead = normalizeLeadMinutes(
        entry && typeof entry === 'object' ? entry.reminderLeadMinutes : legacyLead,
      )
      // Prefer this account's own uid:member lead; do not let other test users overwrite.
      leadByUidMember.set(`${doc.id}:${mk}`, lead)
      if (doc.id === d.uid || !leadByMember.has(mk)) leadByMember.set(mk, lead)
      // If this looks like the real household member doc (email/memberKey match), prefer it
      if (key === mk) leadByMember.set(mk, lead)
    }
    if (key && key !== 'todos' && !leadByMember.has(key)) leadByMember.set(key, legacyLead)
  }

  const itemsSnap = await db.collection('familia_items').get()
  const agenda = []
  const skipDiag = []
  for (const doc of itemsSnap.docs) {
    const d = doc.data() || {}
    // Agenda only: cita + tarea (compromisos). Skip chores (tareas diarias) and bebé.
    if (d.kind === 'chore' || d.kind === 'bebe') {
      skipDiag.push({ id: doc.id, reason: 'kind_skipped', kind: d.kind })
      continue
    }
    if (d.kind !== 'cita' && d.kind !== 'tarea') {
      skipDiag.push({ id: doc.id, reason: 'kind_unknown', kind: d.kind })
      continue
    }
    if (d.status === 'hecha') {
      skipDiag.push({ id: doc.id, reason: 'hecha' })
      continue
    }
    const date = String(d.date || '')
    const time = String(d.time || '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}/.test(time)) {
      skipDiag.push({
        id: doc.id,
        reason: 'bad_datetime',
        date,
        time,
        title: d.title,
      })
      continue
    }
    let eventAt
    try {
      eventAt = eventUtcMs(date, time.slice(0, 5), tz)
    } catch (e) {
      console.warn('skip bad datetime', doc.id, date, time, String(e.message || e))
      skipDiag.push({ id: doc.id, reason: 'tz_resolve_fail', date, time })
      continue
    }
    // Keep items from max-lead before event through short grace after start
    const maxLeadMs = MAX_LEAD_MINUTES * 60 * 1000
    if (now < eventAt + windowMs && now >= eventAt - maxLeadMs - windowMs) {
      agenda.push({ id: doc.id, ...d, eventAt })
    } else {
      skipDiag.push({
        id: doc.id,
        reason: now >= eventAt + windowMs ? 'past_event' : 'outside_lead_horizon',
        date,
        time,
        eventMadrid: new Date(eventAt).toLocaleString('es-ES', { timeZone: tz }),
        title: d.title,
      })
    }
  }

  const subsSnap = await db.collection('familia_push_subs').get()
  const subs = subsSnap.docs
    .map((doc) => {
      const data = doc.data() || {}
      // STRICT: only trust explicit memberKey on the sub (set at Activar avisos).
      // Do NOT infer from uid's current active persona — that can mis-route after a persona switch.
      const memberKey = normalizeAssignee(data.memberKey)
      const uid = data.uid || null
      const resolvedUid = uid || data.uid || null
      const leadMinutes =
        (resolvedUid && memberKey && leadByUidMember.get(`${resolvedUid}:${memberKey}`)) ||
        (memberKey && leadByMember.get(memberKey)) ||
        (resolvedUid && leadByUid.get(resolvedUid)) ||
        DEFAULT_LEAD_MINUTES
      return {
        id: doc.id,
        ...data,
        uid: resolvedUid,
        memberKey,
        leadMinutes: normalizeLeadMinutes(leadMinutes),
      }
    })
    .filter(
      (s) =>
        s.enabled !== false &&
        !s.dead &&
        !s.personaMirror &&
        !s.legacyUidDoc &&
        s.endpoint &&
        s.keys?.p256dh &&
        s.keys?.auth &&
        s.memberKey &&
        HOUSEHOLD.has(s.memberKey),
    )

  const activeByMember = {}
  for (const s of subs) {
    const k = s.memberKey || '?'
    activeByMember[k] = (activeByMember[k] || 0) + 1
  }

  let sent = 0
  let skipped = 0
  const errors = []
  const targetingLog = []

  for (const item of agenda) {
    const who = normalizeAssignee(item.assignee ?? item.para)
    const targets = recipientsForItem(item, subs)
    const targetingCheck = assertTargeting(who, targets)

    const dueTargets = []
    const skipReasons = []
    for (const t of targets) {
      const decision = shouldRemind(now, item.eventAt, t.leadMinutes, windowMs)
      if (decision.ok) {
        dueTargets.push({ ...t, remindReason: decision.reason })
      } else {
        skipReasons.push({ memberKey: t.memberKey, reason: decision.reason })
      }
    }

    // Safety: never send if targeting assertion fails (would indicate a fan-out bug)
    if (!targetingCheck.ok) {
      console.error('TARGETING_GUARD', {
        itemId: item.id,
        assignee: who,
        recipientKeys: targetingCheck.keys,
      })
      skipped++
      targetingLog.push({
        itemId: item.id,
        title: item.title,
        assignee: who,
        blocked: 'targeting_guard',
        recipientKeys: targetingCheck.keys,
      })
      continue
    }

    targetingLog.push({
      itemId: item.id,
      title: item.title,
      kind: item.kind,
      assignee: who,
      eventMadrid: new Date(item.eventAt).toLocaleString('es-ES', { timeZone: tz }),
      targets: targets.map((t) => t.memberKey),
      targetingOk: targetingCheck.ok,
      due: dueTargets.map((t) => ({
        memberKey: t.memberKey,
        leadMinutes: t.leadMinutes,
        reason: t.remindReason,
      })),
      skipReasons: skipReasons.slice(0, 10),
    })

    if (!who) {
      skipped++
      continue
    }
    if (!targets.length) {
      skipped++
      targetingLog[targetingLog.length - 1].note =
        'No hay suscripciones push activas para este assignee. Cada perfil debe tocar Activar avisos en su móvil.'
      continue
    }
    if (!dueTargets.length) {
      skipped++
      continue
    }

    const when = new Date(item.eventAt).toLocaleString('es-ES', {
      timeZone: tz,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })

    // Dedupe by (item, uid|device, lead, eventAt) so editing the hour gets a fresh aviso
    const byPerson = new Map()
    for (const t of dueTargets) {
      const personKey = t.uid || `${t.memberKey}:${t.id}`
      const dedupeKey = `${personKey}_${t.leadMinutes}_${item.eventAt}`
      if (!byPerson.has(dedupeKey)) byPerson.set(dedupeKey, [])
      byPerson.get(dedupeKey).push(t)
    }

    for (const [, devices] of byPerson) {
      const sample = devices[0]
      const lead = sample.leadMinutes
      const uidKey = sample.uid || sample.memberKey || sample.id
      const sentRef = db
        .collection('familia_reminders_sent')
        .doc(`${item.id}_${uidKey}_${lead}m_${item.eventAt}`)
      const already = await sentRef.get()
      if (already.exists) {
        skipped++
        continue
      }

      const title = 'Familia Hellen y Mati · aviso'
      const body = `${formatLeadBody(lead)}: ${item.title} (${when})`
      const payload = JSON.stringify({
        title,
        body,
        url: '/personal/familia/',
        tag: `agenda-${item.id}-${lead}`,
      })

      let okCount = 0
      const deliveredTo = []
      for (const s of devices) {
        try {
          await webpush.sendNotification(
            {
              endpoint: s.endpoint,
              keys: { p256dh: s.keys.p256dh, auth: s.keys.auth },
            },
            payload,
            { TTL: 60 * 60 * 24, urgency: 'high' },
          )
          okCount++
          sent++
          deliveredTo.push(s.memberKey)
        } catch (e) {
          const status = e?.statusCode
          errors.push({
            uid: s.uid || s.id,
            memberKey: s.memberKey,
            status,
            message: String(e?.message || e),
          })
          if (status === 404 || status === 410) {
            await db.collection('familia_push_subs').doc(s.id).set({ enabled: false, dead: true }, { merge: true })
          }
        }
      }

      // Only mark sent when at least one device accepted — otherwise retry next cron.
      if (okCount === 0) {
        skipped++
        continue
      }

      await sentRef.set({
        itemId: item.id,
        kind: `lead_${lead}m`,
        leadMinutes: lead,
        at: now,
        recipients: okCount,
        assignee: who,
        memberKey: sample.memberKey,
        uid: sample.uid || null,
        deliveredTo,
        title: item.title,
        eventAt: item.eventAt,
        remindReason: sample.remindReason || 'primary_window',
      })
    }
  }

  const routinesDigest = await sendRoutinesDigest({ db, webpush, subs, now, tz })

  console.log(
    JSON.stringify({
      ok: true,
      sent,
      skipped,
      agendaChecked: itemsSnap.size,
      agendaDue: agenda.length,
      agendaReason: agenda.length ? undefined : 'no_upcoming_agenda',
      routinesDigest,
      activeSubs: subs.length,
      activeByMember,
      missingMembers: [...HOUSEHOLD].filter((m) => !activeByMember[m]),
      targeting: targetingLog.slice(0, 20),
      errors: errors.slice(0, 10),
      skipDiag: agenda.length ? undefined : skipDiag.slice(0, 30),
      windowMin,
      tz,
      nowMadrid: new Date(now).toLocaleString('es-ES', { timeZone: tz }),
      note:
        subs.length === 0
          ? 'Ninguna suscripción push activa. Cada móvil debe abrir la PWA y tocar Activar avisos.'
          : undefined,
    }),
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
