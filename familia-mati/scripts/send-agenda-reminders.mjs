#!/usr/bin/env node
/**
 * Send Web Push for Agenda · citas y compromisos ONLY (kinds: cita, tarea).
 * NEVER notifies for Tareas diarias (kind: chore) or bebé items.
 * Lead time is per-user/persona (familia_users.personaSettings / reminderLeadMinutes); default 120 min.
 * Runs outside the browser (GitHub Actions cron). Mobile Web Push — not email.
 *
 * Required env (never commit):
 *   FIREBASE_SERVICE_ACCOUNT_JSON  — full service account JSON string
 *   VAPID_PUBLIC_KEY
 *   VAPID_PRIVATE_KEY
 * Optional:
 *   VAPID_SUBJECT=mailto:you@example.com
 *   REMINDER_TZ=Europe/Madrid
 *   REMINDER_WINDOW_MINUTES=20
 *   VAPID_KEYS_FILE=/path/to/secrets/vapid.json  (local fallback)
 */
import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const require = createRequire(import.meta.url)

const LEAD_PRESETS = new Set([30, 60, 120, 180, 1440])
const DEFAULT_LEAD_MINUTES = 120

function normalizeLeadMinutes(raw) {
  const n = Number(raw)
  if (!Number.isFinite(n) || !LEAD_PRESETS.has(n)) return DEFAULT_LEAD_MINUTES
  return n
}

function formatLeadBody(minutes) {
  if (minutes === 30) return 'En ~30 min'
  if (minutes === 60) return 'En ~1 h'
  if (minutes === 120) return 'En ~2 h'
  if (minutes === 180) return 'En ~3 h'
  if (minutes === 1440) return 'En ~1 día'
  return `En ~${minutes} min`
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

/** Interpret YYYY-MM-DD + HH:MM as local wall time in tz, return UTC ms. */
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
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2)
    const c = cmp(parts(mid), target)
    if (c === 0) return mid
    if (c < 0) lo = mid + 1
    else hi = mid - 1
  }
  return Date.UTC(y, m - 1, d, hh, mm, 0)
}

const HOUSEHOLD = new Set(['sebas', 'lore', 'teo'])

/** Normalize assignee / para → sebas|lore|teo|todos|null (legacy hellen|hija → teo) */
function normalizeAssignee(raw) {
  const v = String(raw || '')
    .trim()
    .toLowerCase()
  if (!v) return null
  if (v === 'todos' || v === 'all' || v === 'everyone') return 'todos'
  if (v === 'hija' || v === 'hellen') return 'teo'
  if (HOUSEHOLD.has(v)) return v
  return null
}

/**
 * Privacy: only matching people get the push.
 * - todos → every subscribed household member (sebas/lore/teo)
 * - sebas|lore|teo → only that memberKey (never the others)
 * Legacy push docs with memberKey hellen match teo assignees.
 */
function recipientsForItem(item, subs) {
  const who = normalizeAssignee(item.assignee ?? item.para)
  if (!who) return []
  if (who === 'todos') {
    return subs.filter((s) => HOUSEHOLD.has(normalizeAssignee(s.memberKey) || ''))
  }
  return subs.filter((s) => normalizeAssignee(s.memberKey) === who)
}

