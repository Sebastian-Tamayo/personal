#!/usr/bin/env node
/**
 * Forensic dump: today's agenda items (esp. Sebas-created), lead, subs, sent.
 * No secrets printed.
 */
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

const TZ = 'Europe/Madrid'
const SEBAS_UID = 'mrxyOsEKu3OVC3w7YcOdNaMs4dq2'
const HOUSEHOLD = new Set(['sebas', 'lore', 'hellen'])

function norm(raw) {
  const v = String(raw || '').trim().toLowerCase()
  if (!v) return null
  if (v === 'todos' || v === 'all' || v === 'everyone') return 'todos'
  if (v === 'hija' || v === 'teo') return 'hellen'
  if (HOUSEHOLD.has(v) || v === 'bebe') return v
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
  if (best == null) throw new Error('bad datetime')
  return best
}

function madrid(ms) {
  return new Date(ms).toLocaleString('es-ES', { timeZone: TZ })
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
  const doSend = process.env.FORENSIC_SEND === '1'
  if (doSend) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:familia@localhost',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY,
    )
  }
  const db = admin.firestore()
  const now = Date.now()
  const windowMs = Number(process.env.REMINDER_WINDOW_MINUTES || 45) * 60 * 1000
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())

  const users = (await db.collection('familia_users').get()).docs.map((d) => {
    const x = d.data() || {}
    return {
      uid: d.id,
      email: x.email || null,
      memberKey: x.memberKey || null,
      activeMemberKey: x.activeMemberKey || null,
      reminderLeadMinutes: x.reminderLeadMinutes ?? null,
      personaLeadSebas: x.personaSettings?.sebas?.reminderLeadMinutes ?? null,
      personaLeadHellen: x.personaSettings?.hellen?.reminderLeadMinutes ?? null,
      personaLeadLore: x.personaSettings?.lore?.reminderLeadMinutes ?? null,
    }
  })
  const sebasUser = users.find((u) => u.uid === SEBAS_UID || String(u.email || '').includes('sbsesebeese'))

  // Effective lead used by sender for sebas persona
  const sebasLead =
    sebasUser?.personaLeadSebas ??
    (sebasUser?.memberKey === 'sebas' || sebasUser?.activeMemberKey === 'sebas'
      ? sebasUser?.reminderLeadMinutes
      : null) ??
    120

  const items = []
  for (const doc of (await db.collection('familia_items').get()).docs) {
    const x = doc.data() || {}
    const date = String(x.date || '')
    const time = String(x.time || '')
    const kind = String(x.kind || '')
    if (date !== today) continue
    if (kind === 'chore' || kind === 'bebe') continue
    let eventAt = null
    try {
      if (/^\d{2}:\d{2}/.test(time)) eventAt = eventUtcMs(date, time.slice(0, 5), TZ)
    } catch {}
    items.push({
      id: doc.id,
      title: x.title || null,
      kind,
      status: x.status || null,
      assignee: x.assignee ?? null,
      assigneeNorm: norm(x.assignee),
      date,
      time,
      createdBy: x.createdBy || null,
      createdAt: x.createdAt || null,
      createdMadrid: x.createdAt ? madrid(x.createdAt) : null,
      eventAt,
      eventMadrid: eventAt ? madrid(eventAt) : null,
      e2eTest: !!x.e2eTest,
    })
  }
  items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))

  const sebasCreated = items.filter((i) => i.createdBy === SEBAS_UID)
  const latest = sebasCreated.slice(0, 12)

  const subs = (await db.collection('familia_push_subs').get()).docs
    .map((d) => {
      const x = d.data() || {}
      return {
        id: d.id.slice(0, 12) + '…',
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
        updatedMadrid: x.updatedAt ? madrid(x.updatedAt) : null,
      }
    })
    .filter((s) => s.enabled && !s.dead && !s.personaMirror && !s.legacyUidDoc && s.hasEndpoint && s.hasKeys)

  const sebasSubs = subs.filter((s) => s.memberKey === 'sebas' || s.uid === SEBAS_UID)

  const sentSnap = await db.collection('familia_reminders_sent').get()
  const sentAll = sentSnap.docs.map((d) => {
    const x = d.data() || {}
    return {
      id: d.id,
      itemId: x.itemId,
      title: x.title,
      memberKey: x.memberKey,
      leadMinutes: x.leadMinutes,
      atMadrid: x.at ? madrid(x.at) : null,
      deliveredTo: x.deliveredTo || [],
    }
  })

  const analysis = []
  for (const item of latest) {
    const lead = Number(sebasLead) || 30
    const decision = item.eventAt
      ? shouldRemind(now, item.eventAt, lead, windowMs)
      : { ok: false, reason: 'no_event', remindAt: null }
    const sentFor = sentAll.filter((s) => s.itemId === item.id)
    const targets =
      item.assigneeNorm === 'todos'
        ? ['sebas', 'lore', 'hellen']
        : item.assigneeNorm && HOUSEHOLD.has(item.assigneeNorm)
          ? [item.assigneeNorm]
          : []
    analysis.push({
      id: item.id,
      title: item.title,
      assigneeStored: item.assignee,
      assigneeNorm: item.assigneeNorm,
      paraBugSuspected: item.assigneeNorm === 'todos' && item.createdBy === SEBAS_UID,
      kind: item.kind,
      time: item.time,
      createdMadrid: item.createdMadrid,
      eventMadrid: item.eventMadrid,
      sebasLeadMin: lead,
      remindAtMadrid: decision.remindAt ? madrid(decision.remindAt) : null,
      decision,
      targets,
      sebasInTargets: targets.includes('sebas'),
      sentDocs: sentFor,
      alreadySentSebas: sentFor.some((s) => s.memberKey === 'sebas'),
    })
  }

  const sendResults = []
  if (doSend) {
    // Heal latest Sebas-created item still wrongly stored as todos → sebas
    for (const a of analysis.slice(0, 1)) {
      if (a.assigneeNorm === 'todos' && a.createdMadrid) {
        await db.collection('familia_items').doc(a.id).set({ assignee: 'sebas' }, { merge: true })
        a.assigneeStored = 'sebas'
        a.assigneeNorm = 'sebas'
        a.targets = ['sebas']
        a.sebasInTargets = true
        a.healedAssignee = true
      }
    }
    for (const a of analysis) {
      if (!a.decision.ok || !a.sebasInTargets) continue
      const lead = a.sebasLeadMin
      const item = latest.find((i) => i.id === a.id)
      const eventAt = item?.eventAt
      if (!eventAt) continue
      const sentId = `${a.id}_${SEBAS_UID}_${lead}m_${eventAt}`
      const legacyId = `${a.id}_${SEBAS_UID}_${lead}m`
      const already = sentSnap.docs.some((d) => d.id === sentId)
      if (already) {
        sendResults.push({ itemId: a.id, title: a.title, skipped: 'alreadySent_eventAt' })
        continue
      }
      // If hour was edited after a legacy send, allow a new push under the eventAt key.
      const liveSubs = sebasSubs.filter((s) => s.endpoint && s.keys)
      if (!liveSubs.length) {
        sendResults.push({ itemId: a.id, title: a.title, skipped: 'no_subs' })
        continue
      }
      const payload = JSON.stringify({
        title: 'Familia Hellen y Mati · aviso',
        body: `En ~${lead} min: ${a.title} (${a.time || ''})`,
        data: { itemId: a.id, url: '/personal/familia/' },
        tag: `agenda-${a.id}-${lead}-${eventAt}`,
      })
      let ok = 0
      const statuses = []
      for (const sub of liveSubs) {
        try {
          const res = await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: sub.keys },
            payload,
            { urgency: 'high', TTL: 60 * 60 },
          )
          statuses.push(res.statusCode)
          ok++
        } catch (e) {
          statuses.push(String(e?.statusCode || e?.message || e))
        }
      }
      if (ok > 0) {
        await db.collection('familia_reminders_sent').doc(sentId).set({
          itemId: a.id,
          title: a.title,
          memberKey: 'sebas',
          leadMinutes: lead,
          at: Date.now(),
          deliveredTo: ['sebas'],
          eventAt,
          healedFromLegacy: sentSnap.docs.some((d) => d.id === legacyId),
        })
      }
      sendResults.push({
        itemId: a.id,
        title: a.title,
        pushed: ok,
        statuses,
        healedAssignee: a.healedAssignee || false,
        eventAt,
      })
    }
  }

  const out = {
    ok: true,
    nowMadrid: madrid(now),
    today,
    sebasUser: sebasUser
      ? {
          uid: sebasUser.uid,
          email: sebasUser.email,
          memberKey: sebasUser.memberKey,
          activeMemberKey: sebasUser.activeMemberKey,
          reminderLeadMinutes: sebasUser.reminderLeadMinutes,
          personaLeadSebas: sebasUser.personaLeadSebas,
          sebasLeadResolved: sebasLead,
        }
      : null,
    sebasSubsActive: sebasSubs.length,
    sebasSubsUpdated: sebasSubs.map((s) => ({ id: s.id, updatedMadrid: s.updatedMadrid })),
    latestSebasAgendaToday: latest.map((i) => ({
      id: i.id,
      title: i.title,
      date: i.date,
      time: i.time,
      assignee: i.assignee,
      kind: i.kind,
      createdAt: i.createdAt,
      createdMadrid: i.createdMadrid,
      eventMadrid: i.eventMadrid,
    })),
    analysis,
    sendResults,
    note: 'Para bug if assignee=todos while created from Sebas chip. Schedule must be event=schedule.',
  }
  console.log(JSON.stringify(out, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
