import { Delete, Lock, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

const SESSION_KEY = 'familia-mati-finanzas-unlock'
const PIN =
  (import.meta.env.VITE_FINANZAS_PIN as string | undefined)?.trim() || '1234'

export function isFinanzasUnlocked(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === '1'
  } catch {
    return false
  }
}

function setFinanzasUnlocked() {
  try {
    sessionStorage.setItem(SESSION_KEY, '1')
  } catch {
    /* ignore */
  }
}

export function FinanzasPinModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}) {
  const [digits, setDigits] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [shake, setShake] = useState(false)

  useEffect(() => {
    if (!open) {
      setDigits('')
      setError(null)
      setShake(false)
    }
  }, [open])

  const submit = useCallback(
    (value: string) => {
      if (value === PIN) {
        setFinanzasUnlocked()
        setError(null)
        onSuccess()
        return
      }
      setError('PIN incorrecto. Inténtalo de nuevo.')
      setShake(true)
      setDigits('')
      window.setTimeout(() => setShake(false), 400)
    },
    [onSuccess],
  )

  const press = useCallback(
    (d: string) => {
      setError(null)
      setDigits((prev) => {
        if (prev.length >= 4) return prev
        const next = prev + d
        if (next.length === 4) {
          window.setTimeout(() => submit(next), 80)
        }
        return next
      })
    },
    [submit],
  )

  const backspace = useCallback(() => {
    setError(null)
    setDigits((prev) => prev.slice(0, -1))
  }, [])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      else if (/^\d$/.test(e.key)) press(e.key)
      else if (e.key === 'Backspace') backspace()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, press, backspace])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="finanzas-pin-title"
      data-testid="finanzas-pin-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-sm animate-rise rounded-3xl border border-[#0f766e]/25 bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-2">
          <div>
            <h2
              id="finanzas-pin-title"
              className="flex items-center gap-2 text-lg font-extrabold text-[#0f766e]"
            >
              <Lock className="size-5" aria-hidden />
              Acceso a Finanzas
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              Introduce el PIN familiar para continuar.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[var(--line)] p-2"
            aria-label="Cerrar"
          >
            <X className="size-4" />
          </button>
        </div>

        <div
          className={`mb-4 flex justify-center gap-3 ${shake ? 'animate-pulse' : ''}`}
          aria-live="polite"
        >
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={`size-3.5 rounded-full border-2 ${
                i < digits.length
                  ? 'border-[#0f766e] bg-[#0f766e]'
                  : 'border-[#0f766e]/35 bg-transparent'
              }`}
            />
          ))}
        </div>

        {error ? (
          <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-center text-sm font-semibold text-amber-900" role="alert">
            {error}
          </p>
        ) : (
          <p className="mb-3 text-center text-xs font-semibold text-[var(--ink-soft)]">4 dígitos</p>
        )}

        <div className="grid grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((key) => {
            if (key === '') return <span key="empty" />
            if (key === 'del') {
              return (
                <button
                  key="del"
                  type="button"
                  onClick={backspace}
                  className="flex h-14 items-center justify-center rounded-2xl border border-[var(--line)] bg-[#f8fafc] text-[#0f766e] active:bg-[#ccfbf1]"
                  aria-label="Borrar"
                >
                  <Delete className="size-5" />
                </button>
              )
            }
            return (
              <button
                key={key}
                type="button"
                onClick={() => press(key)}
                className="h-14 rounded-2xl border border-[#0f766e]/20 bg-gradient-to-b from-white to-[#ecfdf5] text-xl font-extrabold text-[#0f766e] shadow-sm active:scale-[0.97] active:bg-[#ccfbf1]"
              >
                {key}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
