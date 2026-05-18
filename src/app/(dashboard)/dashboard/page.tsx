'use client'
import { useEffect, useState } from 'react'
import { useAuthStore } from '@/lib/store'
import { attendanceApi, leaveApi, announcementApi, eventApi, type CalendarEvent } from '@/lib/api'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell
} from 'recharts'
import {
  IconUsers, IconClockCheck, IconCalendarOff, IconClockPlus,
  IconTrendingUp, IconAlertTriangle, IconBell, IconArrowRight,
  IconCheck, IconClock, IconMapPin, IconX, IconSparkles,
  IconSpeakerphone, IconChartBar, IconBeach, IconCalendarTime,
  IconUserOff,
} from '@tabler/icons-react'
import Link from 'next/link'
import clsx from 'clsx'
import dayjs from 'dayjs'
import 'dayjs/locale/th'
import { SkeletonCard, SkeletonRow, Skeleton } from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'
dayjs.locale('th')

// Returns "เช้านี้" / "บ่ายนี้" / "ค่ำนี้" based on current hour — used
// in the greeting so the page feels less robotic. Mirrors the
// time-aware greetings macOS / iOS use.
function greetingForHour(): string {
  const h = new Date().getHours()
  if (h < 12) return 'อรุณสวัสดิ์'
  if (h < 17) return 'สวัสดีตอนบ่าย'
  return 'สวัสดีตอนเย็น'
}

// ─── Stat Card ───────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color, icon: Icon }: {
  label: string; value: string | number; sub?: string
  color: string; icon: React.ElementType
}) {
  return (
    <div className="card flex items-start gap-3">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: color + '20' }}>
        <Icon size={18} style={{ color }} />
      </div>
      <div>
        <div className="text-xs text-gray-500 mb-0.5">{label}</div>
        <div className="text-xl font-semibold text-[#111110]">{value}</div>
        {sub && <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div>}
      </div>
    </div>
  )
}

// Compact colored-number cell used inside the attendance-overview card.
// Same shape as the Stat used on /attendance so the visual language
// stays consistent across the two surfaces.
function DashStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center px-2 py-3 rounded-[10px] bg-white border border-black/[0.05]">
      <div className="text-xl font-semibold tabular-nums" style={{ color }}>{value}</div>
      <div className="text-[11px] text-gray-500 mt-0.5">{label}</div>
    </div>
  )
}

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionHeader({ title, href }: { title: string; href?: string }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-sm font-semibold text-[#111110]">{title}</h2>
      {href && (
        <Link href={href} className="text-xs text-[#1D9E75] flex items-center gap-1 hover:underline">
          ดูทั้งหมด <IconArrowRight size={12} />
        </Link>
      )}
    </div>
  )
}

// Chart data is now fetched from /attendance/recent-summary at runtime
// (was previously a static mock that looked deceptively real).

// ─── Announcement item ────────────────────────────────────────────────────────
function AnnouncementItem({ item, onRead }: { item: any; onRead: (id: string) => void }) {
  const typeColors: Record<string, string> = {
    info: 'badge-purple', important: 'badge-red', holiday: 'badge-amber', urgent: 'badge-red',
  }
  const typeLabels: Record<string, string> = {
    info: 'ข่าวสาร', important: 'สำคัญ', holiday: 'วันหยุด', urgent: 'ด่วน',
  }
  return (
    <div className={clsx('flex gap-3 p-3 rounded-[10px] border transition-all', item.is_read ? 'border-black/[0.05] bg-white/50' : 'border-[#1D9E75]/20 bg-[#E1F5EE]/30')}>
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2 flex-wrap">
          <span className={clsx('badge', typeColors[item.type] || 'badge-gray')}>
            {typeLabels[item.type] || item.type}
          </span>
          <span className="text-[12px] font-medium text-[#111110] flex-1">{item.title}</span>
        </div>
        <p className="text-[11px] text-gray-500 mt-1 line-clamp-2">{item.content}</p>
        <div className="text-[10px] text-gray-400 mt-1.5">
          {item.created_by_name} · {dayjs(item.created_at).format('D MMM BBYY')}
        </div>
      </div>
      {!item.is_read && (
        <button onClick={() => onRead(item.id)} className="btn btn-ghost p-1.5 rounded-lg h-fit" title="รับทราบ">
          <IconCheck size={14} className="text-[#1D9E75]" />
        </button>
      )}
    </div>
  )
}

