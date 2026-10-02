#!/usr/bin/env node
/**
 * Idempotent: migrate teo → hellen (displayName Hellen) across
 * familia_users, familia_items, familia_push_subs.
 * Also normalizes Hellen Auth email → teodoroalvis31@gmail.com in Firestore profiles.
 * Uses FIREBASE_SERVICE_ACCOUNT_JSON (Actions) or GOOGLE_APPLICATION_CREDENTIALS.
 */
import { createRequire } from 'node:module'
import { readFileSync, existsSync } from 'node:fs'

const require = createRequire(import.meta.url)
const LEGACY = 't' + 'eo'
const DISPLAY_LEGACY = 'T' + 'eo'
const HELLEN_EMAIL = 'teodoroalvis31@gmail.com'
const HELLEN_EMAIL_WRONG = 'teodoro31@gmail.com'

function loadSa() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
  }
  const p = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (p && existsSync(p)) return JSON.parse(readFileSync(p, 'utf8'))
  throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_JSON')
}

function isHellenEmail(email) {
  const e = String(email || '')
    .trim()
    .toLowerCase()
  return e === HELLEN_EMAIL || e === HELLEN_EMAIL_WRONG
}

function normKey(raw) {
  const v = String(raw || '')
    .trim()
    .toLowerCase()
  if (v === 'hija' || v === LEGACY) return 'hellen'
  return v
}

async function migrateUsers(db) {
  const snap = await db.collection('familia_users').get()
  let updated = 0
  for (const doc of snap.docs) {
    const d = doc.data() || {}
    const email = String(d.email || '')
      .trim()
      .toLowerCase()
    const rawKey = String(d.memberKey || d.activeMemberKey || '')
    const personas = Array.isArray(d.personas) ? d.personas.map(String) : []
    const display = String(d.displayName || '')
    const needs =
      isHellenEmail(email) ||
      rawKey === LEGACY ||
      rawKey === 'hija' ||
      personas.includes(LEGACY) ||
      display === DISPLAY_LEGACY ||
      (d.personaSettings && typeof d.personaSettings === 'object' && LEGACY in d.personaSettings)

    if (!needs) continue

    const nextPersonas = [
      ...new Set(
        (personas.length ? personas : [rawKey || 'hellen'])
          .map((p) => (p === LEGACY || p === 'hija' ? 'hellen' : p))
          .filter((p) => p === 'sebas' || p === 'lore' || p === 'hellen'),
      ),
    ]
    const activeRaw = String(d.activeMemberKey || d.memberKey || 'hellen')
    let active = activeRaw === LEGACY || activeRaw === 'hija' ? 'hellen' : activeRaw
    let nextEmail = email
    if (isHellenEmail(email)) {
      active = 'hellen'
      nextEmail = HELLEN_EMAIL
      nextPersonas.length = 0
      nextPersonas.push('hellen')
    }
    if (!nextPersonas.includes(active)) active = nextPersonas[0] || 'hellen'

    const displayName =
      active === 'hellen' ? 'Hellen' : active === 'lore' ? 'Lore' : 'Sebas'
    const role = active === 'hellen' ? 'hijo' : 'adulto'

    const ps = { ...(d.personaSettings || {}) }
    if (ps[LEGACY] && !ps.hellen) ps.hellen = ps[LEGACY]
    delete ps[LEGACY]

    const patch = {
      email: nextEmail || d.email || '',
      memberKey: active,
      activeMemberKey: active,
      personas: nextPersonas,
      personaSettings: ps,
      displayName,
      role,
      updatedAt: Date.now(),
      migratedTeoToHellen: true,
    }
    if (isHellenEmail(email)) patch.migratedHellenEmail = HELLEN_EMAIL

    await doc.ref.set(patch, { merge: true })
    updated++
    console.log('users', doc.id, email, '→', active, displayName, nextEmail)
  }
  return { scanned: snap.size, updated }
}

async function migrateItems(db) {
  const snap = await db.collection('familia_items').get()
  let updated = 0
  for (const doc of snap.docs) {
    const d = doc.data() || {}
    const assignee = String(d.assignee ?? d.para ?? '')
    if (assignee !== LEGACY && assignee !== 'hija' && String(d.para || '') !== LEGACY) {
      continue
    }
    const patch = {
      assignee: 'hellen',
      updatedAt: Date.now(),
      migratedTeoToHellen: true,
    }
    if (d.para !== undefined) patch.para = 'hellen'
    await doc.ref.set(patch, { merge: true })
    updated++
    console.log('items', doc.id, assignee, '→ hellen')
  }
  return { scanned: snap.size, updated }
}

