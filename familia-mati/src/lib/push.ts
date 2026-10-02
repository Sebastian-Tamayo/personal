import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore'
import { getDb, isFirebaseConfigured } from './firebase'

const VAPID_PUBLIC = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined)?.trim() || ''

export function isPushConfigured(): boolean {
  return Boolean(VAPID_PUBLIC && isFirebaseConfigured() && 'serviceWorker' in navigator && 'PushManager' in window)
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export type PushStatus = 'unsupported' | 'missing-vapid' | 'denied' | 'default' | 'subscribed' | 'unsubscribed'

export async function getPushStatus(uid?: string | null): Promise<PushStatus> {
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return 'unsupported'
  }
  if (!VAPID_PUBLIC) return 'missing-vapid'
  if (Notification.permission === 'denied') return 'denied'
  if (!uid) return Notification.permission === 'granted' ? 'unsubscribed' : 'default'
  try {
    const snap = await getDoc(doc(getDb(), 'familia_push_subs', uid))
    if (snap.exists() && snap.data()?.endpoint) return 'subscribed'
  } catch {
    /* ignore */
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
  await setDoc(
    doc(getDb(), 'familia_push_subs', uid),
    {
      uid,
      memberKey,
      endpoint: json.endpoint || sub.endpoint,
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
}

export async function disablePushNotifications(uid: string): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) await sub.unsubscribe()
  } catch {
    /* ignore */
  }
  try {
    await deleteDoc(doc(getDb(), 'familia_push_subs', uid))
  } catch {
    await setDoc(doc(getDb(), 'familia_push_subs', uid), { enabled: false, updatedAt: Date.now() }, { merge: true })
  }
}
