#!/usr/bin/env node
/**
 * Sebas push E2E: re-check subs, test push, set lead 120,
 * create catch-up cita (~now+20min Madrid), run reminder send for that item.
 * No secrets / full endpoints in logs.
 */
import { createRequire } from 'node:module'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const TZ = 'Europe/Madrid'
const LEAD = 30

function loadSa() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_JSON')
  return JSON.parse(raw)
}

function loadVapid() {
  let publicKey = process.env.VAPID_PUBLIC_KEY || ''
  let privateKey = process.env.VAPID_PRIVATE_KEY || ''
  let subject = process.env.VAPID_SUBJECT || 'mailto:familia-mati@localhost'
  const file = join(process.cwd(), 'secrets/vapid.json')
  if ((!publicKey || !privateKey) && existsSync(file)) {
    const j = JSON.parse(readFileSync(file, 'utf8'))
    publicKey = publicKey || j.publicKey
    privateKey = privateKey || j.privateKey
    subject = j.subject || subject
  }
  if (!publicKey || !privateKey) throw new Error('Missing VAPID keys')
  return { publicKey, privateKey, subject }
}

function uaHint(ua) {
  const u = String(ua || '')
  if (/iPhone/i.test(u)) {
    const m = u.match(/iPhone OS ([\d_]+)/)
    return `iPhone${m ? ' iOS ' + m[1].replace(/_/g, '.') : ''}`
  }
  if (/Android/i.test(u)) return 'Android'
  return 'other'
}

