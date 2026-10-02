#!/usr/bin/env node
/**
 * One-shot / idempotent: migrate familia_users teo → hellen (displayName Hellen).
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
      rawKey === 'teo' ||
      rawKey === 'hija' ||
      personas.includes('teo') ||
      String(d.displayName || '') === 'Teo'

    if (!needs) continue

    const nextPersonas = [
      ...new Set(
        (personas.length ? personas : [rawKey || 'hellen'])
          .map((p) => (p === 'teo' || p === 'hija' ? 'hellen' : p))
          .filter((p) => p === 'sebas' || p === 'lore' || p === 'hellen'),
      ),
    ]
    const activeRaw = String(d.activeMemberKey || d.memberKey || 'hellen')
    let active = activeRaw === 'teo' || activeRaw === 'hija' ? 'hellen' : activeRaw
    if (email === 'teodoro31@gmail.com') {
      active = 'hellen'
      nextPersonas.length = 0
      nextPersonas.push('hellen')
    }
    if (!nextPersonas.includes(active)) active = nextPersonas[0] || 'hellen'

    const displayName =
      active === 'hellen' ? 'Hellen' : active === 'lore' ? 'Lore' : 'Sebas'
    const role = active === 'hellen' ? 'hijo' : 'adulto'

    const ps = { ...(d.personaSettings || {}) }
    if (ps.teo && !ps.hellen) ps.hellen = ps.teo
    delete ps.teo

    await doc.ref.set(
      {
        memberKey: active,
        activeMemberKey: active,
        personas: nextPersonas,
        personaSettings: ps,
        displayName,
        role,
        updatedAt: Date.now(),
        migratedTeoToHellen: true,
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
