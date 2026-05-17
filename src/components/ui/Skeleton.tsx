// Skeleton loader primitives. Drop in as a placeholder while data is
// loading — provides the shimmer (CSS keyframe in globals.css) so the
// page doesn't feel frozen. Width/height come from Tailwind classes
// passed via `className`; we don't try to guess sizes here.
//
// Three convenience wrappers:
//   <Skeleton />          — bare div, you control everything
//   <SkeletonText />      — N lines of text-like bars with varied widths
//   <SkeletonCard />      — full card shell w/ title + body lines

import clsx from 'clsx'

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('skeleton', className)} aria-hidden="true" />
}

// Lines vary slightly in width so it doesn't look like a barcode.
// The last line is shorter (mimics natural prose ending mid-line).
export function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number
  className?: string
}) {
  const widths = ['w-full', 'w-11/12', 'w-10/12', 'w-3/4', 'w-2/3']
  return (
    <div className={clsx('space-y-2', className)} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={clsx('h-3', i === lines - 1 ? 'w-1/2' : widths[i % widths.length])}
        />
      ))}
    </div>
  )
}

// Approximates one row in a list-style card. Useful as a "loading
// placeholder for an unknown number of upcoming rows" — render 3-5 of
// these inside the empty list area.
export function SkeletonRow({ className }: { className?: string }) {
  return (
    <div className={clsx('flex items-center gap-3 py-2', className)} aria-hidden="true">
      <Skeleton className="w-9 h-9 rounded-full" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-2.5 w-2/3" />
      </div>
      <Skeleton className="h-7 w-16 rounded-md" />
    </div>
  )
}

// Full card shell — title bar + body lines. Use when an entire card
// section is loading (e.g. "loading dashboard widget").
export function SkeletonCard({
  lines = 3,
  className,
}: {
  lines?: number
  className?: string
}) {
  return (
    <div className={clsx('card', className)} aria-hidden="true">
      <Skeleton className="h-4 w-1/3 mb-3" />
      <SkeletonText lines={lines} />
    </div>
  )
}
