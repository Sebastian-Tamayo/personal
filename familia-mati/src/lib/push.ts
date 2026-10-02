import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore'
import { getDb, isFirebaseConfigured } from './firebase'

const VAPID_PUBLIC = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined)?.trim() || ''
const LOCAL_DONE_KEY = 'familia-mati-push-enabled'
const SESSION_DISMISS_KEY = 'familia-mati-push-dismissed'

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

export function markPushEnabledLocally(endpoint: string) {
  try {
    localStorage.setItem(LOCAL_DONE_KEY, endpoint.slice(-32))
  } catch {
    /* ignore */
  }
}

export function clearPushEnabledLocally() {
  try {
    localStorage.removeItem(LOCAL_DONE_KEY)
  } catch {
    /* ignore */
  }
}

export function isPushEnabledLocally(): boolean {
  try {
    return Boolean(localStorage.getItem(LOCAL_DONE_KEY))
  } catch {
    return false
  }
}

export function dismissPushPromptSession() {
  try {
    sessionStorage.setItem(SESSION_DISMISS_KEY, '1')
  } catch {
    /* ignore */
  }
}

export function isPushPromptSessionDismissed(): boolean {
  try {
    return sessionStorage.getItem(SESSION_DISMISS_KEY) === '1'
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

/** True when this browser/device is fully opted in (permission + live subscription). */
export async function isThisDevicePushActive(): Promise<boolean> {
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return false
  }
  if (Notification.permission !== 'granted') return false
  if (isPushEnabledLocally()) {
    // Local success flag: don't nag even if SW is still waking up
    return true
  }
  try {
    const reg = await getServiceWorkerRegistration()
    if (!reg) return false
    const sub = await reg.pushManager.getSubscription()
    if (!sub?.endpoint) return false
    markPushEnabledLocally(sub.endpoint)
    return true
  } catch {
    return false
  }
}

export async function getPushStatus(uid?: string | null): Promise<PushStatus> {
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return 'unsupported'
  }
  if (!VAPID_PUBLIC) return 'missing-vapid'
  if (Notification.permission === 'denied') return 'denied'

  if (isPushEnabledLocally() && Notification.permission === 'granted') {
    return 'subscribed'
  }

  try {
    const reg = await getServiceWorkerRegistration()
    if (reg) {
      const sub = await reg.pushManager.getSubscription()
      if (Notification.permission === 'granted' && sub?.endpoint) {
        markPushEnabledLocally(sub.endpoint)
        return 'subscribed'
      }
    }
  } catch {
    /* ignore */
  }

  void uid
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

  markPushEnabledLocally(endpoint)
  try {
    sessionStorage.removeItem(SESSION_DISMISS_KEY)
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
      await sub.unsubscribe()
    }
  } catch {
    /* ignore */
  }

  if (endpoint) {
    try {
      const deviceId = await sha256Hex(endpoint)
      await deleteDoc(doc(getDb(), 'familia_push_subs', deviceId))
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

  clearPushEnabledLocally()
}
