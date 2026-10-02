#!/usr/bin/env node
/**
 * Dry-run targeting matrix: prove sebas→only sebas, todos→enabled household.
 * No pushes sent. Uses FIREBASE_SERVICE_ACCOUNT_JSON.
 */
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

const HOUSEHOLD = new Set(['sebas', 'lore', 'hellen'])

function normalizeAssignee(raw) {
  const v = String(raw || '')
    .trim()
    .toLowerCase()
  if (!v) return null
  if (v === 'todos' || v === 'all' || v === 'everyone') return 'todos'
  if (v === 'hija' || v === 'teo') return 'hellen'
  if (HOUSEHOLD.has(v)) return v
  return null
}

function recipientsForItem(item, subs) {
  const who = normalizeAssignee(item.assignee ?? item.para)
  if (!who) return []
  if (who === 'todos') {
    return subs.filter((s) => {
      const mk = normalizeAssignee(s.memberKey)
      return mk && HOUSEHOLD.has(mk)
    })
  }
  return subs.filter((s) => normalizeAssignee(s.memberKey) === who)
}

async function main() {
  const admin = require('firebase-admin')
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) })
  const db = admin.firestore()
  const snap = await db.collection('familia_push_subs').get()
  const subs = snap.docs
    .map((d) => {
      const x = d.data() || {}
      return {
        id: d.id.slice(0, 10) + '…',
        memberKey: normalizeAssignee(x.memberKey),
        enabled: x.enabled !== false,
        dead: !!x.dead,
        personaMirror: !!x.personaMirror,
        legacyUidDoc: !!x.legacyUidDoc,
        hasEndpoint: !!x.endpoint,
      }
    })
    .filter(
      (s) =>
        s.enabled &&
        !s.dead &&
        !s.personaMirror &&
        !s.legacyUidDoc &&
        s.hasEndpoint &&
        s.memberKey &&
        HOUSEHOLD.has(s.memberKey),
    )

  const cases = ['sebas', 'lore', 'hellen', 'todos', '', null, 'garbage']
  const matrix = {}
  for (const a of cases) {
    const label = a === '' || a == null ? '(empty)' : String(a)
    const rec = recipientsForItem({ assignee: a }, subs)
    const keys = [...new Set(rec.map((r) => r.memberKey))]
    let ok = true
    if (!a || a === 'garbage') ok = keys.length === 0
    else if (a === 'todos') ok = keys.every((k) => HOUSEHOLD.has(k))
    else ok = keys.every((k) => k === a)
    matrix[label] = { recipientKeys: keys, count: rec.length, ok }
  }

  console.log(
    JSON.stringify(
      {
        ok: Object.values(matrix).every((m) => m.ok),
        activeSubsByMember: subs.reduce((acc, s) => {
          acc[s.memberKey] = (acc[s.memberKey] || 0) + 1
          return acc
        }, {}),
        matrix,
        rule: 'Notify ONLY item.assignee; todos=all enabled; empty/invalid=nobody',
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