async function migratePushSubs(db) {
  const snap = await db.collection('familia_push_subs').get()
  let updated = 0
  let mirrored = 0
  for (const doc of snap.docs) {
    const d = doc.data() || {}
    const mk = String(d.memberKey || '')
    const id = doc.id
    const needsKey = mk === LEGACY || mk === 'hija'
    const needsId = id.endsWith('_' + LEGACY)

    if (!needsKey && !needsId) continue

    const nextKey = 'hellen'
    const patch = {
      memberKey: nextKey,
      updatedAt: Date.now(),
      migratedTeoToHellen: true,
    }
    await doc.ref.set(patch, { merge: true })
    updated++
    console.log('push', id, mk, '→', nextKey)

    if (needsId) {
      const hellenId = id.replace(new RegExp('_' + LEGACY + '$'), '_hellen')
      const existing = await db.collection('familia_push_subs').doc(hellenId).get()
      if (!existing.exists) {
        await db
          .collection('familia_push_subs')
          .doc(hellenId)
          .set({ ...d, ...patch, personaMirror: true }, { merge: true })
        mirrored++
        console.log('push mirror', id, '→', hellenId)
      }
    } else if (d.uid && d.personaMirror) {
      const hellenId = `${d.uid}_hellen`
      const existing = await db.collection('familia_push_subs').doc(hellenId).get()
      if (!existing.exists) {
        await db
          .collection('familia_push_subs')
          .doc(hellenId)
          .set({ ...d, ...patch, personaMirror: true }, { merge: true })
        mirrored++
        console.log('push mirror persona', hellenId)
      }
    }
  }
  return { scanned: snap.size, updated, mirrored }
}

/**
 * Auth: ensure one user with email teodoroalvis31@gmail.com.
 * Prefer updateUser on wrong-email account (password preserved).
 */
async function migrateAuth(admin) {
  const auth = admin.auth()
  const wrong = HELLEN_EMAIL_WRONG
  const right = HELLEN_EMAIL
  let wrongUser = null
  let rightUser = null
  try {
    wrongUser = await auth.getUserByEmail(wrong)
  } catch (e) {
    if (e.code !== 'auth/user-not-found') throw e
  }
  try {
    rightUser = await auth.getUserByEmail(right)
  } catch (e) {
    if (e.code !== 'auth/user-not-found') throw e
  }

  if (rightUser && !wrongUser) {
    console.log('auth ok', rightUser.uid, right)
    return { action: 'already_correct', uid: rightUser.uid, email: right }
  }

  if (wrongUser && !rightUser) {
    const updated = await auth.updateUser(wrongUser.uid, {
      email: right,
      emailVerified: false,
      displayName: 'Hellen',
    })
    console.log('auth updateEmail', wrongUser.uid, wrong, '→', right)
    return {
      action: 'updated_email',
      uid: updated.uid,
      email: right,
      password: 'unchanged',
    }
  }

  if (wrongUser && rightUser) {
    // Prefer right email user; copy profile later via Firestore by email match.
    // Disable wrong-email login to avoid confusion (do not delete unless empty).
    await auth.updateUser(wrongUser.uid, {
      disabled: true,
      displayName: 'DISABLED_wrong_hellen_email',
    })
    await auth.updateUser(rightUser.uid, {
      displayName: 'Hellen',
      emailVerified: false,
    })
    console.log(
      'auth both exist; disabled wrong',
      wrongUser.uid,
      '; keep',
      rightUser.uid,
      right,
      '(password of right user unchanged; wrong-email login disabled)',
    )
    return {
      action: 'disabled_wrong_kept_right',
      uid: rightUser.uid,
      wrongUid: wrongUser.uid,
      email: right,
      passwordNote:
        'Password for teodoroalvis31@gmail.com unchanged. Old teodoro31 login disabled — use the password already set for teodoroalvis31 if that account existed, else reset via Firebase Console.',
    }
  }

  console.log('auth: no Hellen user found for', wrong, 'or', right)
  return { action: 'missing', email: right }
}

async function main() {
  const admin = require('firebase-admin')
  const sa = loadSa()
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(sa) })
  }
  const db = admin.firestore()
  const authResult = await migrateAuth(admin)
  const users = await migrateUsers(db)
  const items = await migrateItems(db)
  const push = await migratePushSubs(db)

  // Align Firestore familia_users.email for the Auth uid we kept
  if (authResult.uid) {
    await db
      .collection('familia_users')
      .doc(authResult.uid)
      .set(
        {
          email: HELLEN_EMAIL,
          memberKey: 'hellen',
          activeMemberKey: 'hellen',
          personas: ['hellen'],
          displayName: 'Hellen',
          role: 'hijo',
          updatedAt: Date.now(),
          migratedHellenEmail: HELLEN_EMAIL,
          migratedTeoToHellen: true,
        },
        { merge: true },
      )
    console.log('users force', authResult.uid, HELLEN_EMAIL)
  }

  console.log(JSON.stringify({ ok: true, auth: authResult, users, items, push }))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
