// Tiny shared spinner. Replaces the many ad-hoc
// `<div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />`
// scattered through button loading states so they all look the same.
//
// Usage inside a button:
//   <button disabled={busy}>
//     {busy ? <Spinner /> : 'บันทึก'}
//   </button>
//
// Or with text alongside:
//   {busy ? <><Spinner /> กำลังบันทึก…</> : 'บันทึก'}

import clsx from 'clsx'

interface SpinnerProps {
  size?: number       // pixels — default 14
  /** Border color. Default "currentColor" so it inherits from the button. */
  color?: string
  className?: string
}

export default function Spinner({ size = 14, color, className }: SpinnerProps) {
  const border = Math.max(2, Math.round(size / 8))
  return (
    <span
      aria-hidden="true"
      className={clsx('inline-block rounded-full animate-spin', className)}
      style={{
        width: size,
        height: size,
        borderWidth: border,
        borderStyle: 'solid',
        // Three transparent edges + one solid = the classic spinner look.
        // `currentColor` makes it inherit the button's text color so it
        // works on both .btn (gray) and .btn-primary (white) without
        // explicit overrides.
        borderColor: 'transparent',
        borderTopColor: color || 'currentColor',
        borderRightColor: color || 'currentColor',
        opacity: 0.85,
      }}
    />
  )
}
