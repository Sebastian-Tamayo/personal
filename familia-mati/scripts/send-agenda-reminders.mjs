#!/usr/bin/env node
/**
 * Send Web Push ~2h before agenda items (cita/tarea with date+time).
 * Runs outside the browser (GitHub Actions cron or any host). Does NOT use setTimeout in the app.
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
  // Binary search UTC instant whose tz wall clock matches
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
    const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).filter((x) => x.type !== 'literal').map((x) => [x.type, x.value]))
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
  // Fallback: treat as UTC (better than crashing)
  return Date.UTC(y, m - 1, d, hh, mm, 0)
}

const HOUSEHOLD = new Set(['sebas', 'lore', 'hellen'])

/** Normalize assignee / para → sebas|lore|hellen|todos|null */
function normalizeAssignee(raw) {
  const v = String(raw || '')
    .trim()
    .toLowerCase()
  if (!v) return null
  if (v === 'todos' || v === 'all' || v === 'everyone') return 'todos'
  if (v === 'hija') return 'hellen'
  if (HOUSEHOLD.has(v)) return v
  return null
}

/**
 * Privacy: only matching people get the push.
 * - todos → every subscribed household member (sebas/lore/hellen)
 * - sebas|lore|hellen → only that memberKey (never the others)
 */
function recipientsForItem(item, subs) {
  const who = normalizeAssignee(item.assignee ?? item.para)
  if (!who) return []
  if (who === 'todos') {
    return subs.filter((s) => HOUSEHOLD.has(String(s.memberKey || '')))
  }
  return subs.filter((s) => String(s.memberKey || '') === who)
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
  const leadMs = 2 * 60 * 60 * 1000
  const windowMs = windowMin * 60 * 1000

  // Profile map uid → memberKey (fallback if sub doc lacks memberKey)
  const usersSnap = await db.collection('familia_users').get()
  const memberByUid = new Map()
  for (const doc of usersSnap.docs) {
    const d = doc.data() || {}
    const key = normalizeAssignee(d.memberKey)
    if (key && key !== 'todos') memberByUid.set(doc.id, key)
  }

  const itemsSnap = await db.collection('familia_items').get()
  const agenda = []
  for (const doc of itemsSnap.docs) {
    const d = doc.data() || {}
    if (d.kind !== 'cita' && d.kind !== 'tarea') continue
    if (d.status === 'hecha') continue
    const date = String(d.date || '')
    const time = String(d.time || '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}/.test(time)) continue
    const eventAt = eventUtcMs(date, time.slice(0, 5), tz)
    const remindAt = eventAt - leadMs
    if (now >= remindAt && now < remindAt + windowMs) {
      agenda.push({ id: doc.id, ...d, eventAt, remindAt })
    }
  }

  if (!agenda.length) {
    console.log(JSON.stringify({ ok: true, sent: 0, checked: itemsSnap.size, reason: 'no_items_in_window' }))
    return
  }

  const subsSnap = await db.collection('familia_push_subs').get()
  const subs = subsSnap.docs
    .map((doc) => {
      const data = doc.data() || {}
      let memberKey = normalizeAssignee(data.memberKey)
      if (!memberKey || memberKey === 'todos') {
        memberKey = memberByUid.get(doc.id) || memberByUid.get(data.uid) || null
      }
      return { id: doc.id, ...data, memberKey }
    })
    .filter(
      (s) =>
        s.enabled !== false &&
        !s.dead &&
        s.endpoint &&
        s.keys?.p256dh &&
        s.keys?.auth &&
        HOUSEHOLD.has(String(s.memberKey || '')),
    )

  let sent = 0
  let skipped = 0
  const errors = []
  const targetingLog = []

  for (const item of agenda) {
    const sentRef = db.collection('familia_reminders_sent').doc(`${item.id}_2h`)
    const already = await sentRef.get()
    if (already.exists) {
      skipped++
      continue
    }

    const who = normalizeAssignee(item.assignee ?? item.para)
    const targets = recipientsForItem(item, subs)
    targetingLog.push({
      itemId: item.id,
      title: item.title,
      assignee: who,
      recipients: targets.map((t) => t.memberKey),
    })

    if (!who || !targets.length) {
      // Nobody eligible / no matching subscription — do not fan-out to others
      await sentRef.set({
        itemId: item.id,
        kind: '2h',
        at: now,
        recipients: 0,
        assignee: who,
        reason: !who ? 'invalid_assignee' : 'no_matching_subs',
      })
      skipped++
      continue
    }

    const when = new Date(item.eventAt).toLocaleString('es-ES', {
      timeZone: tz,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
    const title = 'Familia Mati · aviso'
    const body = `En ~2 h: ${item.title} (${when})`
    const payload = JSON.stringify({
      title,
      body,
      url: '/personal/familia/',
      tag: `agenda-${item.id}`,
    })

    let okCount = 0
    const deliveredTo = []
    for (const s of targets) {
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
        errors.push({ uid: s.uid || s.id, memberKey: s.memberKey, status, message: String(e?.message || e) })
        if (status === 404 || status === 410) {
          await db.collection('familia_push_subs').doc(s.id).set({ enabled: false, dead: true }, { merge: true })
        }
      }
    }

    await sentRef.set({
      itemId: item.id,
      kind: '2h',
      at: now,
      recipients: okCount,
      assignee: who,
      deliveredTo,
      title: item.title,
    })
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
