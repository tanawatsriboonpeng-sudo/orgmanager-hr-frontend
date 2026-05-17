'use client'
import { useEffect, useState } from 'react'
import { useAuthStore } from '@/lib/store'
import { attendanceApi, leaveApi, announcementApi } from '@/lib/api'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell
} from 'recharts'
import {
  IconUsers, IconClockCheck, IconCalendarOff, IconClockPlus,
  IconTrendingUp, IconAlertTriangle, IconBell, IconArrowRight,
  IconCheck, IconClock, IconMapPin, IconX, IconSparkles,
  IconSpeakerphone, IconChartBar,
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
          {item.created_by_name} · {dayjs(item.created_at).format('D MMM YY')}
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
  const today = dayjs().format('dddd ที่ D MMMM YYYY')

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
    <div className="p-6 max-w-6xl mx-auto animate-fade-in">
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
              {user?.role === 'owner' ? 'คุณ' : ''}{user?.firstName}
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

      {/* Rich attendance overview for HR/owner. Was a 4-card slim grid
          that mostly showed zeros and felt empty — replaced with the
          same 6-bucket layout the /attendance daily summary uses, plus
          inline approval queues for offsite/backdate requests so the
          owner doesn't have to navigate over to /attendance just to
          act on pending items. */}
      {isHROrOwner && summary && (
        <div className="card mb-6"
          style={{ background: 'linear-gradient(135deg, #FFFFFF 0%, #F0F8F4 100%)' }}>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="text-sm font-semibold text-[#111110] flex items-center gap-2">
              <IconUsers size={14} className="text-[#1D9E75]" />
              ภาพรวมการลงเวลาวันนี้
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

          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            <DashStat label="ทั้งหมด"   value={summary.summary.total ?? 0} color="#6B6A66" />
            <DashStat label="ตรงเวลา"   value={Math.max(0, (summary.summary.present ?? 0) - (summary.summary.almostLate ?? 0))} color="#1D9E75" />
            <DashStat label="เกือบสาย"  value={summary.summary.almostLate ?? 0} color="#D9914A" />
            <DashStat label="มาสาย"     value={summary.summary.late ?? 0} color="#BA7517" />
            <DashStat label="ยังไม่เข้า" value={summary.summary.notCheckedIn ?? 0} color="#E24B4A" />
            <DashStat label="ลา"        value={summary.summary.leave ?? 0} color="#534AB7" />
          </div>

          {summary.summary.total > 0 && (
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
                      return row?.date ? dayjs(row.date).format('D MMM YY') : label
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
              icon={IconMegaphone}
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
