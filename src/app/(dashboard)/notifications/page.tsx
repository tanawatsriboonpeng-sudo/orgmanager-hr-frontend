'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'
import clsx from 'clsx'
import {
  IconBell, IconCheck, IconTrash, IconRefresh, IconFilter,
  IconCalendarOff, IconClockPlus, IconReceipt2, IconSpeakerphone,
  IconKey, IconUserOff, IconUserCheck,
} from '@tabler/icons-react'
import { notificationApi, type Notification } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'

const META: Record<string, { icon: any; tint: string; label: string }> = {
  leave_request_pending: { icon: IconCalendarOff,  tint: 'bg-amber-50 text-amber-700',     label: 'คำขอลาใหม่' },
  leave_approved:        { icon: IconCalendarOff,  tint: 'bg-emerald-50 text-emerald-700', label: 'อนุมัติการลา' },
  leave_rejected:        { icon: IconCalendarOff,  tint: 'bg-red-50 text-red-600',         label: 'ปฏิเสธการลา' },
  ot_request_pending:    { icon: IconClockPlus,    tint: 'bg-amber-50 text-amber-700',     label: 'คำขอ OT ใหม่' },
  ot_approved:           { icon: IconClockPlus,    tint: 'bg-emerald-50 text-emerald-700', label: 'อนุมัติ OT' },
  ot_rejected:           { icon: IconClockPlus,    tint: 'bg-red-50 text-red-600',         label: 'ปฏิเสธ OT' },
  payroll_approved:      { icon: IconReceipt2,     tint: 'bg-amber-50 text-amber-700',     label: 'อนุมัติสลิป' },
  payroll_paid:          { icon: IconReceipt2,     tint: 'bg-emerald-50 text-emerald-700', label: 'จ่ายเงินเดือน' },
  announcement:          { icon: IconSpeakerphone, tint: 'bg-purple-50 text-purple-700',   label: 'ประกาศ' },
  password_reset:        { icon: IconKey,          tint: 'bg-red-50 text-red-600',         label: 'รีเซ็ตรหัสผ่าน' },
  account_disabled:      { icon: IconUserOff,      tint: 'bg-red-50 text-red-600',         label: 'ระงับบัญชี' },
  account_enabled:       { icon: IconUserCheck,    tint: 'bg-emerald-50 text-emerald-700', label: 'เปิดบัญชี' },
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
  return dayjs(iso).format('D MMM YY HH:mm')
}

type Filter = 'all' | 'unread'