function inLeadWindow(now, eventAt, leadMinutes, windowMs) {
  const remindAt = eventAt - leadMinutes * 60 * 1000
  return now >= remindAt && now < remindAt + windowMs
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
  const windowMin = Number(process.env.REMINDER_WINDOW_MINUTES || 20)
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
    for (const p of personas) {
      const mk = normalizeAssignee(p)
      if (!mk || mk === 'todos') continue
      const entry = settings[mk]
      const lead = normalizeLeadMinutes(
        entry && typeof entry === 'object' ? entry.reminderLeadMinutes : legacyLead,
      )
      leadByUidMember.set(`${doc.id}:${mk}`, lead)
      if (!leadByMember.has(mk)) leadByMember.set(mk, lead)
    }
    if (key && key !== 'todos' && !leadByMember.has(key)) leadByMember.set(key, legacyLead)
  }

  const itemsSnap = await db.collection('familia_items').get()
  const agenda = []
  for (const doc of itemsSnap.docs) {
    const d = doc.data() || {}
    // Agenda only: cita + tarea (compromisos). Skip chores (tareas diarias) and bebé.
    if (d.kind === 'chore' || d.kind === 'bebe') continue
    if (d.kind !== 'cita' && d.kind !== 'tarea') continue
    if (d.status === 'hecha') continue
    const date = String(d.date || '')
    const time = String(d.time || '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}/.test(time)) continue
    const eventAt = eventUtcMs(date, time.slice(0, 5), tz)
    // Keep items whose event is still upcoming (or just started) within max lead + window
    const maxLeadMs = 1440 * 60 * 1000
    if (now < eventAt + windowMs && now >= eventAt - maxLeadMs - windowMs) {
      agenda.push({ id: doc.id, ...d, eventAt })
    }
  }

  if (!agenda.length) {
    console.log(JSON.stringify({ ok: true, sent: 0, checked: itemsSnap.size, reason: 'no_upcoming_agenda' }))
    return
  }

  const subsSnap = await db.collection('familia_push_subs').get()
  const subs = subsSnap.docs
    .map((doc) => {
      const data = doc.data() || {}
      let memberKey = normalizeAssignee(data.memberKey)
      const uid = data.uid || (!data.legacyUidDoc && doc.id.length === 28 ? doc.id : null)
      if (!memberKey || memberKey === 'todos') {
        memberKey = memberByUid.get(doc.id) || (uid ? memberByUid.get(uid) : null) || null
      }
      const resolvedUid = uid || data.uid || null
      const leadMinutes =
        (resolvedUid && memberKey && leadByUidMember.get(`${resolvedUid}:${memberKey}`)) ||
        (memberKey && leadByMember.get(memberKey)) ||
        (resolvedUid && leadByUid.get(resolvedUid)) ||
        leadByUid.get(doc.id) ||
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
        HOUSEHOLD.has(normalizeAssignee(s.memberKey) || ''),
    )

  let sent = 0
  let skipped = 0
  const errors = []
  const targetingLog = []

  for (const item of agenda) {
    const who = normalizeAssignee(item.assignee ?? item.para)
    const targets = recipientsForItem(item, subs)

    // Group targets by lead window — only notify those currently in their personal window
    const dueTargets = targets.filter((t) => inLeadWindow(now, item.eventAt, t.leadMinutes, windowMs))

    targetingLog.push({
      itemId: item.id,
      title: item.title,
      assignee: who,
      due: dueTargets.map((t) => ({ memberKey: t.memberKey, leadMinutes: t.leadMinutes })),
    })

    if (!who || !dueTargets.length) {
      skipped++
      continue
    }

    const when = new Date(item.eventAt).toLocaleString('es-ES', {
      timeZone: tz,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })

    // Dedupe by (item, uid|device, lead) so each person gets one send per lead setting
    const byPerson = new Map()
    for (const t of dueTargets) {
      const personKey = t.uid || `${t.memberKey}:${t.id}`
      const dedupeKey = `${personKey}_${t.leadMinutes}`
      if (!byPerson.has(dedupeKey)) byPerson.set(dedupeKey, [])
      byPerson.get(dedupeKey).push(t)
    }

    for (const [, devices] of byPerson) {
      const sample = devices[0]
      const lead = sample.leadMinutes
      const uidKey = sample.uid || sample.memberKey || sample.id
      const sentRef = db.collection('familia_reminders_sent').doc(`${item.id}_${uidKey}_${lead}m`)
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
      })
    }
  }

  console.log(
    JSON.stringify({
      ok: true,
      sent,
      skipped,
      targeting: targetingLog.slice(0, 20),
      errors: errors.slice(0, 10),
      windowMin,
      tz,
    }),
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
