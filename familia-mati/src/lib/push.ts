import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore'
import { getDb, isFirebaseConfigured } from './firebase'

const VAPID_PUBLIC = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined)?.trim() || ''
/** Legacy device-wide key — migrated away; kept only to clear old state. */
const LEGACY_LOCAL_DONE_KEY = 'familia-mati-push-enabled'
const LEGACY_SESSION_DISMISS_KEY = 'familia-mati-push-dismissed'

function localDoneKey(uid: string) {
  return `familia-mati-push-enabled:${uid}`
}

function sessionDismissKey(uid: string) {
  return `familia-mati-push-dismissed:${uid}`
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

/** Mark push enabled for THIS logged-in user only (not household-wide). */
export function markPushEnabledLocally(uid: string, endpoint: string) {
  try {
    localStorage.setItem(localDoneKey(uid), endpoint.slice(-32))
    // Clear legacy global flag so other profiles are not auto-hidden
    localStorage.removeItem(LEGACY_LOCAL_DONE_KEY)
  } catch {
    /* ignore */
  }
}

export function clearPushEnabledLocally(uid?: string) {
  try {
    if (uid) localStorage.removeItem(localDoneKey(uid))
    localStorage.removeItem(LEGACY_LOCAL_DONE_KEY)
  } catch {
    /* ignore */
  }
}

/** True only if THIS user previously enabled on this browser. */
export function isPushEnabledLocally(uid: string): boolean {
  try {
    return Boolean(localStorage.getItem(localDoneKey(uid)))
  } catch {
    return false
  }
}

/** Soft-dismiss for THIS user for this visit only. */
export function dismissPushPromptSession(uid: string) {
  try {
    sessionStorage.setItem(sessionDismissKey(uid), '1')
    sessionStorage.removeItem(LEGACY_SESSION_DISMISS_KEY)
  } catch {
    /* ignore */
  }
}

export function isPushPromptSessionDismissed(uid: string): boolean {
  try {
    return sessionStorage.getItem(sessionDismissKey(uid)) === '1'
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
 * True when THIS logged-in user has successfully enabled push on this browser.
 * Other household profiles still see Activar avisos until they enable themselves.
 */
export async function isThisUserPushActive(uid: string): Promise<boolean> {
  if (!uid) return false
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return false
  }
  if (Notification.permission !== 'granted') return false

  if (isPushEnabledLocally(uid)) {
    return true
  }

  // Live subscription only counts if Firestore ties it to this uid
  try {
    const reg = await getServiceWorkerRegistration()
    if (!reg) return false
    const sub = await reg.pushManager.getSubscription()
    if (!sub?.endpoint) return false
    const deviceId = await sha256Hex(sub.endpoint)
    const snap = await getDoc(doc(getDb(), 'familia_push_subs', deviceId))
    if (snap.exists()) {
      const data = snap.data() || {}
      if (data.enabled !== false && !data.dead && String(data.uid || '') === uid) {
        markPushEnabledLocally(uid, sub.endpoint)
        return true
      }
    }
    // Legacy uid-keyed doc
    const legacy = await getDoc(doc(getDb(), 'familia_push_subs', uid))
    if (legacy.exists()) {
      const data = legacy.data() || {}
      if (data.enabled !== false && !data.dead && data.endpoint) {
        markPushEnabledLocally(uid, String(data.endpoint))
        return true
      }
    }
  } catch {
    /* ignore */
  }
  return false
}

export async function getPushStatus(uid: string): Promise<PushStatus> {
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return 'unsupported'
  }
  if (!VAPID_PUBLIC) return 'missing-vapid'
  if (Notification.permission === 'denied') return 'denied'

  if (uid && (await isThisUserPushActive(uid))) {
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

  await setDoc(
    doc(getDb(), 'familia_push_subs', deviceId),
    {
      uid,
      memberKey,
      deviceId,
      endpoint,
      keys: {
        p256dh: json.keys?.p256dh || '',
        auth: json.keys?.auth || '',
      },
      userAgent: navigator.userAgent.slice(0, 240),
      updatedAt: Date.now(),
      enabled: true,
    },
    { merge: true },
  )

  // Keep legacy uid doc in sync for older installs (optional mirror)
  await setDoc(
    doc(getDb(), 'familia_push_subs', uid),
    {
      uid,
      memberKey,
      endpoint,
      keys: {
        p256dh: json.keys?.p256dh || '',
        auth: json.keys?.auth || '',
      },
      userAgent: navigator.userAgent.slice(0, 240),
      updatedAt: Date.now(),
      enabled: true,
      legacyUidDoc: true,
    },
    { merge: true },
  )

  markPushEnabledLocally(uid, endpoint)
  try {
    sessionStorage.removeItem(sessionDismissKey(uid))
    sessionStorage.removeItem(LEGACY_SESSION_DISMISS_KEY)
  } catch {
    /* ignore */
  }
}

export async function disablePushNotifications(uid: string): Promise<void> {
  let endpoint = ''
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      endpoint = sub.endpoint
      // Only unsubscribe if this device sub belongs to this uid
      const deviceId = await sha256Hex(endpoint)
      const snap = await getDoc(doc(getDb(), 'familia_push_subs', deviceId))
      const owner = snap.exists() ? String(snap.data()?.uid || '') : ''
      if (!owner || owner === uid) {
        await sub.unsubscribe()
      }
    }
  } catch {
    /* ignore */
  }

  if (endpoint) {
    try {
      const deviceId = await sha256Hex(endpoint)
      const snap = await getDoc(doc(getDb(), 'familia_push_subs', deviceId))
      if (snap.exists() && String(snap.data()?.uid || '') === uid) {
        await deleteDoc(doc(getDb(), 'familia_push_subs', deviceId))
      }
    } catch {
      /* ignore */
    }
  }

  try {
    const legacy = await getDoc(doc(getDb(), 'familia_push_subs', uid))
    if (legacy.exists()) {
      await setDoc(doc(getDb(), 'familia_push_subs', uid), { enabled: false, updatedAt: Date.now() }, { merge: true })
    }
  } catch {
    /* ignore */
  }

  clearPushEnabledLocally(uid)
}
