'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'
import clsx from 'clsx'
import {
  IconBell, IconBellRinging, IconCheck, IconX,
  IconCalendarOff, IconClockPlus, IconReceipt2,
  IconSpeakerphone, IconKey, IconUserOff, IconUserCheck,
  IconHistory,
} from '@tabler/icons-react'
import { notificationApi, type Notification, type NotificationType } from '@/lib/api'

// Visual treatment per notification type — keeps the dropdown scannable
// without the user reading every title. Falls back to a neutral grey
// bell for unknown types (e.g. future events we haven't styled yet).
const META: Record<string, { icon: any; tint: string }> = {
  leave_request_pending: { icon: IconCalendarOff,  tint: 'bg-amber-50 text-amber-700' },
  leave_approved:        { icon: IconCalendarOff,  tint: 'bg-emerald-50 text-emerald-700' },
  leave_rejected:        { icon: IconCalendarOff,  tint: 'bg-red-50 text-red-600' },
  ot_request_pending:    { icon: IconClockPlus,    tint: 'bg-amber-50 text-amber-700' },
  ot_approved:           { icon: IconClockPlus,    tint: 'bg-emerald-50 text-emerald-700' },
  ot_rejected:           { icon: IconClockPlus,    tint: 'bg-red-50 text-red-600' },
  payroll_approved:      { icon: IconReceipt2,     tint: 'bg-amber-50 text-amber-700' },
  payroll_paid:          { icon: IconReceipt2,     tint: 'bg-emerald-50 text-emerald-700' },
  announcement:          { icon: IconSpeakerphone, tint: 'bg-purple-50 text-purple-700' },
  password_reset:        { icon: IconKey,          tint: 'bg-red-50 text-red-600' },
  account_disabled:      { icon: IconUserOff,      tint: 'bg-red-50 text-red-600' },
  account_enabled:       { icon: IconUserCheck,    tint: 'bg-emerald-50 text-emerald-700' },
}

function relativeTime(iso: string): string {
  const diffSec = dayjs().diff(dayjs(iso), 'second')
  if (diffSec < 60) return `${diffSec} วินาทีที่แล้ว`
  const diffMin = dayjs().diff(dayjs(iso), 'minute')
  if (diffMin < 60) return `${diffMin} นาทีที่แล้ว`
  const diffHr = dayjs().diff(dayjs(iso), 'hour')
  if (diffHr < 24) return `${diffHr} ชม.ที่แล้ว`
  const diffDay = dayjs().diff(dayjs(iso), 'day')
  if (diffDay < 7) return `${diffDay} วันที่แล้ว`
  return dayjs(iso).format('D MMM YY')
}

