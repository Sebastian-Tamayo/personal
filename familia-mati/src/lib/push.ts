import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore'
import { getDb, isFirebaseConfigured } from './firebase'

const VAPID_PUBLIC = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined)?.trim() || ''
const LEGACY_LOCAL_DONE_KEY = 'familia-mati-push-enabled'
const LEGACY_SESSION_DISMISS_KEY = 'familia-mati-push-dismissed'
const LEGACY_UID_DONE_PREFIX = 'familia-mati-push-enabled:'
const LEGACY_UID_DISMISS_PREFIX = 'familia-mati-push-dismissed:'

function localDoneKey(uid: string, memberKey: string) {
  return `familia-mati-push-enabled:${uid}:${memberKey}`
}

function sessionDismissKey(uid: string, memberKey: string) {
  return `familia-mati-push-dismissed:${uid}:${memberKey}`
}

export function isPushConfigured(): boolean {
  return Boolean(
    VAPID_PUBLIC && isFirebaseConfigured() && 'serviceWorker' in navigator && 'PushManager' in window,
  )
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Mark push enabled for THIS Auth uid + active persona only. */
export function markPushEnabledLocally(uid: string, memberKey: string, endpoint: string) {
  try {
    localStorage.setItem(localDoneKey(uid, memberKey), endpoint.slice(-32))
    localStorage.removeItem(LEGACY_LOCAL_DONE_KEY)
    localStorage.removeItem(`${LEGACY_UID_DONE_PREFIX}${uid}`)
  } catch {
    /* ignore */
  }
}

export function clearPushEnabledLocally(uid?: string, memberKey?: string) {
  try {
    if (uid && memberKey) localStorage.removeItem(localDoneKey(uid, memberKey))
    if (uid) localStorage.removeItem(`${LEGACY_UID_DONE_PREFIX}${uid}`)
    localStorage.removeItem(LEGACY_LOCAL_DONE_KEY)
  } catch {
    /* ignore */
  }
}

export function isPushEnabledLocally(uid: string, memberKey: string): boolean {
  try {
    return Boolean(localStorage.getItem(localDoneKey(uid, memberKey)))
  } catch {
    return false
  }
}

export function dismissPushPromptSession(uid: string, memberKey: string) {
  try {
    sessionStorage.setItem(sessionDismissKey(uid, memberKey), '1')
    sessionStorage.removeItem(LEGACY_SESSION_DISMISS_KEY)
    sessionStorage.removeItem(`${LEGACY_UID_DISMISS_PREFIX}${uid}`)
  } catch {
    /* ignore */
  }
}

export function isPushPromptSessionDismissed(uid: string, memberKey: string): boolean {
  try {
    return sessionStorage.getItem(sessionDismissKey(uid, memberKey)) === '1'
  } catch {
    return false
  }
}

export type PushStatus =
  | 'unsupported'
  | 'missing-vapid'
  | 'denied'
  | 'default'
  | 'subscribed'
  | 'unsubscribed'

async function getServiceWorkerRegistration(timeoutMs = 4000): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  try {
    const ready = navigator.serviceWorker.ready
    const timed = new Promise<null>((resolve) => {
      window.setTimeout(() => resolve(null), timeoutMs)
    })
    return (await Promise.race([ready, timed])) as ServiceWorkerRegistration | null
  } catch {
    return null
  }
}

/**
 * True when THIS persona (memberKey) on this Auth account enabled push on this browser.
 * Lore enabling does not hide Hellen's Activar avisos (and vice versa).
 */
export async function isThisUserPushActive(uid: string, memberKey: string): Promise<boolean> {
  if (!uid || !memberKey) return false
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return false
  }
  if (Notification.permission !== 'granted') return false

  if (isPushEnabledLocally(uid, memberKey)) return true

  try {
    const reg = await getServiceWorkerRegistration()
    if (!reg) return false
    const sub = await reg.pushManager.getSubscription()
    if (!sub?.endpoint) return false
    const deviceId = await sha256Hex(sub.endpoint)
    const snap = await getDoc(doc(getDb(), 'familia_push_subs', deviceId))
    if (snap.exists()) {
      const data = snap.data() || {}
      if (
        data.enabled !== false &&
        !data.dead &&
        String(data.uid || '') === uid &&
        String(data.memberKey || '') === memberKey
      ) {
        markPushEnabledLocally(uid, memberKey, sub.endpoint)
        return true
      }
    }
    // Persona-scoped mirror doc
    const personaDoc = await getDoc(doc(getDb(), 'familia_push_subs', `${uid}_${memberKey}`))
    if (personaDoc.exists()) {
      const data = personaDoc.data() || {}
      if (data.enabled !== false && !data.dead && data.endpoint) {
        markPushEnabledLocally(uid, memberKey, String(data.endpoint))
        return true
      }
    }
  } catch {
    /* ignore */
  }
  return false
}

export async function getPushStatus(uid: string, memberKey: string): Promise<PushStatus> {
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return 'unsupported'
  }
  if (!VAPID_PUBLIC) return 'missing-vapid'
  if (Notification.permission === 'denied') return 'denied'

  if (uid && memberKey && (await isThisUserPushActive(uid, memberKey))) {
    return 'subscribed'
  }

  return Notification.permission === 'granted' ? 'unsubscribed' : 'default'
}

export async function enablePushNotifications(uid: string, memberKey: string): Promise<void> {
  if (!isPushConfigured()) throw new Error('Avisos no disponibles en este dispositivo o falta VAPID.')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Permiso de notificaciones denegado.')

  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC) as BufferSource,
    })
  }

  const json = sub.toJSON()
  const endpoint = json.endpoint || sub.endpoint
  const deviceId = await sha256Hex(endpoint)
  const keys = {
    p256dh: json.keys?.p256dh || '',
    auth: json.keys?.auth || '',
  }
  const payload = {
    uid,
    memberKey,
    deviceId,
    endpoint,
    keys,
    userAgent: navigator.userAgent.slice(0, 240),
    updatedAt: Date.now(),
    enabled: true,
  }

  // Device endpoint doc — current active persona owns delivery on this phone
  await setDoc(doc(getDb(), 'familia_push_subs', deviceId), payload, { merge: true })

  // Per-persona mirror so Lore/Hellen each keep an "enabled" record on shared Auth
  await setDoc(doc(getDb(), 'familia_push_subs', `${uid}_${memberKey}`), {
    ...payload,
    personaMirror: true,
  }, { merge: true })

  markPushEnabledLocally(uid, memberKey, endpoint)
  try {
    sessionStorage.removeItem(sessionDismissKey(uid, memberKey))
  } catch {
    /* ignore */
  }
}

export async function disablePushNotifications(uid: string, memberKey: string): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      const deviceId = await sha256Hex(sub.endpoint)
      const snap = await getDoc(doc(getDb(), 'familia_push_subs', deviceId))
      const data = snap.exists() ? snap.data() : null
      if (
        data &&
        String(data.uid || '') === uid &&
        String(data.memberKey || '') === memberKey
      ) {
        await sub.unsubscribe()
        await deleteDoc(doc(getDb(), 'familia_push_subs', deviceId))
      }
    }
  } catch {
    /* ignore */
  }

  try {
    await setDoc(
      doc(getDb(), 'familia_push_subs', `${uid}_${memberKey}`),
      { enabled: false, dead: true, updatedAt: Date.now() },
      { merge: true },
    )
  } catch {
    /* ignore */
  }

  clearPushEnabledLocally(uid, memberKey)
}
