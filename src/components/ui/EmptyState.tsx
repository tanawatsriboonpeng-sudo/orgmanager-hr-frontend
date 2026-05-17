// Empty state — for "no data yet" placeholders across the app.
// Replaces the various ad-hoc <p className="text-gray-400">ไม่มี...</p>
// patterns so the look stays consistent. Optional CTA button helps users
// see what they can do next instead of dead-ending.
//
// Three sizes:
//   compact — for in-card placeholders (small icon, single line)
//   default — full-width, medium icon
//   hero    — for first-time / large empty pages
//
// Pass any Tabler icon as the icon prop.

import clsx from 'clsx'
import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon?: any  // Tabler icon component
  title: string
  description?: string
  action?: ReactNode  // typically a <button> or <Link>
  size?: 'compact' | 'default' | 'hero'
  className?: string
  /**
   * Tint of the icon circle. Brand by default; use 'gray' for neutral
   * states (no-result-found rather than first-use).
   */
  tone?: 'brand' | 'gray' | 'amber'
}

const SIZE = {
  compact: {
    iconWrap: 'w-9 h-9',
    iconSize: 16,
    pad: 'py-5',
    titleClass: 'text-sm font-medium',
    descClass: 'text-xs',
  },
  default: {
    iconWrap: 'w-14 h-14',
    iconSize: 22,
    pad: 'py-10',
    titleClass: 'text-base font-semibold',
    descClass: 'text-sm',
  },
  hero: {
    iconWrap: 'w-20 h-20',
    iconSize: 32,
    pad: 'py-16',
    titleClass: 'text-lg font-semibold',
    descClass: 'text-sm',
  },
} as const

const TONE = {
  brand: 'bg-[#E1F5EE] text-[#0F6E56]',
  gray:  'bg-gray-100 text-gray-400',
  amber: 'bg-[#FAEEDA] text-[#633806]',
} as const

export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  size = 'default',
  tone = 'brand',
  className,
}: EmptyStateProps) {
  const s = SIZE[size]
  return (
    <div className={clsx('flex flex-col items-center text-center px-4', s.pad, className)}>
      {Icon && (
        <div className={clsx(
          'flex items-center justify-center rounded-full mb-3',
          s.iconWrap, TONE[tone]
        )}>
          <Icon size={s.iconSize} />
        </div>
      )}
      <h3 className={clsx('text-[#111110]', s.titleClass)}>{title}</h3>
      {description && (
        <p className={clsx('text-gray-500 mt-1 max-w-sm', s.descClass)}>{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
