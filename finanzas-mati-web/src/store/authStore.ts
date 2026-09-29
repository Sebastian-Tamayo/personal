import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth'
import { create } from 'zustand'
import { getFirebaseAuth, isFirebaseConfigured } from '../lib/firebase'

interface AuthState {
  user: User | null
  loading: boolean
  error: string | null
  configured: boolean
  init: () => () => void
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  clearError: () => void
}

function mapAuthError(err: unknown): string {
  const code = typeof err === 'object' && err && 'code' in err ? String((err as { code: string }).code) : ''
  switch (code) {
    case 'auth/invalid-email':
      return 'Correo no válido.'
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Correo o contraseña incorrectos.'
    case 'auth/email-already-in-use':
      return 'Ese correo ya está registrado.'
    case 'auth/weak-password':
      return 'La contraseña debe tener al menos 6 caracteres.'
    case 'auth/too-many-requests':
      return 'Demasiados intentos. Espera un momento.'
    case 'auth/network-request-failed':
      return 'Error de red. Revisa tu conexión.'
    default:
      return 'No se pudo completar la autenticación.'
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  error: null,
  configured: isFirebaseConfigured(),

  init: () => {
    if (!isFirebaseConfigured()) {
      set({ loading: false, configured: false, user: null })
      return () => undefined
    }
    const auth = getFirebaseAuth()
    const unsub = onAuthStateChanged(auth, (user) => {
      set({ user, loading: false, configured: true })
    })
    return unsub
  },

  login: async (email, password) => {
    set({ error: null, loading: true })
    try {
      await signInWithEmailAndPassword(getFirebaseAuth(), email.trim(), password)
    } catch (err) {
      set({ error: mapAuthError(err), loading: false })
      throw err
    }
  },

  register: async (email, password) => {
    set({ error: null, loading: true })
    try {
      await createUserWithEmailAndPassword(getFirebaseAuth(), email.trim(), password)
    } catch (err) {
      set({ error: mapAuthError(err), loading: false })
      throw err
    }
  },

  logout: async () => {
    await signOut(getFirebaseAuth())
    set({ user: null })
  },

  clearError: () => set({ error: null }),
}))
