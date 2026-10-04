import type { ReactNode } from 'react'

export type EmptyPhoto = 'tareas' | 'citas' | 'rutinas'

const PHOTO_SRC: Record<EmptyPhoto, string> = {
  tareas: `${import.meta.env.BASE_URL}empty-states/tareas.jpg`,
  citas: `${import.meta.env.BASE_URL}empty-states/citas.jpg`,
  rutinas: `${import.meta.env.BASE_URL}empty-states/rutinas.jpg`,
}

const PHOTO_ALT: Record<EmptyPhoto, string> = {
  tareas: 'Hellen con el bebé',
  citas: 'Lore en el escritorio',
  rutinas: 'Familia en cumpleaños',
}

/** Compact empty-state with family photo thumb (not full-bleed). */
export function EmptySection({
  photo,
  message,
  accent = 'warm',
}: {
  photo: EmptyPhoto
  message: ReactNode
  accent?: 'warm' | 'teal' | 'sky'
}) {
  const soft =
    accent === 'teal'
      ? 'from-[#f0fdfa]/80 to-[#ccfbf1]/40'
      : accent === 'sky'
        ? 'from-[#e0f2fe]/80 to-[#bae6fd]/40'
        : 'from-[#fff7ed]/90 to-[#fef3c7]/50'

  return (
    <div
      className={`flex flex-col items-center gap-2 rounded-2xl bg-gradient-to-b ${soft} px-3 py-4 text-center`}
      data-testid="empty-section"
      data-empty-photo={photo}
    >
      <img
        src={PHOTO_SRC[photo]}
        alt={PHOTO_ALT[photo]}
        width={112}
        height={112}
        loading="lazy"
        decoding="async"
        className="size-28 max-h-[7rem] max-w-[7rem] rounded-2xl object-cover shadow-sm ring-1 ring-black/5"
      />
      <p className="max-w-[16rem] text-sm text-[var(--ink-soft)]">{message}</p>
    </div>
  )
}