function madridParts(ms = Date.now()) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
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
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute}`,
    label: new Date(ms).toLocaleString('es-ES', { timeZone: TZ }),
  }
}

async function sendPush(webpush, sub, payloadObj) {
  const payload = JSON.stringify(payloadObj)
  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      },
      payload,
      { TTL: 120, urgency: 'high' },
    )
    return { ok: true, status: 201 }
  } catch (e) {
    return { ok: false, status: e.statusCode || null, message: String(e.message || e).slice(0, 120) }
  }
}

async function main() {
  const admin = require('firebase-admin')
  const webpush = require('web-push')
  const sa = loadSa()
  const vapid = loadVapid()
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) })
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey)
  const db = admin.firestore()
  const now = Date.now()

  // --- 1) Find Sebas uid(s) + set lead 120 ---
  const usersSnap = await db.collection('familia_users').get()
  const sebasDocs = []
  for (const doc of usersSnap.docs) {
    const d = doc.data() || {}
    const key = String(d.activeMemberKey || d.memberKey || '').toLowerCase()
    const personas = Array.isArray(d.personas) ? d.personas.map(String) : []
    const email = String(d.email || '').toLowerCase()
    // Real Sebas accounts (skip obvious test/example)
    const isSebas = key === 'sebas' || personas.includes('sebas')
    if (!isSebas) continue
    const isTest = /example\.com|test|dual-|familia-/.test(email)
    sebasDocs.push({ ref: doc.ref, id: doc.id, data: d, email, isTest })
  }

  const realSebas = sebasDocs.filter((s) => !s.isTest)
  const targets = realSebas.length ? realSebas : sebasDocs
  const leadUpdates = []
  for (const s of targets) {
    const ps = { ...(s.data.personaSettings || {}) }
    ps.sebas = { ...(ps.sebas || {}), reminderLeadMinutes: LEAD }
    await s.ref.set(
      {
        reminderLeadMinutes: LEAD,
        personaSettings: ps,
        memberKey: s.data.memberKey || 'sebas',
        activeMemberKey: s.data.activeMemberKey || 'sebas',
        updatedAt: now,
      },
      { merge: true },
    )
    leadUpdates.push({ uid: s.id, email: s.email, lead: LEAD })
  }
  const sebasUids = new Set(targets.map((t) => t.id))

  // --- 2) List + classify subs ---
  const subsSnap = await db.collection('familia_push_subs').get()
  const sebasSubs = []
  for (const doc of subsSnap.docs) {
    const d = doc.data() || {}
    const mk = String(d.memberKey || '').toLowerCase()
    const uid = d.uid || null
    if (mk !== 'sebas' && !sebasUids.has(uid) && !sebasUids.has(doc.id)) continue
    sebasSubs.push({
      id: doc.id,
      ref: doc.ref,
      uid,
      memberKey: d.memberKey,
      enabled: d.enabled !== false,
      dead: !!d.dead,
      personaMirror: !!d.personaMirror,
      legacyUidDoc: !!d.legacyUidDoc,
      endpoint: d.endpoint,
      keys: d.keys,
      device: uaHint(d.userAgent),
      updatedMadrid: d.updatedAt
        ? new Date(d.updatedAt).toLocaleString('es-ES', { timeZone: TZ })
        : null,
      updatedAt: d.updatedAt || 0,
    })
  }

  const deviceSubs = sebasSubs.filter(
    (s) =>
      s.enabled &&
      !s.dead &&
      !s.personaMirror &&
      !s.legacyUidDoc &&
      s.endpoint &&
      s.keys?.p256dh &&
      s.keys?.auth,
  )

  // --- 3) Test push to ALL device endpoints ---
  const testTag = `test-sebas-e2e-${now}`
  const testResults = []
  for (const s of deviceSubs) {
    const r = await sendPush(webpush, s, {
      title: 'Familia · prueba Sebas',
      body: 'Si ves esto, el push al iPhone funciona ahora.',
      url: '/personal/familia/',
      tag: testTag,
    })
    testResults.push({
      id: s.id.slice(0, 12) + '…',
      device: s.device,
      updatedMadrid: s.updatedMadrid,
      ...r,
    })
    if (!r.ok && (r.status === 404 || r.status === 410)) {
      await s.ref.set({ enabled: false, dead: true, deadAt: now, deadStatus: r.status }, { merge: true })
    }
  }

  const stillAlive = deviceSubs.filter((s) => {
    const tr = testResults.find((t) => t.id === s.id.slice(0, 12) + '…')
    return tr?.ok
  })

  // --- 4) E2E cita: event = now + 25 min Madrid; lead 30 → remindAt = now-5 → due now ---
  const eventMs = now + 25 * 60 * 1000
  const { date, time, label: eventMadrid } = madridParts(eventMs)
  const itemRef = await db.collection('familia_items').add({
    title: 'Prueba aviso Sebas 30min (E2E)',
    notes: 'Cita de prueba Sebas-only — se puede borrar. Lead 30, event ~+25m.',
    kind: 'cita',
    status: 'pendiente',
    assignee: 'sebas',
    date,
    time,
    createdAt: now,
    updatedAt: now,
    createdBy: 'e2e-sebas-push',
    e2eTest: true,
  })

  // Clear prior sent markers for this would-be fresh item (new id — none)
  // Run send logic inline (import duplicate of shouldRemind)
  function shouldRemind(nowMs, eventAt, leadMinutes, windowMs) {
    const remindAt = eventAt - leadMinutes * 60 * 1000
    if (nowMs < remindAt) return false
    if (nowMs < remindAt + windowMs) return true
    if (nowMs < eventAt + windowMs) return true
    return false
  }

  // Resolve eventAt via same binary search as sender
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
        hi = mid - 1
        continue
      }
      if (c < 0) lo = mid + 1
      else hi = mid - 1
    }
    if (best != null) return best
    throw new Error('bad datetime')
  }

  const eventAt = eventUtcMs(date, time, TZ)
  const windowMs = 45 * 60 * 1000
  const e2eSend = []
  let e2eSent = 0

  for (const s of stillAlive.length ? stillAlive : deviceSubs) {
    // re-read if marked dead
    const fresh = await s.ref.get()
    const fd = fresh.data() || {}
    if (fd.dead || fd.enabled === false) continue
    if (!shouldRemind(now, eventAt, LEAD, windowMs)) {
      e2eSend.push({ id: s.id.slice(0, 12) + '…', skipped: 'not_in_window' })
      continue
    }
    const sentRef = db
      .collection('familia_reminders_sent')
      .doc(`${itemRef.id}_${s.uid || s.id}_${LEAD}m_${eventAt}`)
    const already = await sentRef.get()
    if (already.exists) {
      e2eSend.push({ id: s.id.slice(0, 12) + '…', skipped: 'already_sent' })
      continue
    }
    const when = new Date(eventAt).toLocaleString('es-ES', {
      timeZone: TZ,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
    const r = await sendPush(webpush, { endpoint: fd.endpoint, keys: fd.keys }, {
      title: 'Familia Hellen y Mati · aviso',
      body: `En ~30 min: Prueba aviso Sebas 30min (E2E) (${when})`,
      url: '/personal/familia/',
      tag: `agenda-${itemRef.id}-${LEAD}`,
    })
    e2eSend.push({ id: s.id.slice(0, 12) + '…', device: s.device, ...r })
    if (r.ok) {
      e2eSent++
      await sentRef.set({
        itemId: itemRef.id,
        kind: `lead_${LEAD}m`,
        leadMinutes: LEAD,
        at: now,
        recipients: 1,
        assignee: 'sebas',
        memberKey: 'sebas',
        uid: s.uid || null,
        deliveredTo: ['sebas'],
        title: 'Prueba aviso Sebas 30min (E2E)',
        eventAt,
        remindReason: 'catch_up',
        e2eTest: true,
      })
    } else if (r.status === 404 || r.status === 410) {
      await s.ref.set({ enabled: false, dead: true, deadAt: now, deadStatus: r.status }, { merge: true })
    }
  }

  // Production path: run full sender (Sebas-only due item should fire)
  const { spawnSync } = require('node:child_process')
  const cronRun = spawnSync(process.execPath, ['scripts/send-agenda-reminders.mjs'], {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
  })
  let cronJson = null
  try {
    const lines = String(cronRun.stdout || '')
      .trim()
      .split('\n')
      .filter(Boolean)
    cronJson = JSON.parse(lines[lines.length - 1] || '{}')
  } catch {
    cronJson = { parseError: true, stdout: String(cronRun.stdout || '').slice(0, 500) }
  }

  const activeAfter = []
  for (const s of sebasSubs) {
    const snap = await s.ref.get()
    const d = snap.data() || {}
    if (
      d.enabled !== false &&
      !d.dead &&
      !d.personaMirror &&
      !d.legacyUidDoc &&
      d.endpoint &&
      d.keys?.p256dh
    ) {
      activeAfter.push({
        id: s.id.slice(0, 12) + '…',
        device: uaHint(d.userAgent),
        updatedMadrid: d.updatedAt
          ? new Date(d.updatedAt).toLocaleString('es-ES', { timeZone: TZ })
          : null,
      })
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        nowMadrid: madridParts(now).label,
        leadUpdates,
        sebasSubsBefore: sebasSubs.map((s) => ({
          id: s.id.slice(0, 12) + '…',
          memberKey: s.memberKey,
          device: s.device,
          enabled: s.enabled,
          dead: s.dead,
          personaMirror: s.personaMirror,
          legacyUidDoc: s.legacyUidDoc,
          updatedMadrid: s.updatedMadrid,
          isDeviceTarget:
            s.enabled && !s.dead && !s.personaMirror && !s.legacyUidDoc && !!s.endpoint,
        })),
        deviceTargetCount: deviceSubs.length,
        testPush: {
          attempted: testResults.length,
          ok: testResults.filter((r) => r.ok).length,
          fail: testResults.filter((r) => !r.ok),
          results: testResults,
        },
        e2eCita: {
          id: itemRef.id,
          assignee: 'sebas',
          date,
          time,
          eventMadrid,
          eventAtIso: new Date(eventAt).toISOString(),
          remindAtIso: new Date(eventAt - LEAD * 60 * 1000).toISOString(),
          leadMinutes: LEAD,
          mode: 'due_now (event ~+25m Madrid, lead 30 → remindAt ~now-5m)',
          sent: e2eSent,
          results: e2eSend,
        },
        productionCron: {
          status: cronRun.status,
          sent: cronJson?.sent,
          activeByMember: cronJson?.activeByMember,
          targetingSample: (cronJson?.targeting || []).slice(0, 5),
          errors: cronJson?.errors,
          nowMadrid: cronJson?.nowMadrid,
        },
        activeSubsAfter: activeAfter,
        summary_es:
          e2eSent > 0 || (cronJson?.sent || 0) > 0
            ? `SÍ: push Sebas OK. E2E directo envió ${e2eSent}; cron production sent=${cronJson?.sent ?? '?'}.`
            : testResults.filter((r) => r.ok).length > 0
              ? `Test push OK pero E2E agenda sent=0 (revisar ventana/lead). Cron sent=${cronJson?.sent ?? '?'}.`
              : 'NO: ningún endpoint de Sebas aceptó push (dead/410). Reactivar Activar avisos en el iPhone.',
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
