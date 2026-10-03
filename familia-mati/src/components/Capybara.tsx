/** Cute on-brand capybara figures for empty states — warm browns, no emoji. */
import type { ReactNode } from 'react'

type Variant = 'sit' | 'peek' | 'leaf'

export function Capybara({
  variant = 'sit',
  className = '',
  title = 'Capibara',
}: {
  variant?: Variant
  className?: string
  title?: string
}) {
  if (variant === 'peek') {
    return (
      <svg
        viewBox="0 0 120 72"
        className={className}
        role="img"
        aria-label={title}
        xmlns="http://www.w3.org/2000/svg"
      >
        <title>{title}</title>
        {/* ground */}
        <ellipse cx="60" cy="66" rx="42" ry="5" fill="#fde68a" opacity="0.55" />
        {/* body peeking */}
        <ellipse cx="60" cy="58" rx="34" ry="14" fill="#c4a484" />
        <ellipse cx="60" cy="56" rx="28" ry="10" fill="#d4b896" />
        {/* head */}
        <ellipse cx="60" cy="38" rx="22" ry="18" fill="#c4a484" />
        <ellipse cx="60" cy="40" rx="16" ry="12" fill="#d4b896" />
        {/* ears */}
        <ellipse cx="42" cy="28" rx="6" ry="7" fill="#b8956e" />
        <ellipse cx="78" cy="28" rx="6" ry="7" fill="#b8956e" />
        <ellipse cx="42" cy="29" rx="3.2" ry="3.8" fill="#e8c4a8" />
        <ellipse cx="78" cy="29" rx="3.2" ry="3.8" fill="#e8c4a8" />
        {/* eyes */}
        <circle cx="52" cy="36" r="3.2" fill="#3f2a1c" />
        <circle cx="68" cy="36" r="3.2" fill="#3f2a1c" />
        <circle cx="53" cy="35" r="1" fill="#fff8f0" />
        <circle cx="69" cy="35" r="1" fill="#fff8f0" />
        {/* snout */}
        <ellipse cx="60" cy="44" rx="8" ry="5.5" fill="#e8c4a8" />
        <ellipse cx="57.5" cy="43.5" rx="1.4" ry="1.8" fill="#5b3a29" />
        <ellipse cx="62.5" cy="43.5" rx="1.4" ry="1.8" fill="#5b3a29" />
        {/* blush */}
        <ellipse cx="46" cy="42" rx="3.5" ry="2" fill="#f0a08c" opacity="0.55" />
        <ellipse cx="74" cy="42" rx="3.5" ry="2" fill="#f0a08c" opacity="0.55" />
      </svg>
    )
  }

  if (variant === 'leaf') {
    return (
      <svg
        viewBox="0 0 130 90"
        className={className}
        role="img"
        aria-label={title}
        xmlns="http://www.w3.org/2000/svg"
      >
        <title>{title}</title>
        <ellipse cx="65" cy="82" rx="40" ry="5" fill="#bbf7d0" opacity="0.5" />
        {/* body */}
        <ellipse cx="62" cy="58" rx="36" ry="20" fill="#c4a484" />
        <ellipse cx="62" cy="56" rx="30" ry="14" fill="#d4b896" />
        {/* legs */}
        <ellipse cx="40" cy="72" rx="7" ry="6" fill="#b8956e" />
        <ellipse cx="78" cy="72" rx="7" ry="6" fill="#b8956e" />
        {/* head */}
        <ellipse cx="95" cy="48" rx="20" ry="16" fill="#c4a484" />
        <ellipse cx="96" cy="50" rx="14" ry="11" fill="#d4b896" />
        <ellipse cx="84" cy="38" rx="5.5" ry="6.5" fill="#b8956e" />
        <ellipse cx="104" cy="36" rx="5.5" ry="6.5" fill="#b8956e" />
        <circle cx="90" cy="46" r="2.8" fill="#3f2a1c" />
        <circle cx="102" cy="45" r="2.8" fill="#3f2a1c" />
        <circle cx="91" cy="45" r="0.9" fill="#fff8f0" />
        <circle cx="103" cy="44" r="0.9" fill="#fff8f0" />
        <ellipse cx="108" cy="52" rx="7" ry="5" fill="#e8c4a8" />
        <ellipse cx="106" cy="51.5" rx="1.2" ry="1.5" fill="#5b3a29" />
        <ellipse cx="110" cy="51.5" rx="1.2" ry="1.5" fill="#5b3a29" />
        {/* orange leaf snack */}
        <path
          d="M48 42 C42 28, 58 22, 62 34 C66 22, 80 30, 72 42 C64 48, 54 48, 48 42Z"
          fill="#fb923c"
          opacity="0.95"
        />
        <path d="M60 34 L58 46" stroke="#c2410c" strokeWidth="1.2" fill="none" />
      </svg>
    )
  }

  // sit (default)
  return (
    <svg
      viewBox="0 0 120 100"
      className={className}
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>
      <ellipse cx="60" cy="92" rx="38" ry="5" fill="#fed7aa" opacity="0.55" />
      {/* body */}
      <ellipse cx="58" cy="62" rx="34" ry="22" fill="#c4a484" />
      <ellipse cx="58" cy="60" rx="28" ry="16" fill="#d4b896" />
      {/* legs */}
      <ellipse cx="38" cy="78" rx="8" ry="7" fill="#b8956e" />
      <ellipse cx="72" cy="78" rx="8" ry="7" fill="#b8956e" />
      {/* head */}
      <ellipse cx="88" cy="48" rx="20" ry="17" fill="#c4a484" />
      <ellipse cx="89" cy="50" rx="14" ry="12" fill="#d4b896" />
      {/* ears */}
      <ellipse cx="76" cy="36" rx="5.5" ry="7" fill="#b8956e" />
      <ellipse cx="98" cy="35" rx="5.5" ry="7" fill="#b8956e" />
      <ellipse cx="76" cy="37" rx="2.8" ry="3.5" fill="#e8c4a8" />
      <ellipse cx="98" cy="36" rx="2.8" ry="3.5" fill="#e8c4a8" />
      {/* eyes — calm */}
      <circle cx="82" cy="46" r="3" fill="#3f2a1c" />
      <circle cx="94" cy="45" r="3" fill="#3f2a1c" />
      <circle cx="83" cy="45" r="1" fill="#fff8f0" />
      <circle cx="95" cy="44" r="1" fill="#fff8f0" />
      {/* snout */}
      <ellipse cx="100" cy="54" rx="7.5" ry="5.5" fill="#e8c4a8" />
      <ellipse cx="98" cy="53.5" rx="1.3" ry="1.7" fill="#5b3a29" />
      <ellipse cx="102.5" cy="53.5" rx="1.3" ry="1.7" fill="#5b3a29" />
      {/* blush */}
      <ellipse cx="78" cy="52" rx="3.2" ry="2" fill="#f0a08c" opacity="0.5" />
      {/* tiny heart accent — brand color, not emoji */}
      <path
        d="M28 48 C28 44, 34 44, 34 48 C34 44, 40 44, 40 48 C40 54, 34 58, 34 58 C34 58, 28 54, 28 48Z"
        fill="#fb7185"
        opacity="0.7"
      />
    </svg>
  )
}

export function EmptyCapybara({
  variant = 'sit',
  message,
  accent = 'warm',
}: {
  variant?: Variant
  message: ReactNode
  accent?: 'warm' | 'teal'
}) {
  const soft = accent === 'teal' ? 'from-[#f0fdfa]/80 to-[#ccfbf1]/40' : 'from-[#fff7ed]/90 to-[#fef3c7]/50'
  return (
    <div
      className={`flex flex-col items-center gap-2 rounded-2xl bg-gradient-to-b ${soft} px-3 py-4 text-center`}
      data-testid="empty-capybara"
    >
      <Capybara variant={variant} className="h-20 w-auto opacity-95" title="Capibara descansando" />
      <p className="max-w-[16rem] text-sm text-[var(--ink-soft)]">{message}</p>
    </div>
  )
}
