#!/usr/bin/env node
/**
 * Investigate + catch-up send for today's ~17:36 Madrid agenda item.
 */
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const TZ = 'Europe/Madrid'
const HOUSEHOLD = new Set(['sebas', 'lore', 'hellen'])

function norm(raw) {
  const v = String(raw || '').trim().toLowerCase()
  if (!v) return null
  if (v === 'todos' || v === 'all' || v === 'everyone') return 'todos'
  if (v === 'hija' || v === 'teo') return 'hellen'
  if (HOUSEHOLD.has(v)) return v
  return null
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
    return { y: +p.year, m: +p.month, d: +p.day, hh: +p.hour, mm: +p.minute }
  }
  function cmp(a, b) {
    return a.y - b.y || a.m - b.m || a.d - b.d || a.hh - b.hh || a.mm - b.mm
  }
  let best = null
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2)
    const c = cmp(parts(mid), target)
    if (c === 0) {
      best = mid
      hi = mid - 1
      continue
    }
    if (c < 0) lo = mid + 1
    else hi = mid - 1
  }
  if (best == null) throw new Error('bad datetime ' + dateStr + ' ' + timeStr)
  return best
}

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
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) })
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:familia@localhost',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  )
  const db = admin.firestore()
  const now = Date.now()
  const windowMs = 45 * 60 * 1000
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())

  // Users / Sebas lead
  const users = (await db.collection('familia_users').get()).docs.map((d) => {
    const x = d.data() || {}
    return {
      uid: d.id,
      email: x.email || null,
      memberKey: x.memberKey,
      activeMemberKey: x.activeMemberKey,
      reminderLeadMinutes: x.reminderLeadMinutes ?? null,
      personaLeadSebas: x.personaSettings?.sebas?.reminderLeadMinutes ?? null,
      personaLeadHellen: x.personaSettings?.hellen?.reminderLeadMinutes ?? null,
    }
  })
  const sebasUsers = users.filter(
    (u) =>
      u.memberKey === 'sebas' ||
      u.activeMemberKey === 'sebas' ||
      String(u.email || '').includes('sbsesebeese'),
  )

  // Items today around 17:36
  const items = []
  for (const doc of (await db.collection('familia_items').get()).docs) {
    const x = doc.data() || {}
    const date = String(x.date || '')
    const time = String(x.time || '')
    if (date !== today) continue
    if (x.kind === 'chore' || x.kind === 'bebe') continue
    let eventAt = null
    let eventMadrid = null
    try {
      if (/^\d{2}:\d{2}/.test(time)) {
        eventAt = eventUtcMs(date, time.slice(0, 5), TZ)
        eventMadrid = new Date(eventAt).toLocaleString('es-ES', { timeZone: TZ })
      }
    } catch {}
    items.push({
      id: doc.id,
      title: x.title,
      kind: x.kind,
      status: x.status,
      assignee: x.assignee,
      date,
      time,
      createdBy: x.createdBy || null,
      createdAt: x.createdAt || null,
      createdMadrid: x.createdAt
        ? new Date(x.createdAt).toLocaleString('es-ES', { timeZone: TZ })
        : null,
      eventAt,
      eventMadrid,
      e2eTest: !!x.e2eTest,
    })
  }

  const around1736 = items.filter((i) => {
    const t = String(i.time || '')
    return t.startsWith('17:3') || t.startsWith('17:36') || t === '17:36'
  })

  // Subs
  const subs = (await db.collection('familia_push_subs').get()).docs
    .map((d) => {
      const x = d.data() || {}
      return {
        id: d.id,
        uid: x.uid || null,
        memberKey: norm(x.memberKey),
        enabled: x.enabled !== false,
        dead: !!x.dead,
        personaMirror: !!x.personaMirror,
        legacyUidDoc: !!x.legacyUidDoc,
        hasEndpoint: !!x.endpoint,
        hasKeys: !!(x.keys?.p256dh && x.keys?.auth),
        endpoint: x.endpoint,
        keys: x.keys,
        updatedMadrid: x.updatedAt
          ? new Date(x.updatedAt).toLocaleString('es-ES', { timeZone: TZ })
          : null,
      }
    })
    .filter(
      (s) =>
        s.enabled &&
        !s.dead &&
        !s.personaMirror &&
        !s.legacyUidDoc &&
        s.hasEndpoint &&
        s.hasKeys &&
        s.memberKey &&
        HOUSEHOLD.has(s.memberKey),
    )

  const sebasSubs = subs.filter((s) => s.memberKey === 'sebas')

  // Sent docs for today's items
  const sentSnap = await db.collection('familia_reminders_sent').get()
  const sentForToday = []
  const todayIds = new Set(items.map((i) => i.id))
  for (const doc of sentSnap.docs) {
    const x = doc.data() || {}
    if (!todayIds.has(x.itemId) && !around1736.some((i) => doc.id.startsWith(i.id))) continue
    sentForToday.push({
      id: doc.id,
      itemId: x.itemId,
      title: x.title,
      memberKey: x.memberKey,
      leadMinutes: x.leadMinutes,
      atMadrid: x.at ? new Date(x.at).toLocaleString('es-ES', { timeZone: TZ }) : null,
      deliveredTo: x.deliveredTo || [],
    })
  }

  // Decide lead for sebas: prefer personaSettings.sebas, else reminderLeadMinutes, else 120
  const sebasProfile = sebasUsers[0]
  const sebasLead = Number(
    sebasProfile?.personaLeadSebas ?? sebasProfile?.reminderLeadMinutes ?? 120,
  )

  // Catch-up send for 17:36-ish items (and any due sebas items)
  const sendResults = []
  const focusItems = around1736.length
    ? around1736
    : items.filter((i) => i.eventAt && i.eventAt > now - windowMs)

  for (const item of focusItems.length ? focusItems : around1736) {
    if (!item.eventAt) continue
    const who = norm(item.assignee)
    const targets =
      who === 'todos'
        ? sebasSubs // for this investigation we only send to sebas if todos? NO - respect assignee
        : who === 'sebas'
          ? sebasSubs
          : who === 'todos'
            ? subs
            : subs.filter((s) => s.memberKey === who)

    // Fix: proper recipients
    const recipients =
      who === 'todos'
        ? subs
        : who
          ? subs.filter((s) => s.memberKey === who)
          : []

    for (const s of recipients) {
      const lead =
        s.memberKey === 'sebas'
          ? sebasLead
          : Number(
              users.find((u) => u.uid === s.uid)?.[`personaLead${s.memberKey?.[0]?.toUpperCase()}${s.memberKey?.slice(1)}`] ??
                users.find((u) => u.uid === s.uid)?.reminderLeadMinutes ??
                120,
            )
      // Better lead resolution
      let leadMin = 120
      const u = users.find((x) => x.uid === s.uid)
      if (s.memberKey === 'sebas') {
        leadMin = Number(u?.personaLeadSebas ?? u?.reminderLeadMinutes ?? 120)
      } else if (s.memberKey === 'hellen') {
        leadMin = Number(u?.personaLeadHellen ?? u?.reminderLeadMinutes ?? 120)
      } else {
        leadMin = Number(u?.reminderLeadMinutes ?? 120)
      }
      // Allowed presets
      if (![30, 60, 120, 180, 1440].includes(leadMin)) leadMin = 120

      const decision = shouldRemind(now, item.eventAt, leadMin, windowMs)
      const sentRef = db.collection('familia_reminders_sent').doc(`${item.id}_${s.uid || s.id}_${leadMin}m`)
      const already = await sentRef.get()
      const row = {
        itemId: item.id,
        title: item.title,
        assignee: who,
        memberKey: s.memberKey,
        leadMin,
        decision,
        remindAtMadrid: new Date(decision.remindAt).toLocaleString('es-ES', { timeZone: TZ }),
        alreadySent: already.exists,
      }
      if (!decision.ok || already.exists) {
        sendResults.push({ ...row, sent: false })
        continue
      }
      try {
        const when = new Date(item.eventAt).toLocaleString('es-ES', {
          timeZone: TZ,
          weekday: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })
        const leadLabel =
          leadMin === 30 ? 'En ~30 min' : leadMin === 60 ? 'En ~1 h' : leadMin === 120 ? 'En ~2 h' : `En ~${leadMin} min`
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } },
          JSON.stringify({
            title: 'Familia Hellen y Mati · aviso',
            body: `${leadLabel}: ${item.title} (${when})`,
            url: '/personal/familia/',
            tag: `agenda-${item.id}-${leadMin}-${now}`,
          }),
          { TTL: 300, urgency: 'high' },
        )
        await sentRef.set({
          itemId: item.id,
          kind: `lead_${leadMin}m`,
          leadMinutes: leadMin,
          at: now,
          recipients: 1,
          assignee: who,
          memberKey: s.memberKey,
          uid: s.uid,
          deliveredTo: [s.memberKey],
          title: item.title,
          remindReason: decision.reason,
          catchUpManual: true,
        })
        sendResults.push({ ...row, sent: true, status: 201 })
      } catch (e) {
        sendResults.push({
          ...row,
          sent: false,
          status: e.statusCode || null,
          error: String(e.message || e).slice(0, 100),
        })
        if (e.statusCode === 404 || e.statusCode === 410) {
          await db.collection('familia_push_subs').doc(s.id).set(
            { enabled: false, dead: true, deadAt: now },
            { merge: true },
          )
        }
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        nowMadrid: new Date(now).toLocaleString('es-ES', { timeZone: TZ }),
        today,
        sebasUsers,
        sebasLeadResolved: sebasLead,
        itemsTodayAgenda: items.filter((i) => i.kind === 'cita' || i.kind === 'tarea'),
        around1736,
        sebasSubsActive: sebasSubs.map((s) => ({
          id: s.id.slice(0, 12) + '…',
          updatedMadrid: s.updatedMadrid,
        })),
        activeByMember: subs.reduce((a, s) => {
          a[s.memberKey] = (a[s.memberKey] || 0) + 1
          return a
        }, {}),
        sentForToday,
        sendResults,
        cronNote:
          'If Actions shows zero schedule events, GitHub cron never ran — only manual dispatch. That alone misses a 30-min window.',
        pushedNow: sendResults.filter((r) => r.sent).length,
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