export default function NotificationBell() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState(0)
  const [items, setItems] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  // Badge poll — kept cheap (partial index on unread side). 30s is a
  // reasonable cadence for an HR tool; faster wastes cycles, slower
  // misses the "fresh notification" moment.
  const fetchCount = useCallback(async () => {
    try {
      const r = await notificationApi.unreadCount()
      setCount(r.data.data?.count || 0)
    } catch {}
  }, [])

  useEffect(() => {
    fetchCount()
    const t = setInterval(fetchCount, 30000)
    const onVisibility = () => { if (document.visibilityState === 'visible') fetchCount() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisibility) }
  }, [fetchCount])

  // Load the list when the dropdown opens. Don't pre-fetch — list view
  // is heavier (10 rows + joins on each) so we save it until needed.
  const openPanel = async () => {
    setOpen(true)
    setLoading(true)
    try {
      const r = await notificationApi.list({ limit: 10 })
      setItems(r.data.data || [])
    } catch { setItems([]) }
    finally { setLoading(false) }
  }

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey) }
  }, [open])

  const handleClickItem = async (n: Notification) => {
    // Optimistic: mark unread → read in-place so the row shows the
    // updated state immediately even before the API call lands.
    if (!n.read_at) {
      setItems(prev => prev.map(x => x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x))
      setCount(c => Math.max(0, c - 1))
      notificationApi.markRead(n.id).catch(() => {})
    }
    setOpen(false)
    if (n.link) router.push(n.link)
  }

  const handleMarkAll = async () => {
    setItems(prev => prev.map(x => x.read_at ? x : { ...x, read_at: new Date().toISOString() }))
    setCount(0)
    notificationApi.markAllRead().catch(fetchCount)
  }

  const handleDismiss = async (e: React.MouseEvent, n: Notification) => {
    e.stopPropagation()
    setItems(prev => prev.filter(x => x.id !== n.id))
    if (!n.read_at) setCount(c => Math.max(0, c - 1))
    notificationApi.delete(n.id).catch(fetchCount)
  }

  return (
    <div ref={panelRef} className="relative">
      <button
        onClick={() => (open ? setOpen(false) : openPanel())}
        className={clsx(
          'relative p-2 rounded-[10px] hover:bg-gray-100 transition-colors',
          open && 'bg-gray-100'
        )}
        aria-label="การแจ้งเตือน"
        title="การแจ้งเตือน"
      >
        {count > 0
          ? <IconBellRinging size={18} className="text-[#1D9E75]" />
          : <IconBell size={18} className="text-gray-500" />}
        {count > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        // Bell lives at the right edge of the sidebar user-chip, which
        // is itself pinned to the left edge of the viewport. Anchoring
        // the panel to right-0 of the trigger pushed it off-screen left.
        // left-0 makes it cascade rightward into the main content area
        // where there's room. fixed offset top-full + mt-2 keeps it
        // right under the bell.
        <div
          className="absolute left-0 top-full mt-2 w-[360px] max-w-[calc(100vw-2rem)] max-h-[70vh] bg-white border border-black/[0.08] rounded-[14px] shadow-xl z-50 flex flex-col overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-black/[0.06]">
            <h3 className="text-sm font-semibold text-[#111110]">การแจ้งเตือน</h3>
            <div className="flex items-center gap-2">
              {count > 0 && (
                <button
                  onClick={handleMarkAll}
                  className="text-[11px] text-[#1D9E75] hover:underline flex items-center gap-1"
                >
                  <IconCheck size={12} /> อ่านทั้งหมด
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-700">
                <IconX size={14} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="text-center py-10 text-xs text-gray-400">กำลังโหลด…</div>
            ) : items.length === 0 ? (
              <div className="text-center py-10 text-xs text-gray-400">
                <IconBell size={24} className="mx-auto text-gray-300 mb-2" />
                ไม่มีการแจ้งเตือน
              </div>
            ) : (
              <div className="divide-y divide-black/[0.05]">
                {items.map(n => {
                  const meta = META[n.type] || { icon: IconBell, tint: 'bg-gray-100 text-gray-500' }
                  const Icon = meta.icon
                  const unread = !n.read_at
                  return (
                    <button
                      key={n.id}
                      onClick={() => handleClickItem(n)}
                      className={clsx(
                        'group w-full text-left px-3 py-2.5 flex gap-2.5 hover:bg-gray-50 transition-colors relative',
                        unread && 'bg-[#E1F5EE]/30'
                      )}
                    >
                      <div className={clsx('w-8 h-8 rounded-[8px] flex items-center justify-center flex-shrink-0', meta.tint)}>
                        <Icon size={14} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={clsx('text-xs leading-snug', unread ? 'font-semibold text-[#111110]' : 'font-medium text-gray-700')}>
                          {n.title}
                        </div>
                        {n.body && (
                          <div className="text-[11px] text-gray-500 mt-0.5 line-clamp-2 break-words">{n.body}</div>
                        )}
                        <div className="text-[10px] text-gray-400 mt-1">{relativeTime(n.created_at)}</div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {unread && <span className="w-1.5 h-1.5 rounded-full bg-[#1D9E75]" aria-label="ยังไม่อ่าน" />}
                        <span
                          role="button"
                          onClick={(e) => handleDismiss(e, n)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-700"
                          aria-label="ลบ"
                        >
                          <IconX size={11} />
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="block text-center py-2.5 text-xs text-[#1D9E75] hover:bg-gray-50 border-t border-black/[0.06] flex items-center justify-center gap-1"
          >
            <IconHistory size={12} /> ดูทั้งหมด
          </Link>
        </div>
      )}
    </div>
  )
}
