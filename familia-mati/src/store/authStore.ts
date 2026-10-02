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
  defaultPersonaSettings,
  isHellenOwnEmail,
  isPersonaKey,
  memberByKey,
  normalizeMemberKey,
  normalizeReminderLeadMinutes,
  type MemberKey,
  type PersonaKey,
  type PersonaSettings,
  type UserProfile,
  type UserRole,
} from '../lib/family'
import { getDb, getFirebaseAuth, isFirebaseConfigured } from '../lib/firebase'

const ACTIVE_PERSONA_LS = 'familia-mati-active-persona'
const PICKER_DONE_SESSION = 'familia-mati-persona-picked'

interface AuthState {
  user: User | null
  profile: UserProfile | null
  /** Dual Lore+Hellen account: must pick persona after login. */
  needsPersonaPick: boolean
  loading: boolean
  error: string | null
  configured: boolean
  init: () => () => void
  login: (email: string, password: string) => Promise<void>
  register: (
    email: string,
    password: string,
    memberKey: MemberKey,
    opts?: { linkHellen?: boolean; linkTeo?: boolean },
  ) => Promise<void>
  logout: () => Promise<void>
  clearError: () => void
  isAdult: () => boolean
  setActivePersona: (key: PersonaKey) => Promise<void>
  addHellenPersona: () => Promise<void>
  /** @deprecated use addHellenPersona */
  addTeoPersona: () => Promise<void>
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
      return 'Ese correo ya está registrado. Si es el de Lore, entra y usa «Añadir perfil Hellen» o el selector Lore/Hellen.'
    case 'auth/weak-password':
      return 'La contraseña debe tener al menos 6 caracteres.'
    default:
      return 'No se pudo completar la autenticación.'
  }
}

function localActivePersona(uid: string): PersonaKey | null {
  try {
    const v = localStorage.getItem(`${ACTIVE_PERSONA_LS}:${uid}`)
    const n = normalizeMemberKey(v)
    return n && isPersonaKey(n) ? n : null
  } catch {
    return null
  }
}

function saveLocalActivePersona(uid: string, key: PersonaKey) {
  try {
    localStorage.setItem(`${ACTIVE_PERSONA_LS}:${uid}`, key)
  } catch {
    /* ignore */
  }
}

function pickerDoneThisSession(uid: string): boolean {
  try {
    return sessionStorage.getItem(`${PICKER_DONE_SESSION}:${uid}`) === '1'
  } catch {
    return false
  }
}

function markPickerDone(uid: string) {
  try {
    sessionStorage.setItem(`${PICKER_DONE_SESSION}:${uid}`, '1')
  } catch {
    /* ignore */
  }
}

function clearPickerDone(uid?: string) {
  try {
    if (uid) sessionStorage.removeItem(`${PICKER_DONE_SESSION}:${uid}`)
  } catch {
    /* ignore */
  }
}

/** Map legacy teo → hellen in personas lists. */
function parsePersonas(raw: unknown, fallback: PersonaKey): PersonaKey[] {
  if (Array.isArray(raw)) {
    const list = raw
      .map((x) => normalizeMemberKey(String(x)))
      .filter((x): x is PersonaKey => x !== null && isPersonaKey(x))
    if (list.length) return [...new Set(list)]
  }
  return [fallback]
}

function parsePersonaSettings(
  raw: unknown,
  personas: PersonaKey[],
  legacyLead: number,
): Partial<Record<PersonaKey, PersonaSettings>> {
  const out: Partial<Record<PersonaKey, PersonaSettings>> = {}
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  for (const p of personas) {
    // Prefer hellen settings; fall back to legacy teo key in Firestore
    const entry = obj[p] ?? (p === 'hellen' ? obj.teo : undefined)
    if (entry && typeof entry === 'object') {
      const lead = normalizeReminderLeadMinutes(
        (entry as { reminderLeadMinutes?: unknown }).reminderLeadMinutes ?? legacyLead,
      )
      out[p] = { reminderLeadMinutes: lead }
    } else {
      out[p] = defaultPersonaSettings(legacyLead)
    }
  }
  return out
}

