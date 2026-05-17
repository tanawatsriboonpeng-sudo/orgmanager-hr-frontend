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
  IconCheck, IconClock
} from '@tabler/icons-react'
import Link from 'next/link'
import clsx from 'clsx'
import dayjs from 'dayjs'
import 'dayjs/locale/th'
dayjs.locale('th')

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

        if (isHROrOwner) {
          const [sumRes, chartRes] = await Promise.all([
            attendanceApi.dailySummary().catch(() => null),
            attendanceApi.recentSummary(5).catch(() => null),
          ])
          if (sumRes) setSummary(sumRes.data.data)
          if (chartRes) setChartRows(chartRes.data.data || [])
        }
      } finally {
        setLoading(false)
      }
    }
    loadAll()
  }, [isOwner, isHROrOwner])

  const handleReadAnnouncement = async (id: string) => {
    try {
      await announcementApi.markRead(id)
      setAnnouncements(prev => prev.map(a => a.id === id ? { ...a, is_read: true } : a))
    } catch {}
  }

  const unreadCount = announcements.filter(a => !a.is_read).length

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#111110]">
            สวัสดี{user?.role === 'owner' ? 'คุณ' : ''} {user?.firstName} 👋
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{today}</p>
        </div>
        {unreadCount > 0 && (
          <div className="flex items-center gap-2 bg-[#FAEEDA] text-[#633806] px-3 py-1.5 rounded-full text-xs font-medium">
            <IconBell size={13} />
            ประกาศใหม่ {unreadCount} รายการ
          </div>
        )}
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
          same 6-bucket layout the /attendance daily summary uses so
          the landing page surfaces the same level of detail without
          forcing a navigation. "ดูเพิ่มเติม" links to /attendance for
          per-record list + approval queues. */}
      {isHROrOwner && summary && (
        <div className="card mb-6"
          style={{ background: 'linear-gradient(135deg, #FFFFFF 0%, #F0F8F4 100%)' }}>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="text-sm font-semibold text-[#111110] flex items-center gap-2">
              <IconUsers size={14} className="text-[#1D9E75]" />
              ภาพรวมการลงเวลาวันนี้
            </h2>
            <Link href="/attendance" className="text-xs text-[#1D9E75] hover:underline flex items-center gap-1">
              จัดการลงเวลา <IconArrowRight size={12} />
            </Link>
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
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Attendance chart (HR/Owner) */}
        {isHROrOwner && (
          <div className="card lg:col-span-2">
            <SectionHeader title="การมาทำงาน 5 วันทำการล่าสุด" href="/attendance" />
            {chartRows.length === 0 || chartRows.every(r => !r.present && !r.late && !r.absent) ? (
              <div className="h-[180px] flex items-center justify-center text-xs text-gray-400">
                {loading ? 'กำลังโหลด…' : 'ยังไม่มีข้อมูลการลงเวลาในช่วงนี้'}
              </div>
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
            <div className="text-center py-6 text-xs text-gray-400">
              ยังไม่ได้ตั้งค่าโควตาวันลา
              <div className="text-[11px] text-gray-400 mt-1">ติดต่อ HR เพื่อขอเปิดโควตา</div>
            </div>
          </div>
        )}

        {/* Announcements */}
        <div className={clsx('card', isHROrOwner ? 'lg:col-span-1' : 'lg:col-span-2')}>
          <SectionHeader title="ประกาศ" href="/announcements" />
          {announcements.length === 0 ? (
            <div className="text-center py-6 text-gray-400 text-sm">ไม่มีประกาศ</div>
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
              { href: '/leave',      icon: IconCalendarOff, label: 'ยื่นลา', color: '#534AB7', bg: '#EEEDFE', roles: ['hr','employee','owner'] as const },
              { href: '/ot',         icon: IconClockPlus, label: 'ขอ OT',  color: '#BA7517', bg: '#FAEEDA', roles: ['hr','employee'] as const },
              { href: '/payroll',    icon: IconTrendingUp, label: role === 'employee' ? 'ดูสลิป' : 'เงินเดือน', color: '#185FA5', bg: '#E6F1FB', roles: ['hr','employee','owner'] as const },
            ]
              .filter(a => !role || (a.roles as readonly string[]).includes(role))
              .map(({ href, icon: Icon, label, color, bg }) => (
                <Link key={href} href={href} className="flex flex-col items-center gap-2 p-3 rounded-[10px] border border-black/[0.05] hover:border-black/[0.1] hover:bg-gray-50/80 transition-all text-center">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: bg }}>
                    <Icon size={16} style={{ color }} />
                  </div>
                  <span className="text-xs text-gray-600 font-medium">{label}</span>
                </Link>
              ))}
          </div>
        </div>

      </div>
    </div>
  )
}