export default function NotificationsPage() {
  const router = useRouter()
  const toast = useToast()
  const [items, setItems] = useState<Notification[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await notificationApi.list({
        limit: 200,
        unread: filter === 'unread' ? true : undefined,
      })
      setItems(r.data.data || [])
      setTotal(r.data.meta?.total || 0)
    } catch { setItems([]); setTotal(0) }
    finally { setLoading(false) }
  }, [filter])

  useEffect(() => { load() }, [load])

  const unreadCount = useMemo(() => items.filter(i => !i.read_at).length, [items])

  // Group by day for easier scanning. Today/Yesterday get friendly Thai
  // labels; older days show the date.
  const groups = useMemo(() => {
    const today = dayjs().format('YYYY-MM-DD')
    const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD')
    const g: Record<string, Notification[]> = {}
    for (const n of items) {
      const k = dayjs(n.created_at).format('YYYY-MM-DD')
      if (!g[k]) g[k] = []
      g[k].push(n)
    }
    return Object.entries(g).map(([d, list]) => ({
      day: d,
      label:
        d === today     ? 'วันนี้'      :
        d === yesterday ? 'เมื่อวาน'   :
                          dayjs(d).format('dddd D MMMM YYYY'),
      list,
    }))
  }, [items])

  const handleClick = async (n: Notification) => {
    if (!n.read_at) {
      setItems(prev => prev.map(x => x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x))
      notificationApi.markRead(n.id).catch(() => {})
    }
    if (n.link) router.push(n.link)
  }

  const handleMarkAll = async () => {
    setBusy(true)
    try {
      await notificationApi.markAllRead()
      setItems(prev => prev.map(x => x.read_at ? x : { ...x, read_at: new Date().toISOString() }))
    } finally { setBusy(false) }
  }

  const handleClearRead = async () => {
    const ok = await toast.confirm(
      'รายการที่อ่านแล้วทั้งหมดจะถูกลบถาวร',
      { title: 'ลบการแจ้งเตือนที่อ่านแล้ว?', tone: 'danger', confirmText: 'ลบทั้งหมด' }
    )
    if (!ok) return
    setBusy(true)
    try {
      await notificationApi.clearRead()
      setItems(prev => prev.filter(x => !x.read_at))
    } finally { setBusy(false) }
  }

  // Precise optimistic delete: capture the row's index so we can splice
  // it back in on failure (the prior implementation just fired load()
  // which clobbered scroll + filter state and showed no error). Total
  // is adjusted in lockstep so the header counter stays consistent.
  const handleDelete = async (n: Notification, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!items.some(x => x.id === n.id)) return
    const prevItems = items
    const prevTotal = total
    setItems(prev => prev.filter(x => x.id !== n.id))
    setTotal(t => Math.max(0, t - 1))
    try {
      await notificationApi.delete(n.id)
    } catch (err: any) {
      setItems(prevItems)
      setTotal(prevTotal)
      setToast({ text: err?.response?.data?.message || 'ลบไม่สำเร็จ', ok: false })
    }
  }

  // Toast auto-dismisses error/info banners after 4s so they don't pile
  // up if the user retries; cleanup on unmount or when toast changes
  // keeps a stale timer from clobbering a later toast.
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {toast && (
        <div className={clsx(
          'mb-4 px-3 py-2 rounded-md border text-xs flex items-center justify-between',
          toast.ok
            ? 'bg-green-50 border-green-200 text-green-700'
            : 'bg-red-50 border-red-200 text-red-700'
        )}>
          <span>{toast.text}</span>
          <button onClick={() => setToast(null)} className="opacity-70 hover:opacity-100">ปิด</button>
        </div>
      )}

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#111110] flex items-center gap-2">
            <IconBell size={18} className="text-[#1D9E75]" />
            การแจ้งเตือน
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {total > 0 ? <>{total.toLocaleString()} รายการทั้งหมด · {unreadCount} ยังไม่อ่าน</> : 'ไม่มีการแจ้งเตือน'}
          </p>
        </div>
        <button onClick={load} disabled={loading} className="btn btn-ghost text-xs">
          <IconRefresh size={13} className={loading ? 'animate-spin' : ''} /> รีเฟรช
        </button>
      </div>

      {/* Filter + bulk actions bar */}
      <div className="card mb-4 p-3">
        <div className="flex flex-wrap items-center gap-2">
          {([['all','ทั้งหมด'], ['unread','ยังไม่อ่าน']] as const).map(([k, label]) => {
            const active = filter === k
            const count = k === 'all' ? items.length : unreadCount
            return (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={clsx(
                  'text-[12px] px-3 py-1.5 rounded-full border transition-colors',
                  active
                    ? 'bg-[#111110] text-white border-[#111110]'
                    : 'bg-white text-gray-600 border-black/[0.08] hover:bg-gray-50'
                )}
              >
                {label}{count > 0 && <span className={clsx('ml-1', active ? 'opacity-70' : 'text-gray-400')}>{count}</span>}
              </button>
            )
          })}
          <div className="flex-1" />
          {unreadCount > 0 && (
            <button onClick={handleMarkAll} disabled={busy} className="btn btn-ghost text-xs">
              <IconCheck size={13} /> อ่านทั้งหมด
            </button>
          )}
          {items.some(i => i.read_at) && (
            <button
              onClick={handleClearRead}
              disabled={busy}
              className="btn btn-ghost text-xs text-red-500 hover:bg-red-50"
            >
              <IconTrash size={13} /> เคลียร์ที่อ่านแล้ว
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="card text-center py-12 text-sm text-gray-400">กำลังโหลด…</div>
      ) : items.length === 0 ? (
        <div className="card text-center py-12">
          <IconBell size={28} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-400">
            {filter === 'unread' ? 'ไม่มีการแจ้งเตือนที่ยังไม่อ่าน' : 'ยังไม่มีการแจ้งเตือน'}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map(group => (
            <div key={group.day}>
              <div className="text-xs text-gray-500 font-medium mb-2 px-1">
                {group.label} <span className="text-gray-300">·</span> {group.list.length} รายการ
              </div>
              <div className="card p-0 divide-y divide-black/[0.05]">
                {group.list.map(n => {
                  const meta = META[n.type] || { icon: IconBell, tint: 'bg-gray-100 text-gray-500', label: n.type }
                  const Icon = meta.icon
                  const unread = !n.read_at
                  return (
                    <button
                      key={n.id}
                      onClick={() => handleClick(n)}
                      className={clsx(
                        'group w-full text-left p-3 flex gap-3 hover:bg-gray-50 transition-colors',
                        unread && 'bg-[#E1F5EE]/30'
                      )}
                    >
                      <div className={clsx('w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0', meta.tint)}>
                        <Icon size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <span className={clsx('text-sm', unread ? 'font-semibold text-[#111110]' : 'font-medium text-gray-700')}>
                            {n.title}
                          </span>
                          <span className={clsx('text-[10px] px-1.5 py-0.5 rounded-md', meta.tint)}>
                            {meta.label}
                          </span>
                        </div>
                        {n.body && (
                          <div className="text-xs text-gray-500 break-words">{n.body}</div>
                        )}
                        <div className="text-[11px] text-gray-400 mt-1">
                          {relativeTime(n.created_at)}
                          <span className="text-gray-300 mx-1">·</span>
                          {dayjs(n.created_at).format('HH:mm')}
                          {n.link && <span className="ml-2 text-[#1D9E75]">{n.link}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {unread && <span className="w-2 h-2 rounded-full bg-[#1D9E75]" aria-label="ยังไม่อ่าน" />}
                        <span
                          role="button"
                          onClick={(e) => handleDelete(n, e)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-700"
                          aria-label="ลบ"
                        >
                          <IconTrash size={12} />
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