// ─── Main Dashboard ────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user } = useAuthStore()
  const role = user?.role
  const isOwner = role === 'owner'
  const isHROrOwner = role === 'hr' || role === 'owner'
  const today = dayjs().format('dddd ที่ D MMMM BBBB')

  const [todayLog, setTodayLog] = useState<any>(null)
  const [summary, setSummary] = useState<any>(null)
  const [chartRows, setChartRows] = useState<any[]>([])
  const [announcements, setAnnouncements] = useState<any[]>([])
  const [leaveQuota, setLeaveQuota] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  // HR/owner pending approvals embedded on the dashboard so management
  // doesn't have to navigate to /attendance just to see what's waiting.
  const [offsitePending, setOffsitePending] = useState<any[]>([])
  const [backdatePending, setBackdatePending] = useState<any[]>([])
  const [actingId, setActingId] = useState<string | null>(null)
  const [pendingMsg, setPendingMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectingKind, setRejectingKind] = useState<'offsite' | 'backdate' | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  // Upcoming events for the events widget — visible to everyone (not
  // gated on isHROrOwner) because employees benefit from seeing what's
  // scheduled too. Window is "today through next 7 days."
  const [upcomingEvents, setUpcomingEvents] = useState<CalendarEvent[]>([])

  const loadHRBundle = async () => {
    if (!isHROrOwner) return
    const [sumRes, chartRes, offRes, bdRes] = await Promise.all([
      attendanceApi.dailySummary().catch(() => null),
      attendanceApi.recentSummary(5).catch(() => null),
      attendanceApi.offsitePending().catch(() => null),
      attendanceApi.backdatePending().catch(() => null),
    ])
    if (sumRes) setSummary(sumRes.data.data)
    if (chartRes) setChartRows(chartRes.data.data || [])
    if (offRes)  setOffsitePending(offRes.data.data || [])
    if (bdRes)   setBackdatePending(bdRes.data.data || [])
  }

  // Load upcoming events for everyone, separately from the HR bundle
  // so a plain employee still sees them. Visibility filter on the
  // backend ensures they only see events meant for them.
  const loadUpcomingEvents = async () => {
    const today = dayjs().format('YYYY-MM-DD')
    const to = dayjs().add(7, 'day').format('YYYY-MM-DD')
    try {
      const r = await eventApi.list({ from: today, to })
      setUpcomingEvents(r.data.data || [])
    } catch { /* widget hides itself on empty/error */ }
  }

  useEffect(() => {
    const loadAll = async () => {
      try {
        // Owner doesn't have a personal attendance log or quota — skip
        // those calls so we don't 404 noisily.
        const tasks: Promise<any>[] = [announcementApi.list()]
        if (!isOwner) tasks.push(attendanceApi.today(), leaveApi.myQuota())
        const results = await Promise.allSettled(tasks)
        const annoRes = results[0]
        if (annoRes.status === 'fulfilled') setAnnouncements((annoRes.value as any).data.data || [])
        if (!isOwner) {
          const todayRes = results[1], quotaRes = results[2]
          if (todayRes.status === 'fulfilled') setTodayLog((todayRes.value as any).data.data)
          if (quotaRes.status === 'fulfilled') setLeaveQuota((quotaRes.value as any).data.data || [])
        }
        await loadHRBundle()
        loadUpcomingEvents() // fire-and-forget — widget is optional
      } finally {
        setLoading(false)
      }
    }
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner, isHROrOwner])

  // Pending-queue mutations refresh both the queue and the daily summary
  // so the "ทั้งหมด/ยังไม่เข้า/ลา" buckets stay accurate after approval.
  const approveOffsite = async (id: string) => {
    setActingId(id)
    try {
      await attendanceApi.approveOffsite(id)
      setPendingMsg({ text: 'อนุมัติแล้ว', ok: true })
      await loadHRBundle()
    } catch (e: any) {
      setPendingMsg({ text: e?.response?.data?.message || 'อนุมัติไม่สำเร็จ', ok: false })
    } finally { setActingId(null) }
  }
  const rejectOffsite = async (id: string, reason: string) => {
    setActingId(id)
    try {
      await attendanceApi.rejectOffsite(id, reason || undefined)
      setPendingMsg({ text: 'ปฏิเสธแล้ว', ok: true })
      setRejectingId(null); setRejectingKind(null); setRejectReason('')
      await loadHRBundle()
    } catch (e: any) {
      setPendingMsg({ text: e?.response?.data?.message || 'ปฏิเสธไม่สำเร็จ', ok: false })
    } finally { setActingId(null) }
  }
  const approveBackdate = async (id: string) => {
    setActingId(id)
    try {
      await attendanceApi.approveBackdate(id)
      setPendingMsg({ text: 'อนุมัติแล้ว', ok: true })
      await loadHRBundle()
    } catch (e: any) {
      setPendingMsg({ text: e?.response?.data?.message || 'อนุมัติไม่สำเร็จ', ok: false })
    } finally { setActingId(null) }
  }
  const rejectBackdate = async (id: string, reason: string) => {
    setActingId(id)
    try {
      await attendanceApi.rejectBackdate(id, reason || undefined)
      setPendingMsg({ text: 'ปฏิเสธแล้ว', ok: true })
      setRejectingId(null); setRejectingKind(null); setRejectReason('')
      await loadHRBundle()
    } catch (e: any) {
      setPendingMsg({ text: e?.response?.data?.message || 'ปฏิเสธไม่สำเร็จ', ok: false })
    } finally { setActingId(null) }
  }

  // Auto-dismiss success toasts; errors persist until next action.
  useEffect(() => {
    if (!pendingMsg || !pendingMsg.ok) return
    const t = setTimeout(() => setPendingMsg(null), 3500)
    return () => clearTimeout(t)
  }, [pendingMsg])

  const handleReadAnnouncement = async (id: string) => {
    try {
      await announcementApi.markRead(id)
      setAnnouncements(prev => prev.map(a => a.id === id ? { ...a, is_read: true } : a))
    } catch {}
  }

  const unreadCount = announcements.filter(a => !a.is_read).length

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Hero header — gradient panel with greeting + date + unread chip.
          Replaces the plain text header so the dashboard reads as a
          landing page rather than a sea of cards. The radial accent
          mirrors the brand green without overwhelming the content
          below it. */}
      <div
        className="mb-6 relative overflow-hidden rounded-[16px] px-5 py-5 border border-[#1D9E75]/15"
        style={{
          background:
            'radial-gradient(circle at 100% 0%, rgba(29,158,117,0.10), transparent 50%),' +
            'linear-gradient(135deg, #FFFFFF 0%, #F4FAF7 100%)',
        }}
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-medium text-[#0F6E56] uppercase tracking-wide mb-1">
              <IconSparkles size={12} />
              {greetingForHour()}
            </div>
            <h1 className="text-2xl font-semibold text-[#111110] leading-tight">
              {/* /auth/login returns camelCase (firstName), /auth/me
                  returns snake_case (first_name) — after a page refresh
                  the store has the latter, so accept both. fullName is
                  the final fallback. */}
              {user?.role === 'owner' ? 'คุณ' : ''}{
                user?.firstName || user?.first_name || user?.fullName || ''
              }
            </h1>
            <p className="text-xs text-gray-500 mt-1">{today}</p>
          </div>
          {unreadCount > 0 && (
            <Link
              href="/announcements"
              className="flex items-center gap-2 bg-white border border-[#FAEEDA] text-[#633806] px-3 py-1.5 rounded-full text-xs font-medium shadow-sm hover:shadow-md transition-shadow"
            >
              <IconBell size={13} />
              ประกาศใหม่ {unreadCount} รายการ
              <IconArrowRight size={11} className="opacity-60" />
            </Link>
          )}
        </div>
      </div>

      {/* Check-in status (employee) */}
      {user?.role === 'employee' && (
        <div className={clsx(
          'card mb-6 flex items-center gap-4 p-4',
          todayLog?.check_in_at ? 'border-[#1D9E75]/30 bg-[#E1F5EE]/40' : 'border-amber-200 bg-amber-50/60'
        )}>
          <div className={clsx('w-10 h-10 rounded-full flex items-center justify-center',
            todayLog?.check_in_at ? 'bg-[#1D9E75]' : 'bg-amber-400')}>
            {todayLog?.check_in_at
              ? <IconClockCheck size={20} className="text-white" />
              : <IconClock size={20} className="text-white" />}
          </div>
          <div className="flex-1">
            {todayLog?.check_in_at ? (
              <>
                <div className="text-sm font-medium text-[#085041]">เช็คอินแล้ว</div>
                <div className="text-xs text-gray-500">
                  เข้า {dayjs(todayLog.check_in_at).format('HH:mm น.')}
                  {todayLog.check_out_at ? ` · ออก ${dayjs(todayLog.check_out_at).format('HH:mm น.')}` : ' · ยังไม่ได้เช็คเอาท์'}
                </div>
              </>
            ) : (
              <>
                <div className="text-sm font-medium text-amber-700">ยังไม่ได้เช็คอินวันนี้</div>
                <div className="text-xs text-gray-500">กดปุ่มด้านขวาเพื่อเช็คอิน</div>
              </>
            )}
          </div>
          {!todayLog?.check_in_at && (
            <Link href="/attendance" className="btn btn-primary text-xs px-4 py-2">
              เช็คอินเลย
            </Link>
          )}
          {todayLog?.check_in_at && !todayLog?.check_out_at && (
            <Link href="/attendance" className="btn text-xs px-4 py-2">
              เช็คเอาท์
            </Link>
          )}
        </div>
      )}

      {/* HR/owner: per-person status list instead of opaque "5 ยังไม่
          เข้า" tiles. For small companies (≤30 people) seeing each
          named row with their status is far more actionable — HR can
          click a row to open the employee detail, or the inline
          "บันทึก" button to record attendance for someone who forgot
          to tap. The pending-approval queues below this stay as-is
          because they're the other thing HR opens the dashboard for. */}
      {isHROrOwner && summary && (
        <div className="card mb-6"
          style={{ background: 'linear-gradient(135deg, #FFFFFF 0%, #F0F8F4 100%)' }}>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="text-sm font-semibold text-[#111110] flex items-center gap-2">
              <IconUsers size={14} className="text-[#1D9E75]" />
              พนักงานวันนี้
              <span className="text-[11px] font-normal text-gray-400">
                ({summary.summary.expected ?? summary.summary.total ?? 0} คน)
              </span>
            </h2>
            <div className="flex items-center gap-2">
              <Link href="/attendance" className="btn text-xs py-1.5" title="ลงเวลาให้พนักงานคนใดก็ได้">
                <IconClock size={13} /> ลงเวลาให้พนักงาน
              </Link>
              <Link href="/attendance" className="text-xs text-[#1D9E75] hover:underline flex items-center gap-1">
                ดูทั้งหมด <IconArrowRight size={12} />
              </Link>
            </div>
          </div>

          {/* Holiday banner — if today's a public holiday, say so
              prominently. Saves HR from reading "no one checked in"
              and wondering whether they all called in sick. */}
          {summary.holiday && (
            <div className="mb-3 px-3 py-2 rounded-md bg-red-50 border border-red-100 text-red-700 text-xs flex items-center gap-2">
              <IconBeach size={14} />
              <span><b>วันนี้เป็นวันหยุด:</b> {summary.holiday.name}</span>
            </div>
          )}

          {/* Per-person table. Roster comes from backend already
              owner-excluded; we just merge with the records to find
              each person's status. */}
          <PersonStatusList
            roster={summary.roster || []}
            records={summary.records || []}
            holiday={summary.holiday}
            shifts={summary.shifts || []}
          />

          {/* Attendance rate — kept as a slim progress bar at the
              bottom for HR who wants a single number, but no longer
              the primary metric. Hidden when nothing's scheduled
              (weekend with everyone on dayoff, or a holiday). */}
          {(summary.summary.expected ?? 0) > 0 && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-[11px] text-gray-500 mb-1">
                <span>อัตราการเข้างาน</span>
                <span className="font-medium text-[#085041] tabular-nums">{summary.summary.attendanceRate ?? 0}%</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-[#1D9E75] rounded-full transition-all"
                  style={{ width: `${Math.min(100, summary.summary.attendanceRate || 0)}%` }} />
              </div>
            </div>
          )}

          {pendingMsg && (
            <div className={clsx(
              'mt-3 px-3 py-2 rounded-md text-xs flex items-center justify-between border',
              pendingMsg.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'
            )}>
              <span>{pendingMsg.text}</span>
              <button onClick={() => setPendingMsg(null)} className="opacity-70 hover:opacity-100">ปิด</button>
            </div>
          )}

          {/* Pending offsite check-ins. Compact rows: name + time + distance
              + reason, with inline approve/reject. Rejection reveals a
              reason textarea right below the row. */}
          {offsitePending.length > 0 && (
            <div className="mt-4 pt-3 border-t border-black/[0.05]">
              <h3 className="text-xs font-semibold text-[#111110] mb-2 flex items-center gap-2">
                <IconMapPin size={12} className="text-[#BA7517]" />
                ลงเวลานอกสถานที่รออนุมัติ
                <span className="text-[10px] font-normal text-gray-400">({offsitePending.length})</span>
              </h3>
              <div className="space-y-2">
                {offsitePending.map(r => (
                  <div key={r.id} className="rounded-[10px] border border-amber-200 bg-amber-50/30 p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-medium text-[#111110]">
                          {r.first_name} {r.last_name}
                          <span className="text-[11px] text-gray-500 ml-2 tabular-nums">
                            · {dayjs(r.check_in_at).format('HH:mm')}
                          </span>
                          {r.check_in_distance_m != null && (
                            <span className="text-[11px] text-gray-400 ml-1">
                              · ห่าง {(r.check_in_distance_m / 1000).toFixed(1)} กม.
                            </span>
                          )}
                        </div>
                        <div className="text-[12px] text-gray-700 mt-0.5 break-words">{r.offsite_reason}</div>
                      </div>
                      <div className="flex flex-col gap-1 flex-shrink-0">
                        <button
                          onClick={() => approveOffsite(r.id)}
                          disabled={actingId === r.id}
                          className="btn btn-primary text-[11px] px-2 py-1"
                        >
                          <IconCheck size={12} /> อนุมัติ
                        </button>
                        <button
                          onClick={() => { setRejectingId(r.id); setRejectingKind('offsite'); setRejectReason('') }}
                          disabled={actingId === r.id}
                          className="btn text-[11px] px-2 py-1 text-red-600 border-red-200 hover:bg-red-50"
                        >
                          <IconX size={12} /> ปฏิเสธ
                        </button>
                      </div>
                    </div>
                    {rejectingId === r.id && rejectingKind === 'offsite' && (
                      <div className="mt-2 p-2 rounded-[8px] bg-red-50/60 border border-red-100">
                        <textarea
                          className="input text-[11px] min-h-[40px]"
                          placeholder="เหตุผลที่ปฏิเสธ (ไม่บังคับ)"
                          value={rejectReason}
                          onChange={e => setRejectReason(e.target.value)}
                          autoFocus
                        />
                        <div className="flex gap-1.5 mt-1.5">
                          <button onClick={() => rejectOffsite(r.id, rejectReason)} className="btn text-[11px] text-red-600 border-red-200 hover:bg-red-50">
                            ยืนยันปฏิเสธ
                          </button>
                          <button onClick={() => { setRejectingId(null); setRejectingKind(null); setRejectReason('') }} className="btn text-[11px]">
                            ยกเลิก
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pending backdated check-in/check-out. Same layout family as
              the offsite queue (violet-tinted instead of amber so the
              two are easy to distinguish at a glance). */}
          {backdatePending.length > 0 && (
            <div className="mt-4 pt-3 border-t border-black/[0.05]">
              <h3 className="text-xs font-semibold text-[#111110] mb-2 flex items-center gap-2">
                <IconClock size={12} className="text-[#534AB7]" />
                ลงเวลาย้อนหลังรออนุมัติ
                <span className="text-[10px] font-normal text-gray-400">({backdatePending.length})</span>
              </h3>
              <div className="space-y-2">
                {backdatePending.map(r => {
                  const typeTxt = r.request_type === 'both'     ? 'เข้า+ออกงาน'
                                : r.request_type === 'check_in' ? 'เข้างาน'
                                :                                  'ออกงาน'
                  return (
                    <div key={r.id} className="rounded-[10px] border border-violet-200 bg-violet-50/30 p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-medium text-[#111110]">
                            {r.first_name} {r.last_name}
                            <span className="text-[11px] text-gray-500 ml-2">
                              · {dayjs(r.date).format('D MMM')} {typeTxt}
                              {r.check_in_time && ` ${r.check_in_time}`}
                              {r.check_out_time && `–${r.check_out_time}`}
                            </span>
                          </div>
                          <div className="text-[12px] text-gray-700 mt-0.5 break-words">{r.reason}</div>
                        </div>
                        <div className="flex flex-col gap-1 flex-shrink-0">
                          <button
                            onClick={() => approveBackdate(r.id)}
                            disabled={actingId === r.id}
                            className="btn btn-primary text-[11px] px-2 py-1"
                          >
                            <IconCheck size={12} /> อนุมัติ
                          </button>
                          <button
                            onClick={() => { setRejectingId(r.id); setRejectingKind('backdate'); setRejectReason('') }}
                            disabled={actingId === r.id}
                            className="btn text-[11px] px-2 py-1 text-red-600 border-red-200 hover:bg-red-50"
                          >
                            <IconX size={12} /> ปฏิเสธ
                          </button>
                        </div>
                      </div>
                      {rejectingId === r.id && rejectingKind === 'backdate' && (
                        <div className="mt-2 p-2 rounded-[8px] bg-red-50/60 border border-red-100">
                          <textarea
                            className="input text-[11px] min-h-[40px]"
                            placeholder="เหตุผลที่ปฏิเสธ (ไม่บังคับ)"
                            value={rejectReason}
                            onChange={e => setRejectReason(e.target.value)}
                            autoFocus
                          />
                          <div className="flex gap-1.5 mt-1.5">
                            <button onClick={() => rejectBackdate(r.id, rejectReason)} className="btn text-[11px] text-red-600 border-red-200 hover:bg-red-50">
                              ยืนยันปฏิเสธ
                            </button>
                            <button onClick={() => { setRejectingId(null); setRejectingKind(null); setRejectReason('') }} className="btn text-[11px]">
                              ยกเลิก
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Attendance chart (HR/Owner) */}
        {isHROrOwner && (
          <div className="card lg:col-span-2">
            <SectionHeader title="การมาทำงาน 5 วันทำการล่าสุด" href="/attendance" />
            {loading ? (
              <div className="h-[180px] flex items-end gap-2 px-2">
                {/* Bar-graph-shaped skeletons so the layout doesn't
                    jump when real bars render. */}
                {[60, 80, 45, 70, 55].map((h, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <Skeleton className="w-full" style={{ height: `${h}%` }} />
                    <Skeleton className="w-8 h-2" />
                  </div>
                ))}
              </div>
            ) : chartRows.length === 0 || chartRows.every(r => !r.present && !r.late && !r.absent) ? (
              <EmptyState
                icon={IconChartBar}
                title="ยังไม่มีข้อมูลการลงเวลา"
                description="พอพนักงานเริ่มเช็คอินกราฟจะขึ้นที่นี่"
                size="compact"
                tone="gray"
              />
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={chartRows} barSize={14} barGap={3}>
                  <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#9CA3AF' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#9CA3AF' }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.08)', boxShadow: 'none' }}
                    cursor={{ fill: 'rgba(0,0,0,0.03)' }}
                    labelFormatter={(label, payload) => {
                      const row = payload?.[0]?.payload as any
                      return row?.date ? dayjs(row.date).format('D MMM BBYY') : label
                    }}
                  />
                  <Bar dataKey="present" name="มาทำงาน" radius={[4,4,0,0]} fill="#1D9E75" />
                  <Bar dataKey="late"    name="สาย"     radius={[4,4,0,0]} fill="#BA7517" />
                  <Bar dataKey="absent"  name="ขาด"     radius={[4,4,0,0]} fill="#E24B4A" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        )}

        {/* Leave quota (employee) */}
        {user?.role === 'employee' && leaveQuota.length > 0 && (
          <div className="card">
            <SectionHeader title="วันลาคงเหลือ" href="/leave" />
            <div className="space-y-3">
              {leaveQuota.map((q: any) => {
                const pct = Math.round((q.used_days / q.total_days) * 100)
                return (
                  <div key={q.id}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-700">{q.leave_type_name}</span>
                      <span className="font-medium text-[#111110]">{q.remaining_days}/{q.total_days} วัน</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: pct > 80 ? '#E24B4A' : pct > 50 ? '#BA7517' : '#1D9E75' }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Leave quota fallback (employee, no data yet) — show empty
            state instead of fabricated quota numbers. */}
        {role === 'employee' && leaveQuota.length === 0 && !loading && (
          <div className="card">
            <SectionHeader title="วันลาคงเหลือ" href="/leave" />
            <EmptyState
              icon={IconCalendarOff}
              title="ยังไม่ได้ตั้งค่าโควตา"
              description="ติดต่อ HR เพื่อขอเปิดโควตาวันลาประจำปี"
              size="compact"
              tone="gray"
            />
          </div>
        )}

        {/* Upcoming events — visible to everyone (backend already
            visibility-filters). Hidden when there's nothing in the
            7-day window so it doesn't pad the page. */}
        {upcomingEvents.length > 0 && (
          <div className={clsx('card', isHROrOwner ? 'lg:col-span-1' : 'lg:col-span-2')}>
            <SectionHeader title="กิจกรรมเร็วๆ นี้" href="/calendar" />
            <UpcomingEventsList events={upcomingEvents} />
          </div>
        )}

        {/* Announcements */}
        <div className={clsx('card', isHROrOwner ? 'lg:col-span-1' : 'lg:col-span-2')}>
          <SectionHeader title="ประกาศ" href="/announcements" />
          {loading ? (
            <div className="space-y-2">
              <SkeletonRow />
              <SkeletonRow />
            </div>
          ) : announcements.length === 0 ? (
            <EmptyState
              icon={IconSpeakerphone}
              title="ยังไม่มีประกาศ"
              description="ประกาศใหม่จากบริษัทจะแสดงที่นี่"
              size="compact"
              tone="gray"
            />
          ) : (
            <div className="space-y-2">
              {announcements.slice(0, 3).map((a: any) => (
                <AnnouncementItem key={a.id} item={a} onRead={handleReadAnnouncement} />
              ))}
            </div>
          )}
        </div>

        {/* Quick actions — filtered by role so owner doesn't see actions
            they can't take (เช็คอิน / ขอ OT are blocked at the backend
            for owner). */}
        <div className="card">
          <SectionHeader title="ทางลัด" />
          <div className="grid grid-cols-2 gap-2">
            {[
              { href: '/attendance', icon: IconClockCheck, label: 'เช็คอิน', color: '#1D9E75', bg: '#E1F5EE', roles: ['hr','employee'] as const },
              // /leave: employees & HR file requests; owner only approves
              // them, so the label changes to match what they'll actually do.
              { href: '/leave',      icon: IconCalendarOff, label: role === 'owner' ? 'อนุมัติลา' : 'ยื่นลา', color: '#534AB7', bg: '#EEEDFE', roles: ['hr','employee','owner'] as const },
              { href: '/ot',         icon: IconClockPlus, label: role === 'owner' ? 'อนุมัติ OT' : 'ขอ OT',  color: '#BA7517', bg: '#FAEEDA', roles: ['hr','employee','owner'] as const },
              { href: '/payroll',    icon: IconTrendingUp, label: role === 'employee' ? 'ดูสลิป' : 'เงินเดือน', color: '#185FA5', bg: '#E6F1FB', roles: ['hr','employee','owner'] as const },
            ]
              .filter(a => !role || (a.roles as readonly string[]).includes(role))
              .map(({ href, icon: Icon, label, color, bg }) => (
                <Link
                  key={href}
                  href={href}
                  className="group flex flex-col items-center gap-2 p-3 rounded-[12px] border border-black/[0.05] hover:border-black/[0.12] hover:bg-gray-50/60 hover:-translate-y-0.5 hover:shadow-sm transition-all duration-200 text-center"
                >
                  <div
                    className="w-9 h-9 rounded-[10px] flex items-center justify-center transition-transform duration-200 group-hover:scale-110"
                    style={{ background: bg }}
                  >
                    <Icon size={17} style={{ color }} />
                  </div>
                  <span className="text-xs text-gray-700 font-medium">{label}</span>
                </Link>
              ))}
          </div>
        </div>

      </div>
    </div>
  )
}

// ============================================================
// PER-PERSON STATUS LIST (HR/owner)
// ============================================================
// Joins the roster (everyone we expect to be working today) with
// the per-employee attendance record so each row shows: avatar +
// name + status + (for "ยังไม่เข้า" people) a quick "ลงเวลาให้"
// link to /attendance.
//
// For small companies (≤30 people) this is more actionable than a
// "5 ยังไม่เข้า" counter — HR sees WHO they need to chase.

interface RosterPerson {
  id: string
  first_name: string
  last_name: string
  nickname?: string | null
  avatar_url?: string | null
  emp_code?: string | null
  position?: string | null
  department_name?: string | null
  user_role?: 'owner' | 'hr' | 'employee' | string | null
  shift_type?: string | null
  weekly_shifts?: Record<string, string> | null
  is_day_off?: boolean
  is_holiday?: boolean
  holiday_name?: string | null
}
interface ShiftConfig {
  code: string | null
  shift_type: string
  work_start: string | null   // 'HH:MM:SS'
  work_end: string | null
}

// Roster + records → grouped + sorted display. The visual order matters
// for at-a-glance triage: people who showed up live at the top (good),
// people on planned absence in the middle (expected), people HR needs
// to chase at the bottom (red). Each group has a one-line header with
// a count so the eye can scan the gist before diving into names.
function PersonStatusList({
  roster, records, holiday, shifts,
}: {
  roster: RosterPerson[]
  records: any[]
  holiday: { name: string } | null
  shifts: ShiftConfig[]
}) {
  if (roster.length === 0) {
    return (
      <p className="text-xs text-gray-400 text-center py-6">
        ยังไม่มีพนักงานในระบบ
      </p>
    )
  }
  const recById = new Map<string, any>()
  for (const r of records) recById.set(r.employee_id, r)

  // Compute the status once per person — used both for sorting/grouping
  // and for rendering. Each annotated person carries:
  //   _status: derived bucket (PersonStatusKind)
  //   _shiftStart: 'HH:MM' for "กะเริ่ม" hint (only relevant for
  //                not_checked_in / late so we hide it elsewhere)
  const dowKey = String(new Date().getDay())
  const annotated = roster.map(p => {
    const rec = recById.get(p.id)
    const status = personStatus(p, rec)
    const shiftStart = resolveShiftStart(p, shifts, dowKey)
    return { p, rec, status, shiftStart }
  })

  // Visual priority — present at top (positive signal), then planned
  // absences (expected), pending review, day-off/holiday muted, and
  // ยังไม่เข้า last so it draws the eye to the action-needed group.
  const GROUP_ORDER: Array<{ kind: PersonStatusKind | 'present_combo'; label: string; tone: 'green' | 'amber' | 'red' | 'gray' | 'violet' }> = [
    { kind: 'present_combo',  label: 'เข้าแล้ว',   tone: 'green' },
    { kind: 'late',            label: 'มาสาย',     tone: 'amber' },
    { kind: 'offsite_pending', label: 'นอกสถานที่ (รออนุมัติ)', tone: 'amber' },
    { kind: 'leave',           label: 'ลา',         tone: 'violet' },
    { kind: 'absent',          label: 'ขาด',         tone: 'red' },
    { kind: 'not_checked_in',  label: 'ยังไม่เข้า',  tone: 'red' },
    { kind: 'day_off',         label: 'วันหยุดของพนักงาน', tone: 'gray' },
    { kind: 'holiday',         label: 'วันหยุด',     tone: 'gray' },
  ]
  const grouped = GROUP_ORDER.map(g => ({
    ...g,
    rows: annotated.filter(a => {
      if (g.kind === 'present_combo') return a.status.kind === 'on_time' || a.status.kind === 'almost_late'
      return a.status.kind === g.kind
    }),
  })).filter(g => g.rows.length > 0)

  // Within a group, sort by check-in time ascending (earliest first)
  // — feels natural and means the always-on-time people stay at the
  // very top of the present group.
  for (const g of grouped) {
    g.rows.sort((a, b) => {
      const ta = a.rec?.check_in_at ? new Date(a.rec.check_in_at).getTime() : 0
      const tb = b.rec?.check_in_at ? new Date(b.rec.check_in_at).getTime() : 0
      if (ta !== tb) return ta - tb
      return (a.p.first_name || '').localeCompare(b.p.first_name || '', 'th')
    })
  }

  return (
    <div className="space-y-3">
      {grouped.map(g => (
        <div key={g.kind as string}>
          <GroupHeader label={g.label} count={g.rows.length} tone={g.tone} />
          <div className="divide-y divide-black/[0.04]">
            {g.rows.map(({ p, rec, status, shiftStart }) => (
              <PersonRow
                key={p.id}
                person={p}
                rec={rec}
                status={status}
                shiftStart={shiftStart}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// One row in the per-person table. Pulls out into its own component
// so we can keep the parent map clean.
function PersonRow({ person: p, rec, status, shiftStart }: {
  person: RosterPerson
  rec: any
  status: PersonStatus
  shiftStart: string | null
}) {
  return (
    <div className="flex items-center gap-3 py-2.5 px-1 hover:bg-white/40 rounded transition-colors">
      <RoleAvatar person={p} />
      <div className="flex-1 min-w-0">
        <Link href={`/employees/${p.id}`} className="text-sm font-medium text-[#111110] truncate hover:underline">
          {p.first_name} {p.last_name}
          {p.nickname && <span className="text-gray-400 font-normal ml-1">({p.nickname})</span>}
        </Link>
        {/* Sub-text: prefer position, fall back to department, then
            employee code — pick the most-specific thing we have so
            the row never feels empty. */}
        <PersonSubLabel person={p} status={status} shiftStart={shiftStart} rec={rec} />
      </div>
      <PersonStatusBadge status={status} />
      {(status.kind === 'not_checked_in' || status.kind === 'absent') && (
        <Link
          href="/attendance"
          className="text-[11px] text-[#1D9E75] hover:underline whitespace-nowrap"
          title="เปิดหน้า /attendance เพื่อบันทึกเวลาให้พนักงานคนนี้"
        >
          บันทึก →
        </Link>
      )}
    </div>
  )
}

// Two-line sub-label under the name. Top line = position/dept/code.
// Bottom line = situational hint that changes by status:
//   - checked-in: "เข้า 08:45 · 23 นาทีที่แล้ว"
//   - late: "เข้า 09:20 · กะเริ่ม 09:00 (สาย 20 นาที)"
//   - not_checked_in: "กะเริ่ม 09:00"
//   - leave/day_off/holiday: nothing (label already tells you)
function PersonSubLabel({ person: p, status, shiftStart, rec }: {
  person: RosterPerson
  status: PersonStatus
  shiftStart: string | null
  rec: any
}) {
  const primary = p.position || p.department_name || p.emp_code || ''
  let hint: string | null = null
  if (rec?.check_in_at && (status.kind === 'on_time' || status.kind === 'almost_late' || status.kind === 'late' || status.kind === 'offsite_pending')) {
    const t = dayjs(rec.check_in_at)
    const ago = relativeAgoShort(t)
    const time = t.format('HH:mm')
    if (status.kind === 'late' && shiftStart) {
      const lateMin = minutesBetween(shiftStart, time)
      hint = `เข้า ${time} · กะเริ่ม ${shiftStart}${lateMin > 0 ? ` (สาย ${lateMin} นาที)` : ''}`
    } else {
      hint = `เข้า ${time} · ${ago}`
    }
  } else if (status.kind === 'not_checked_in' && shiftStart) {
    hint = `กะเริ่ม ${shiftStart}`
  }
  if (!primary && !hint) return null
  return (
    <div className="text-[11px] text-gray-400 truncate">
      {primary}
      {primary && hint && <span className="mx-1">·</span>}
      {hint && <span className={status.kind === 'late' ? 'text-amber-700' : ''}>{hint}</span>}
    </div>
  )
}

// Role-colored avatar that falls back to a single initial when there's
// no avatar_url. Matches the role colors used in the login page chips
// (owner=violet, hr=green, employee=blue) so the same person looks
// the same everywhere.
function RoleAvatar({ person }: { person: RosterPerson }) {
  if (person.avatar_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={person.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
  }
  const ROLE_BG: Record<string, string> = {
    owner: '#534AB7',
    hr: '#1D9E75',
    employee: '#185FA5',
  }
  const bg = ROLE_BG[person.user_role || 'employee'] || ROLE_BG.employee
  const initial = (person.nickname || person.first_name || '?').charAt(0)
  return (
    <div
      className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0"
      style={{ background: bg }}
    >
      {initial}
    </div>
  )
}

// Group header — pill-style count next to a label. Tone follows the
// group's status so the eye picks up the section at a glance.
function GroupHeader({ label, count, tone }: {
  label: string
  count: number
  tone: 'green' | 'amber' | 'red' | 'gray' | 'violet'
}) {
  const TONE = {
    green:  'bg-emerald-100 text-emerald-700',
    amber:  'bg-amber-100 text-amber-700',
    red:    'bg-red-100 text-red-700',
    gray:   'bg-gray-100 text-gray-600',
    violet: 'bg-violet-100 text-violet-700',
  } as const
  return (
    <div className="flex items-center gap-2 px-1 py-1">
      <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">{label}</span>
      <span className={clsx('text-[10px] font-semibold px-1.5 rounded-full', TONE[tone])}>{count}</span>
    </div>
  )
}

// Resolve an employee's shift start time for today's day-of-week.
// Priority:
//   1. weekly_shifts[dow] → look up by code in shifts list
//   2. fallback to first config of employee.shift_type
//   3. fallback to first config of 'normal'
//   4. give up → null (UI hides the hint)
function resolveShiftStart(p: RosterPerson, shifts: ShiftConfig[], dowKey: string): string | null {
  const fmt = (s: string | null | undefined) => s ? String(s).slice(0, 5) : null
  const code = p.weekly_shifts?.[dowKey]
  if (code && code !== 'dayoff') {
    const m = shifts.find(s => s.code === code)
    if (m?.work_start) return fmt(m.work_start)
  }
  if (p.shift_type) {
    const m = shifts.find(s => s.shift_type === p.shift_type)
    if (m?.work_start) return fmt(m.work_start)
  }
  const fallback = shifts.find(s => s.shift_type === 'normal')
  return fmt(fallback?.work_start) || null
}

// Convert "08:45" + "09:00" → 15 (positive minutes late). Negative
// values clamp to 0 (early arrival isn't "late").
function minutesBetween(start: string, actual: string): number {
  const [sh, sm] = start.split(':').map(n => parseInt(n, 10) || 0)
  const [ah, am] = actual.split(':').map(n => parseInt(n, 10) || 0)
  return Math.max(0, (ah * 60 + am) - (sh * 60 + sm))
}

// "23 นาทีที่แล้ว" / "1 ชม. ที่แล้ว" — compact relative time. Anything
// older than 8 hours falls back to just the time so we don't show
// "เมื่อวาน" for an old row.
function relativeAgoShort(t: dayjs.Dayjs): string {
  const now = dayjs()
  const minutes = now.diff(t, 'minute')
  if (minutes < 1) return 'เมื่อสักครู่'
  if (minutes < 60) return `${minutes} นาทีที่แล้ว`
  const hours = now.diff(t, 'hour')
  if (hours < 8) return `${hours} ชม. ที่แล้ว`
  return t.format('HH:mm')
}

type PersonStatusKind =
  | 'on_time' | 'almost_late' | 'late' | 'absent' | 'leave'
  | 'not_checked_in' | 'day_off' | 'holiday' | 'offsite_pending'
interface PersonStatus {
  kind: PersonStatusKind
  label: string
  time?: string
  detail?: string
}

// Decide what to show for one person. Priority:
//   1. Holiday for everyone → "วันหยุด name"
//   2. Their own day-off    → "วันหยุดของคุณ"
//   3. Have a record        → derive from record.status + flags
//   4. Otherwise            → ยังไม่เข้า
function personStatus(p: RosterPerson, rec: any): PersonStatus {
  if (p.is_holiday) return { kind: 'holiday', label: p.holiday_name || 'วันหยุด' }
  if (p.is_day_off) return { kind: 'day_off', label: 'วันหยุด' }
  if (rec) {
    const time = rec.check_in_at ? dayjs(rec.check_in_at).format('HH:mm') : undefined
    if (rec.is_offsite && rec.offsite_status === 'pending') {
      return { kind: 'offsite_pending', label: 'รออนุมัติ', time }
    }
    if (rec.status === 'leave') return { kind: 'leave', label: 'ลา' }
    if (rec.status === 'absent') return { kind: 'absent', label: 'ขาด' }
    if (rec.status === 'late') return { kind: 'late', label: 'สาย', time }
    if (rec.status === 'present' && rec.almost_late) return { kind: 'almost_late', label: 'เกือบสาย', time }
    if (rec.status === 'present') return { kind: 'on_time', label: 'ตรงเวลา', time }
  }
  return { kind: 'not_checked_in', label: 'ยังไม่เข้า' }
}

function PersonStatusBadge({ status }: { status: PersonStatus }) {
  // Visual: muted for "you're off" states, color-coded for active
  // statuses. Time pill sits next to the label when relevant.
  const STYLE: Record<PersonStatusKind, string> = {
    on_time:         'bg-emerald-50 text-emerald-700 border-emerald-200',
    almost_late:     'bg-amber-50 text-amber-700 border-amber-200',
    late:            'bg-orange-50 text-orange-700 border-orange-200',
    absent:          'bg-red-50 text-red-700 border-red-200',
    leave:           'bg-violet-50 text-violet-700 border-violet-200',
    not_checked_in:  'bg-red-50/60 text-red-600 border-red-100',
    day_off:         'bg-gray-100 text-gray-600 border-gray-200',
    holiday:         'bg-red-50 text-red-700 border-red-200',
    offsite_pending: 'bg-amber-50 text-amber-700 border-amber-200',
  }
  return (
    <span className={clsx(
      'inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md border whitespace-nowrap',
      STYLE[status.kind] || STYLE.not_checked_in
    )}>
      {status.label}
      {status.time && <span className="opacity-70 tabular-nums">{status.time}</span>}
    </span>
  )
}

// ============================================================
// UPCOMING EVENTS LIST
// ============================================================
// Show today + next ~7 days. Holidays come from a separate table so
// they're not in this list — the calendar page is where you see all
// three together. Events here come from calendar_events.

function UpcomingEventsList({ events }: { events: CalendarEvent[] }) {
  const EVENT_TYPE_LABEL: Record<string, string> = {
    meeting: 'ประชุม', seminar: 'สัมมนา', company: 'กิจกรรมบริษัท',
    birthday: 'วันเกิด', other: 'อื่นๆ',
  }
  const today = dayjs().format('YYYY-MM-DD')
  const tomorrow = dayjs().add(1, 'day').format('YYYY-MM-DD')
  const friendlyDate = (d: string) => {
    if (d === today) return 'วันนี้'
    if (d === tomorrow) return 'พรุ่งนี้'
    return dayjs(d).format('D MMM')
  }
  return (
    <div className="space-y-2">
      {events.slice(0, 5).map(e => {
        const cDot = ({
          green: 'bg-emerald-500', amber: 'bg-amber-500', red: 'bg-red-500',
          purple: 'bg-violet-500', blue: 'bg-blue-500', gray: 'bg-gray-400',
        } as const)[e.color || 'blue'] || 'bg-blue-500'
        return (
          <div key={e.id} className="flex items-start gap-2 p-2 rounded-md hover:bg-gray-50">
            <span className={clsx('w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0', cDot)} />
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-medium text-[#111110] truncate">{e.title}</div>
              <div className="text-[10px] text-gray-500 flex items-center gap-1.5 mt-0.5">
                <span className="text-[#1D9E75] font-medium">{friendlyDate(e.start_date)}</span>
                {e.start_time && <span className="tabular-nums">{String(e.start_time).slice(0, 5)}</span>}
                <span className="opacity-60">·</span>
                <span>{EVENT_TYPE_LABEL[e.event_type] || e.event_type}</span>
              </div>
            </div>
          </div>
        )
      })}
      {events.length > 5 && (
        <div className="text-[11px] text-gray-400 text-center pt-1">
          +{events.length - 5} กิจกรรม
        </div>
      )}
    </div>
  )
}