function buildActiveProfile(
  uid: string,
  email: string,
  active: PersonaKey,
  personas: PersonaKey[],
  personaSettings: Partial<Record<PersonaKey, PersonaSettings>>,
  updatedAt: number,
): UserProfile {
  const norm = normalizeMemberKey(active)
  const persona: PersonaKey = norm && isPersonaKey(norm) ? norm : 'sebas'
  const member = memberByKey(persona)!
  const lead =
    personaSettings[persona]?.reminderLeadMinutes ?? DEFAULT_REMINDER_LEAD_MINUTES
  return {
    uid,
    email,
    memberKey: persona,
    role: (member.role === 'hijo' ? 'hijo' : 'adulto') as UserRole,
    displayName: member.name,
    reminderLeadMinutes: normalizeReminderLeadMinutes(lead),
    personas: personas.map((p) => {
      const n = normalizeMemberKey(p)
      return n && isPersonaKey(n) ? n : p
    }),
    personaSettings,
    updatedAt,
  }
}

async function loadOrCreateProfile(
  user: User,
  memberKey?: MemberKey,
  opts?: { linkHellen?: boolean; linkTeo?: boolean },
): Promise<{ profile: UserProfile; needsPersonaPick: boolean }> {
  const ref = doc(getDb(), 'familia_users', user.uid)
  const snap = await getDoc(ref)
  const email = user.email || ''
  const linkHellen = Boolean(opts?.linkHellen || opts?.linkTeo)

  if (snap.exists()) {
    const d = snap.data()
    const emailLower = String(d.email || email || '').trim()

    // Dedicated Hellen Auth account → always hellen-only
    if (isHellenOwnEmail(emailLower) || isHellenOwnEmail(email)) {
      const personas: PersonaKey[] = ['hellen']
      const legacyLead = normalizeReminderLeadMinutes(
        d.reminderLeadMinutes ?? DEFAULT_REMINDER_LEAD_MINUTES,
      )
      const personaSettings = parsePersonaSettings(d.personaSettings, personas, legacyLead)
      const profile = buildActiveProfile(
        user.uid,
        emailLower || email,
        'hellen',
        personas,
        personaSettings,
        Number(d.updatedAt) || Date.now(),
      )
      await setDoc(
        ref,
        {
          uid: user.uid,
          email: profile.email,
          memberKey: 'hellen',
          activeMemberKey: 'hellen',
          personas,
          personaSettings,
          role: 'hijo',
          displayName: 'Hellen',
          reminderLeadMinutes: profile.reminderLeadMinutes,
          updatedAt: Date.now(),
        },
        { merge: true },
      )
      markPickerDone(user.uid)
      return { profile, needsPersonaPick: false }
    }

    const rawKey = String(d.memberKey || d.activeMemberKey || 'sebas')
    const normalized = normalizeMemberKey(rawKey)
    const fallbackKey: PersonaKey =
      normalized && isPersonaKey(normalized) ? normalized : 'sebas'

    let personas = parsePersonas(d.personas, fallbackKey)
    if (fallbackKey === 'lore' && !personas.includes('lore')) personas = ['lore', ...personas]

    const legacyLead = normalizeReminderLeadMinutes(
      d.reminderLeadMinutes ?? DEFAULT_REMINDER_LEAD_MINUTES,
    )
    const personaSettings = parsePersonaSettings(d.personaSettings, personas, legacyLead)

    const dual = personas.includes('lore') && personas.includes('hellen')
    const storedRaw = String(d.activeMemberKey || '')
    const storedNorm = normalizeMemberKey(storedRaw)
    const storedActive: PersonaKey | null =
      storedNorm && isPersonaKey(storedNorm) ? storedNorm : null
    const localActive = localActivePersona(user.uid)
    const active: PersonaKey =
      (localActive && personas.includes(localActive) && localActive) ||
      (storedActive && personas.includes(storedActive) && storedActive) ||
      (personas.includes(fallbackKey) ? fallbackKey : personas[0])

    const needsPersonaPick = dual && !pickerDoneThisSession(user.uid)

    const profile = buildActiveProfile(
      user.uid,
      String(d.email || email),
      active,
      personas,
      personaSettings,
      Number(d.updatedAt) || Date.now(),
    )

    // Persist migration teo → hellen
    await setDoc(
      ref,
      {
        uid: user.uid,
        email: profile.email,
        memberKey: active,
        activeMemberKey: active,
        personas,
        personaSettings,
        role: profile.role,
        displayName: profile.displayName,
        reminderLeadMinutes: profile.reminderLeadMinutes,
        updatedAt: Date.now(),
      },
      { merge: true },
    )

    return { profile, needsPersonaPick }
  }

  // New account — dedicated Hellen email
  if (isHellenOwnEmail(email)) {
    const personas: PersonaKey[] = ['hellen']
    const personaSettings = parsePersonaSettings({}, personas, DEFAULT_REMINDER_LEAD_MINUTES)
    const profile = buildActiveProfile(
      user.uid,
      email,
      'hellen',
      personas,
      personaSettings,
      Date.now(),
    )
    await setDoc(ref, {
      uid: profile.uid,
      email: profile.email,
      memberKey: 'hellen',
      activeMemberKey: 'hellen',
      personas,
      personaSettings,
      role: 'hijo',
      displayName: 'Hellen',
      reminderLeadMinutes: profile.reminderLeadMinutes,
      updatedAt: profile.updatedAt,
    })
    markPickerDone(user.uid)
    return { profile, needsPersonaPick: false }
  }

  let key: PersonaKey = memberKey && isPersonaKey(memberKey) ? memberKey : 'sebas'
  const keyNorm = normalizeMemberKey(key)
  if (keyNorm && isPersonaKey(keyNorm)) key = keyNorm

  let personas: PersonaKey[] = [key]
  if (key === 'lore' && linkHellen) {
    personas = ['lore', 'hellen']
  }

  const personaSettings = parsePersonaSettings({}, personas, DEFAULT_REMINDER_LEAD_MINUTES)
  const dual = personas.includes('lore') && personas.includes('hellen')
  const active: PersonaKey = dual ? 'lore' : key
  const profile = buildActiveProfile(
    user.uid,
    email,
    active,
    personas,
    personaSettings,
    Date.now(),
  )

  await setDoc(ref, {
    uid: profile.uid,
    email: profile.email,
    memberKey: active,
    activeMemberKey: active,
    personas,
    personaSettings,
    role: profile.role,
    displayName: profile.displayName,
    reminderLeadMinutes: profile.reminderLeadMinutes,
    updatedAt: profile.updatedAt,
  })

  return { profile, needsPersonaPick: dual }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  needsPersonaPick: false,
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
          set({ user: null, profile: null, needsPersonaPick: false, loading: false })
          return
        }
        try {
          const { profile, needsPersonaPick } = await loadOrCreateProfile(user)
          set({ user, profile, needsPersonaPick, loading: false })
        } catch (err) {
          set({
            user,
            profile: null,
            needsPersonaPick: false,
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

  register: async (email, password, memberKey, opts) => {
    if (memberKey === 'bebe') throw new Error('El bebé no tiene cuenta')
    set({ error: null, loading: true })
    try {
      const cred = await createUserWithEmailAndPassword(getFirebaseAuth(), email.trim(), password)
      const { profile, needsPersonaPick } = await loadOrCreateProfile(cred.user, memberKey, {
        linkHellen: Boolean(opts?.linkHellen || opts?.linkTeo),
      })
      if (!needsPersonaPick) markPickerDone(cred.user.uid)
      set({ user: cred.user, profile, needsPersonaPick, loading: false })
    } catch (err) {
      set({ error: mapAuthError(err), loading: false })
      throw err
    }
  },

  logout: async () => {
    const uid = get().user?.uid
    clearPickerDone(uid)
    await signOut(getFirebaseAuth())
    set({ user: null, profile: null, needsPersonaPick: false })
  },

  clearError: () => set({ error: null }),

  isAdult: () => {
    const p = get().profile
    if (!p) return false
    if (p.memberKey === 'hellen' || p.role === 'hijo') return false
    return p.memberKey === 'sebas' || p.memberKey === 'lore' || p.role === 'adulto'
  },

  setActivePersona: async (key) => {
    const user = get().user
    const profile = get().profile
    if (!user || !profile) throw new Error('No hay sesión')
    const norm = normalizeMemberKey(key)
    const persona: PersonaKey = norm && isPersonaKey(norm) ? norm : key
    if (!profile.personas.includes(persona)) throw new Error('Perfil no disponible en esta cuenta')

    saveLocalActivePersona(user.uid, persona)
    markPickerDone(user.uid)

    const next = buildActiveProfile(
      user.uid,
      profile.email,
      persona,
      profile.personas,
      profile.personaSettings,
      Date.now(),
    )
    await setDoc(
      doc(getDb(), 'familia_users', user.uid),
      {
        memberKey: persona,
        activeMemberKey: persona,
        role: next.role,
        displayName: next.displayName,
        reminderLeadMinutes: next.reminderLeadMinutes,
        updatedAt: next.updatedAt,
      },
      { merge: true },
    )
    set({ profile: next, needsPersonaPick: false })
  },

  addHellenPersona: async () => {
    const user = get().user
    const profile = get().profile
    if (!user || !profile) throw new Error('No hay sesión')
    if (profile.personas.includes('hellen')) return
    if (!profile.personas.includes('lore') && profile.memberKey !== 'lore') {
      throw new Error('Solo la cuenta de Lore puede añadir el perfil Hellen.')
    }

    const personas: PersonaKey[] = [...new Set<PersonaKey>([...profile.personas, 'lore', 'hellen'])]
    const personaSettings = {
      ...profile.personaSettings,
      lore: profile.personaSettings.lore || defaultPersonaSettings(profile.reminderLeadMinutes),
      hellen: defaultPersonaSettings(),
    }
    const active = (profile.memberKey === 'hellen' ? 'hellen' : 'lore') as PersonaKey
    const next = buildActiveProfile(
      user.uid,
      profile.email,
      active,
      personas,
      personaSettings,
      Date.now(),
    )
    await setDoc(
      doc(getDb(), 'familia_users', user.uid),
      {
        personas,
        personaSettings,
        memberKey: active,
        activeMemberKey: active,
        role: next.role,
        displayName: next.displayName,
        reminderLeadMinutes: next.reminderLeadMinutes,
        updatedAt: next.updatedAt,
      },
      { merge: true },
    )
    clearPickerDone(user.uid)
    set({ profile: next, needsPersonaPick: true })
  },

  addTeoPersona: async () => {
    await get().addHellenPersona()
  },

  updateReminderLeadMinutes: async (minutes) => {
    const user = get().user
    const profile = get().profile
    if (!user || !profile) throw new Error('No hay sesión')
    const reminderLeadMinutes = normalizeReminderLeadMinutes(minutes)
    const keyNorm = normalizeMemberKey(profile.memberKey)
    const key: PersonaKey =
      keyNorm && isPersonaKey(keyNorm) ? keyNorm : (profile.memberKey as PersonaKey)
    const personaSettings = {
      ...profile.personaSettings,
      [key]: { reminderLeadMinutes },
    }
    const next: UserProfile = {
      ...profile,
      reminderLeadMinutes,
      personaSettings,
      updatedAt: Date.now(),
    }
    await setDoc(
      doc(getDb(), 'familia_users', user.uid),
      {
        personaSettings,
        reminderLeadMinutes,
        updatedAt: next.updatedAt,
      },
      { merge: true },
    )
    set({ profile: next })
  },
}))
