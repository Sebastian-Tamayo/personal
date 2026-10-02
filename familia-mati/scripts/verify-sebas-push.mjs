#!/usr/bin/env node
/**
 * Verify Sebas has an active Web Push subscription in Firestore.
 * Uses FIREBASE_SERVICE_ACCOUNT_JSON. No secrets / endpoints printed in full.
 */
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

function loadSa() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_JSON')
  return JSON.parse(raw)
}

function maskEndpoint(ep) {
  const s = String(ep || '')
  if (s.length < 24) return s ? '(short)' : null
  return `${s.slice(0, 28)}…${s.slice(-12)}`
}

function uaHint(ua) {
  const u = String(ua || '')
  if (/iPhone/i.test(u)) {
    const m = u.match(/iPhone OS ([\d_]+)/)
    return `iPhone${m ? ' iOS ' + m[1].replace(/_/g, '.') : ''}`
  }
  if (/Android/i.test(u)) return 'Android'
  if (/Macintosh/i.test(u)) return 'Mac'
  return u.slice(0, 40) || 'unknown'
}

async function main() {
  const admin = require('firebase-admin')
  const sa = loadSa()
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) })
  const db = admin.firestore()
  const tz = 'Europe/Madrid'

  // Find Sebas user(s)
  const usersSnap = await db.collection('familia_users').get()
  const sebasUsers = []
  for (const doc of usersSnap.docs) {
    const d = doc.data() || {}
    const key = String(d.activeMemberKey || d.memberKey || '').toLowerCase()
    const personas = Array.isArray(d.personas) ? d.personas.map(String) : []
    if (key === 'sebas' || personas.includes('sebas')) {
      sebasUsers.push({
        uid: doc.id,
        email: d.email || null,
        memberKey: d.memberKey || null,
        activeMemberKey: d.activeMemberKey || null,
        personas,
        reminderLeadMinutes: d.reminderLeadMinutes ?? null,
        personaLead: d.personaSettings?.sebas?.reminderLeadMinutes ?? null,
        displayName: d.displayName || null,
      })
    }
  }

  const sebasUids = new Set(sebasUsers.map((u) => u.uid))

  const subsSnap = await db.collection('familia_push_subs').get()
  const sebasSubs = []
  for (const doc of subsSnap.docs) {
    const d = doc.data() || {}
    const mk = String(d.memberKey || '').toLowerCase()
    const uid = d.uid || null
    const isSebas = mk === 'sebas' || sebasUids.has(uid) || sebasUids.has(doc.id)
    if (!isSebas) continue
    const updatedAt = d.updatedAt || null
    sebasSubs.push({
      id: doc.id.length > 40 ? doc.id.slice(0, 12) + '…' : doc.id,
      uid,
      memberKey: d.memberKey || null,
      enabled: d.enabled !== false,
      dead: !!d.dead,
      personaMirror: !!d.personaMirror,
      legacyUidDoc: !!d.legacyUidDoc,
      hasEndpoint: !!d.endpoint,
      hasKeys: !!(d.keys?.p256dh && d.keys?.auth),
      endpointHint: maskEndpoint(d.endpoint),
      device: uaHint(d.userAgent),
      updatedAt,
      updatedMadrid: updatedAt
        ? new Date(updatedAt).toLocaleString('es-ES', { timeZone: tz })
        : null,
      activeDevice:
        d.enabled !== false &&
        !d.dead &&
        !d.personaMirror &&
        !d.legacyUidDoc &&
        !!d.endpoint &&
        !!(d.keys?.p256dh && d.keys?.auth),
    })
  }

  const active = sebasSubs.filter((s) => s.activeDevice)

  // Last successful sends to sebas
  const sentSnap = await db.collection('familia_reminders_sent').get()
  const sebasSent = []
  for (const doc of sentSnap.docs) {
    const d = doc.data() || {}
    const mk = String(d.memberKey || '').toLowerCase()
    const delivered = Array.isArray(d.deliveredTo) ? d.deliveredTo.map(String) : []
    if (mk === 'sebas' || delivered.includes('sebas') || sebasUids.has(d.uid)) {
      sebasSent.push({
        id: doc.id,
        title: d.title || null,
        atMadrid: d.at ? new Date(d.at).toLocaleString('es-ES', { timeZone: tz }) : null,
        recipients: d.recipients ?? null,
        deliveredTo: delivered,
        leadMinutes: d.leadMinutes ?? null,
      })
    }
  }
  sebasSent.sort((a, b) => String(b.atMadrid).localeCompare(String(a.atMadrid)))

  const verdict =
    active.length > 0
      ? {
          enabled: true,
          summary_es: `SÍ: Sebas tiene ${active.length} suscripción(es) push activa(s).`,
        }
      : {
          enabled: false,
          summary_es:
            'NO: no hay suscripción push activa para Sebas (falta Activar avisos o quedó dead/sin endpoint).',
        }

  console.log(
    JSON.stringify(
      {
        ok: true,
        verdict,
        sebasUsers,
        sebasSubsCount: sebasSubs.length,
        activeCount: active.length,
        active,
        allSebasSubs: sebasSubs,
        lastSends: sebasSent.slice(0, 5),
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
