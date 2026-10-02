import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const FINANZAS_URL =
  (import.meta.env.VITE_FINANZAS_URL as string)?.trim() ||
  'https://sebastian-tamayo.github.io/personal/'

/** Always absolute Pages root (never /familia/). */
export function financiasHref(): string {
  const raw = FINANZAS_URL
  try {
    const u = new URL(raw, 'https://sebastian-tamayo.github.io')
    // Guard against misconfigured env pointing at familia
    if (u.pathname.includes('/familia')) {
      return 'https://sebastian-tamayo.github.io/personal/'
    }
    return u.href.endsWith('/') ? u.href : `${u.href}/`
  } catch {
    return 'https://sebastian-tamayo.github.io/personal/'
  }
}

export function isFirebaseConfigured(): boolean {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.projectId &&
      firebaseConfig.appId &&
      !String(firebaseConfig.apiKey).startsWith('your-'),
  )
}

let app: FirebaseApp | null = null
let auth: Auth | null = null
let db: Firestore | null = null

export function getFirebaseApp(): FirebaseApp {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase no configurado. Copia .env.example a .env')
  }
  if (!app) app = initializeApp(firebaseConfig)
  return app
}

export function getFirebaseAuth(): Auth {
  if (!auth) auth = getAuth(getFirebaseApp())
  return auth
}

export function getDb(): Firestore {
  if (!db) db = getFirestore(getFirebaseApp())
  return db
}
