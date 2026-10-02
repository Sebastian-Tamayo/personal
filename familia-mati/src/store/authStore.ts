import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { create } from 'zustand'
import {
  DEFAULT_REMINDER_LEAD_MINUTES,
  memberByKey,
  normalizeMemberKey,
  normalizeReminderLeadMinutes,
  type MemberKey,
  type UserProfile,
  type UserRole,
} from '../lib/family'
import { getDb, getFirebaseAuth, isFirebaseConfigured } from '../lib/firebase'

interface AuthState {
  user: User | null
  profile: UserProfile | null
  loading: boolean
  error: string | null
  configured: boolean
  init: () => () => void
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, memberKey: MemberKey) => Promise<void>
  logout: () => Promise<void>
  clearError: () => void
  isAdult: () => boolean
  updateReminderLeadMinutes: (minutes: number) => Promise<void>
}

function mapAuthError(err: unknown): string {
  const code =
    typeof err === 'object' && err && 'code' in err ? String((err as { code: string }).code) : ''
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Correo o contraseña incorrectos.'
    case 'auth/email-already-in-use':
      return 'Ese correo ya está registrado.'
    case 'auth/weak-password':
      return 'La contraseña debe tener al menos 6 caracteres.'
    default:
      return 'No se pudo completar la autenticación.'
  }
}

async function loadOrCreateProfile(user: User, memberKey?: MemberKey): Promise<UserProfile> {
  const ref = doc(getDb(), 'familia_users', user.uid)
  const snap = await getDoc(ref)
  if (snap.exists()) {
    const d = snap.data()
    const rawKey = String(d.memberKey || 'sebas')
    const normalized = normalizeMemberKey(rawKey === 'hija' ? 'hellen' : rawKey)
    const memberKeyResolved: MemberKey =
      normalized && normalized !== 'todos' ? normalized : 'sebas'
    const member = memberByKey(memberKeyResolved)
    const displayFromDoc = String(d.displayName || '')
    const displayName =
      displayFromDoc === 'Hija' || !displayFromDoc
        ? member?.name || 'Sebas'
        : displayFromDoc
    const reminderLeadMinutes = normalizeReminderLeadMinutes(
      d.reminderLeadMinutes ?? DEFAULT_REMINDER_LEAD_MINUTES,
    )
    const profile: UserProfile = {
      uid: user.uid,
      email: String(d.email || user.email || ''),
      memberKey: memberKeyResolved,
      role: (d.role as UserRole) || (member?.role === 'hijo' ? 'hijo' : 'adulto'),
      displayName,
      reminderLeadMinutes,
      updatedAt: Number(d.updatedAt) || Date.now(),
    }
    // Persist rename / default lead if needed
    if (rawKey === 'hija' || displayFromDoc === 'Hija' || d.reminderLeadMinutes == null) {
      await setDoc(ref, { ...profile, updatedAt: Date.now() }, { merge: true })
    }
    return profile
  }
  const key = memberKey && memberKey !== 'bebe' ? memberKey : 'sebas'
  const member = memberByKey(key)!
  const profile: UserProfile = {
    uid: user.uid,
    email: user.email || '',
    memberKey: key,
    role: member.role === 'hijo' ? 'hijo' : 'adulto',
    displayName: member.name,
    reminderLeadMinutes: DEFAULT_REMINDER_LEAD_MINUTES,
    updatedAt: Date.now(),
  }
  await setDoc(ref, profile)
  return profile
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  loading: true,
  error: null,
  configured: isFirebaseConfigured(),

  init: () => {
    if (!isFirebaseConfigured()) {
      set({ loading: false, configured: false })
      return () => undefined
    }
    return onAuthStateChanged(getFirebaseAuth(), (user) => {
      void (async () => {
        if (!user) {
          set({ user: null, profile: null, loading: false })
          return
        }
        try {
          const profile = await loadOrCreateProfile(user)
          set({ user, profile, loading: false })
        } catch (err) {
          set({
            user,
            profile: null,
            loading: false,
            error: err instanceof Error ? err.message : 'Error de perfil',
          })
        }
      })()
    })
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

  register: async (email, password, memberKey) => {
    if (memberKey === 'bebe') throw new Error('El bebé no tiene cuenta')
    set({ error: null, loading: true })
    try {
      const cred = await createUserWithEmailAndPassword(getFirebaseAuth(), email.trim(), password)
      const profile = await loadOrCreateProfile(cred.user, memberKey)
      set({ user: cred.user, profile, loading: false })
    } catch (err) {
      set({ error: mapAuthError(err), loading: false })
      throw err
    }
  },

  logout: async () => {
    await signOut(getFirebaseAuth())
    set({ user: null, profile: null })
  },

  clearError: () => set({ error: null }),

  isAdult: () => {
    const p = get().profile
    if (!p) return false
    if (p.memberKey === 'hellen' || p.role === 'hijo') return false
    return p.role === 'adulto' || p.memberKey === 'sebas' || p.memberKey === 'lore'
  },

  updateReminderLeadMinutes: async (minutes) => {
    const user = get().user
    const profile = get().profile
    if (!user || !profile) throw new Error('No hay sesión')
    const reminderLeadMinutes = normalizeReminderLeadMinutes(minutes)
    const next: UserProfile = {
      ...profile,
      reminderLeadMinutes,
      updatedAt: Date.now(),
    }
    await setDoc(doc(getDb(), 'familia_users', user.uid), { reminderLeadMinutes, updatedAt: next.updatedAt }, { merge: true })
    set({ profile: next })
  },
}))
