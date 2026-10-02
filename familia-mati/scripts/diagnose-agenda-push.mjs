#!/usr/bin/env node
/**
 * Diagnose agenda push: dump items/subs/sent + evaluate lead windows (Europe/Madrid).
 * Uses FIREBASE_SERVICE_ACCOUNT_JSON. No secrets printed.
 */
import { createRequire } from 'node:module'
import { readFileSync, existsSync } from 'node:fs'

const require = createRequire(import.meta.url)

function loadSa() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
  }
  const p = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (p && existsSync(p)) return JSON.parse(readFileSync(p, 'utf8'))
  throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_JSON')
}

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

async function main() {
  const admin = require('firebase-admin')
  const sa = loadSa()
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) })
  const db = admin.firestore()
  const tz = process.env.REMINDER_TZ || 'Europe/Madrid'
  const windowMin = Number(process.env.REMINDER_WINDOW_MINUTES || 20)
  const now = Date.now()

  const items = (await db.collection('familia_items').get()).docs.map((d) => {
    const x = d.data() || {}
    const date = String(x.date || '')
    const time = String(x.time || '').slice(0, 5)
    let eventAt = null
    let eventMadrid = null
    let remindAt120 = null
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{2}:\d{2}$/.test(time)) {
      eventAt = eventUtcMs(date, time, tz)
      eventMadrid = new Date(eventAt).toLocaleString('es-ES', { timeZone: tz })
      remindAt120 = new Date(eventAt - 120 * 60 * 1000).toLocaleString('es-ES', { timeZone: tz })
    }
    return {
      id: d.id,
      title: x.title,
      kind: x.kind,
      status: x.status,
      assignee: x.assignee,
      date,
      time: x.time,
      eventAt,
      eventMadrid,
      remindAt120,
      inAgendaFilter: x.kind === 'cita' || x.kind === 'tarea',
    }
  })

  const subs = (await db.collection('familia_push_subs').get()).docs.map((d) => {
    const x = d.data() || {}
    return {
      id: d.id,
      uid: x.uid || null,
      memberKey: x.memberKey || null,
      enabled: x.enabled !== false,
      dead: !!x.dead,
      personaMirror: !!x.personaMirror,
      legacyUidDoc: !!x.legacyUidDoc,
      hasEndpoint: !!x.endpoint,
      hasKeys: !!(x.keys?.p256dh && x.keys?.auth),
      userAgent: String(x.userAgent || '').slice(0, 80),
      updatedAt: x.updatedAt || null,
    }
  })

  const sent = (await db.collection('familia_reminders_sent').get()).docs.map((d) => {
    const x = d.data() || {}
    return {
      id: d.id,
      itemId: x.itemId,
      title: x.title,
      assignee: x.assignee,
      memberKey: x.memberKey,
      leadMinutes: x.leadMinutes,
      at: x.at,
      atMadrid: x.at ? new Date(x.at).toLocaleString('es-ES', { timeZone: tz }) : null,
      recipients: x.recipients,
      deliveredTo: x.deliveredTo,
    }
  })

  const activeDeviceSubs = subs.filter(
    (s) =>
      s.enabled &&
      !s.dead &&
      !s.personaMirror &&
      !s.legacyUidDoc &&
      s.hasEndpoint &&
      s.hasKeys,
  )

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(),
  )

  console.log(
    JSON.stringify(
      {
        ok: true,
        nowUtc: new Date(now).toISOString(),
        nowMadrid: new Date(now).toLocaleString('es-ES', { timeZone: tz }),
        tz,
        windowMin,
        todayMadrid: today,
        items,
        itemsToday17ish: items.filter(
          (i) => i.date === today && String(i.time || '').startsWith('17'),
        ),
        subs,
        activeDeviceSubs,
        activeByMember: activeDeviceSubs.reduce((acc, s) => {
          const k = s.memberKey || '?'
          acc[k] = (acc[k] || 0) + 1
          return acc
        }, {}),
        sentCount: sent.length,
        sentRecent: sent.sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 15),
        diagnosisHints: {
          noActiveSubs: activeDeviceSubs.length === 0,
          cronNote: 'If Actions has zero schedule runs, cron never fired — only manual dispatch.',
        },
      },
      null,
      2,
    ),
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
