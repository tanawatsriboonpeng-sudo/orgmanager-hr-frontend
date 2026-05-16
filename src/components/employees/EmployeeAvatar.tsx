'use client'
import clsx from 'clsx'

interface Person {
  first_name?: string
  last_name?: string
  firstName?: string
  lastName?: string
  avatar_url?: string | null
  avatarUrl?: string | null
  role?: string
}

const ROLE_COLOR: Record<string, string> = {
  owner: '#534AB7',
  hr: '#1D9E75',
  employee: '#185FA5',
}

/**
 * Reusable employee avatar. Shows the photo if avatar_url is set,
 * otherwise falls back to a color circle with the first-name initial.
 * Accepts both snake_case (from /api/employees) and camelCase (from
 * auth store) field names so it works everywhere without mapping.
 */
export default function EmployeeAvatar({
  person,
  size = 36,
  className,
}: {
  person: Person | null | undefined
  size?: number
  className?: string
}) {
  const first = person?.first_name || person?.firstName || ''
  const last = person?.last_name || person?.lastName || ''
  const url = person?.avatar_url || person?.avatarUrl || null
  const role = person?.role || 'employee'
  const color = ROLE_COLOR[role] || '#6B6A66'
  const initial = (first.charAt(0) || '?').toUpperCase()
  const fontSize = size <= 28 ? 11 : size <= 40 ? 13 : size <= 56 ? 16 : 20

  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={`${first} ${last}`.trim() || 'avatar'}
        className={clsx('rounded-full object-cover flex-shrink-0', className)}
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <div
      className={clsx('rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0', className)}
      style={{ background: color, width: size, height: size, fontSize }}
    >
      {initial}
    </div>
  )
}
