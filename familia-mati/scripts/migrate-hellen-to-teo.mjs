#!/usr/bin/env node
/**
 * One-shot / idempotent: migrate familia_users hellen → teo (displayName Teo).
 * Uses FIREBASE_SERVICE_ACCOUNT_JSON (Actions) or GOOGLE_APPLICATION_CREDENTIALS.
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

async function main() {
  const admin = require('firebase-admin')
  const sa = loadSa()
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(sa) })
  }
  const db = admin.firestore()
  const snap = await db.collection('familia_users').get()
  let updated = 0
  for (const doc of snap.docs) {
    const d = doc.data() || {}
    const email = String(d.email || '').trim().toLowerCase()
    const rawKey = String(d.memberKey || d.activeMemberKey || '')
    const personas = Array.isArray(d.personas) ? d.personas.map(String) : []
    const needs =
      email === 'teodoro31@gmail.com' ||
      rawKey === 'hellen' ||
      rawKey === 'hija' ||
      personas.includes('hellen') ||
      String(d.displayName || '') === 'Hellen'

    if (!needs) continue

    const nextPersonas = [
      ...new Set(
        (personas.length ? personas : [rawKey || 'teo'])
          .map((p) => (p === 'hellen' || p === 'hija' ? 'teo' : p))
          .filter((p) => p === 'sebas' || p === 'lore' || p === 'teo'),
      ),
    ]
    const activeRaw = String(d.activeMemberKey || d.memberKey || 'teo')
    let active =
      activeRaw === 'hellen' || activeRaw === 'hija' ? 'teo' : activeRaw
    if (email === 'teodoro31@gmail.com') {
      active = 'teo'
      nextPersonas.length = 0
      nextPersonas.push('teo')
    }
    if (!nextPersonas.includes(active)) active = nextPersonas[0] || 'teo'

    const displayName = active === 'teo' ? 'Teo' : active === 'lore' ? 'Lore' : 'Sebas'
    const role = active === 'teo' ? 'hijo' : 'adulto'

    // Migrate personaSettings.hellen → teo
    const ps = { ...(d.personaSettings || {}) }
    if (ps.hellen && !ps.teo) ps.teo = ps.hellen
    delete ps.hellen

    await doc.ref.set(
      {
        memberKey: active,
        activeMemberKey: active,
        personas: nextPersonas,
        personaSettings: ps,
        displayName,
        role,
        updatedAt: Date.now(),
        migratedHellenToTeo: true,
      },
      { merge: true },
    )
    updated++
    console.log('migrated', doc.id, email, '→', active, displayName)
  }
  console.log(JSON.stringify({ ok: true, updated, scanned: snap.size }))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
