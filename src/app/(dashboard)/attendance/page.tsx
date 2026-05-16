'use client'
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { attendanceApi } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import {
  IconMapPin, IconClockCheck, IconClockOff, IconAlertTriangle,
  IconCheck, IconCrown, IconChevronDown, IconChevronUp,
  IconRefresh, IconClock, IconUsers, IconCalendar,
} from '@tabler/icons-react'
import dayjs from 'dayjs'
import clsx from 'clsx'
import EmployeeAvatar from '@/components/employees/EmployeeAvatar'

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  present: { label: 'ตรงเวลา', cls: 'badge-green' },
  late:    { label: 'สาย',     cls: 'badge-amber' },
  absent:  { label: 'ขาด',     cls: 'badge-red' },
  leave:   { label: 'ลา',      cls: 'badge-purple' },
  holiday: { label: 'วันหยุด', cls: 'badge-gray' },
}

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]

type LocStatus = 'idle' | 'getting' | 'ok' | 'denied' | 'unsupported' | 'far'

export default function AttendancePage() {
  const { user } = useAuthStore()
  const role = user?.role
  const isOwner = role === 'owner'
  const canSeeDaily = role === 'hr' || role === 'owner'

  // Today / check-in state (non-owner)
  const [todayLog, setTodayLog] = useState<any>(null)
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [locStatus, setLocStatus] = useState<LocStatus>('idle')
  const [distance, setDistance] = useState<number | null>(null)
  const [maxRadius, setMaxRadius] = useState<number | null>(null)
  const [acting, setActing] = useState(false)

  // History (non-owner)
  const [historyMonth, setHistoryMonth] = useState(dayjs().month() + 1)
  const [historyYear, setHistoryYear] = useState(dayjs().year())
  const [history, setHistory] = useState<any[]>([])
  const [historySummary, setHistorySummary] = useState<any | null>(null)
  const [historyExpanded, setHistoryExpanded] = useState(false)

  // Daily summary (HR/owner)
  const [dailyDate, setDailyDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [daily, setDaily] = useState<any | null>(null)
  const [dailyExpanded, setDailyExpanded] = useState(true)
  const [dailyLoading, setDailyLoading] = useState(false)

  // Toast
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null)
  useEffect(() => {
    if (!toast || !toast.ok) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])
  const flash = (text: string, ok = true) => setToast({ text, ok })

  // Live clock for the header
  const [now, setNow] = useState(() => dayjs())
  useEffect(() => {
    const t = setInterval(() => setNow(dayjs()), 1000)
    return () => clearInterval(t)
  }, [])

  const loadToday = useCallback(async () => {
    if (isOwner) return
    try {
      const r = await attendanceApi.today()
      setTodayLog(r.data.data)
    } catch {}
  }, [isOwner])

  const loadHistory = useCallback(async () => {
    if (isOwner) return
    try {
      const r = await attendanceApi.myHistory(historyMonth, historyYear)
      setHistory(r.data.data?.records || [])
      setHistorySummary(r.data.data?.summary || null)
    } catch {}
  }, [isOwner, historyMonth, historyYear])

  const loadDaily = useCallback(async () => {
    if (!canSeeDaily) return
    setDailyLoading(true)
    try {
      const r = await attendanceApi.dailySummary(dailyDate)
      setDaily(r.data.data)
    } catch {
      setDaily(null)
    } finally { setDailyLoading(false) }
  }, [canSeeDaily, dailyDate])

  useEffect(() => { loadToday() }, [loadToday])
  useEffect(() => { loadHistory() }, [loadHistory])
  useEffect(() => { loadDaily() }, [loadDaily])

  // Auto-fetch GPS on mount for non-owner so they don't always have to
  // click the button. Falls back silently if denied/unsupported and the
  // user can click to retry.
  const triedAutoGps = useRef(false)
  useEffect(() => {
    if (isOwner || triedAutoGps.current) return
    triedAutoGps.current = true
    if (!('geolocation' in navigator)) {
      setLocStatus('unsupported')
      return
    }
    requestGps(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner])

  const requestGps = (silent = false) => {
    if (!('geolocation' in navigator)) { setLocStatus('unsupported'); return }
    setLocStatus('getting')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setLocStatus('ok')
      },
      () => {
        setLocStatus('denied')
        if (!silent) flash('ไม่สามารถระบุตำแหน่งได้ — กรุณาอนุญาต GPS ในการตั้งค่าเบราว์เซอร์', false)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const doCheckIn = async () => {
    setActing(true)
    try {
      const res = await attendanceApi.checkIn(coords?.lat, coords?.lng)
      flash(res.data.message)
      setDistance(res.data.data?.distance ?? null)
      loadToday(); loadDaily()
    } catch (e: any) {
      const data = e.response?.data
      flash(data?.message || 'เช็คอินไม่สำเร็จ', false)
      if (data?.data?.distance != null) setDistance(data.data.distance)
      if (data?.data?.maxRadius != null) setMaxRadius(data.data.maxRadius)
    } finally { setActing(false) }
  }

  const doCheckOut = async () => {
    setActing(true)
    try {
      const res = await attendanceApi.checkOut(coords?.lat, coords?.lng)
      flash(res.data.message)
      loadToday(); loadDaily()
    } catch (e: any) {
      flash(e.response?.data?.message || 'เช็คเอาท์ไม่สำเร็จ', false)
    } finally { setActing(false) }
  }

  const canCheckIn = !todayLog?.check_in_at
  const canCheckOut = todayLog?.check_in_at && !todayLog?.check_out_at

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-end justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#111110]">
            {isOwner ? 'ภาพรวมการลงเวลา' : 'ลงเวลาทำงาน'}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{now.format('dddd D MMMM YYYY')}</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold tabular-nums text-[#111110]">{now.format('HH:mm:ss')}</div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={clsx(
          'mb-4 px-3 py-2 rounded-[10px] text-sm flex items-center gap-2',
          toast.ok ? 'bg-[#E1F5EE] text-[#085041]' : 'bg-red-50 text-red-600'
        )}>
          {toast.ok ? <IconCheck size={14} /> : <IconAlertTriangle size={14} />}
          <span className="flex-1">{toast.text}</span>
          <button onClick={() => setToast(null)}>×</button>
        </div>
      )}

      {/* Daily summary — HR / Owner */}
      {canSeeDaily && (
        <DailySummaryCard
          date={dailyDate}
          onDateChange={setDailyDate}
          data={daily}
          loading={dailyLoading}
          expanded={dailyExpanded}
          onToggle={() => setDailyExpanded(e => !e)}
          onRefresh={loadDaily}
        />
      )}

      {/* Owner: no check-in/history — they only see daily summary above */}
      {isOwner ? null : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
            {/* Check-in card */}
            <div className="card">
              <h2 className="text-sm font-semibold text-[#111110] mb-4 flex items-center gap-2">
                <IconClockCheck size={14} className="text-gray-400" />
                เช็คอิน / เช็คเอาท์
              </h2>

              {todayLog ? (
                <div className="p-3 bg-[#E1F5EE]/60 rounded-[10px] mb-4 text-sm">
                  <div className="flex justify-between mb-1.5">
                    <span className="text-gray-600">เวลาเข้า</span>
                    <span className="font-medium tabular-nums">
                      {todayLog.check_in_at ? dayjs(todayLog.check_in_at).format('HH:mm น.') : '—'}
                    </span>
                  </div>
                  {todayLog.check_out_at && (
                    <div className="flex justify-between mb-1.5">
                      <span className="text-gray-600">เวลาออก</span>
                      <span className="font-medium tabular-nums">{dayjs(todayLog.check_out_at).format('HH:mm น.')}</span>
                    </div>
                  )}
                  {todayLog.work_hours && (
                    <div className="flex justify-between mb-1.5">
                      <span className="text-gray-600">ชั่วโมงทำงาน</span>
                      <span className="font-medium tabular-nums">
                        {Number(todayLog.work_hours).toFixed(1)} ชม.
                        {todayLog.ot_hours > 0 && <span className="text-[#534AB7] ml-1">(OT {Number(todayLog.ot_hours).toFixed(1)})</span>}
                      </span>
                    </div>
                  )}
                  {todayLog.status && (
                    <div className="flex justify-between mt-2 pt-2 border-t border-[#1D9E75]/20">
                      <span className="text-gray-600">สถานะ</span>
                      <div className="text-right">
                        <span className={clsx('badge', STATUS_MAP[todayLog.status]?.cls || 'badge-gray')}>
                          {STATUS_MAP[todayLog.status]?.label || todayLog.status}
                        </span>
                        {todayLog.status_detail && (
                          <div className="text-[11px] text-gray-500 mt-1">{todayLog.status_detail}</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-3 bg-gray-50 rounded-[10px] mb-4 text-xs text-gray-500 text-center">
                  ยังไม่ได้ลงเวลาวันนี้
                </div>
              )}

              {/* GPS */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-500">ตำแหน่ง GPS</span>
                  {distance !== null && (
                    <span className={clsx(
                      'text-xs font-medium tabular-nums',
                      maxRadius && distance > maxRadius ? 'text-red-600' : 'text-[#085041]'
                    )}>
                      ระยะ {distance} ม.
                      {maxRadius && <> (กำหนด ≤ {maxRadius})</>}
                      {(!maxRadius || distance <= maxRadius) && ' ✓'}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => requestGps(false)}
                  className={clsx(
                    'btn w-full justify-center text-sm',
                    locStatus === 'ok' && 'border-[#1D9E75]/40 text-[#085041]'
                  )}
                >
                  <IconMapPin size={15} />
                  {locStatus === 'idle' && 'เปิด GPS'}
                  {locStatus === 'getting' && 'กำลังระบุตำแหน่ง…'}
                  {locStatus === 'ok' && coords && `ตำแหน่งพร้อม (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`}
                  {locStatus === 'denied' && 'GPS ถูกปฏิเสธ — กดเพื่อขออีกครั้ง'}
                  {locStatus === 'unsupported' && 'อุปกรณ์นี้ไม่รองรับ GPS'}
                </button>
                {locStatus === 'denied' && (
                  <p className="text-[11px] text-red-500 mt-1.5">
                    ถ้ายังถูกบล็อก → กดไอคอน 🔒 ข้างที่อยู่เว็บ → อนุญาตตำแหน่ง → รีเฟรชหน้า
                  </p>
                )}
              </div>

              {/* Buttons */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={doCheckIn}
                  disabled={!canCheckIn || acting || locStatus !== 'ok'}
                  className="btn btn-primary justify-center py-3 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <IconClockCheck size={16} />
                  เช็คอิน
                </button>
                <button
                  onClick={doCheckOut}
                  disabled={!canCheckOut || acting || locStatus !== 'ok'}
                  className="btn justify-center py-3 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <IconClockOff size={16} />
                  เช็คเอาท์
                </button>
              </div>
            </div>

            {/* Monthly summary */}
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-[#111110] flex items-center gap-2">
                  <IconCalendar size={14} className="text-gray-400" />
                  สรุปเดือนนี้
                </h2>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                {[
                  { label: 'มาทำงาน', value: historySummary?.present ?? 0, color: '#1D9E75' },
                  { label: 'มาสาย',   value: historySummary?.late ?? 0,    color: '#BA7517' },
                  { label: 'ขาดงาน',  value: historySummary?.absent ?? 0,  color: '#E24B4A' },
                  { label: 'ลางาน',   value: history.filter((r:any) => r.status === 'leave').length, color: '#534AB7' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-gray-50 rounded-[10px] p-3 text-center">
                    <div className="text-2xl font-semibold tabular-nums" style={{ color }}>{value}</div>
                    <div className="text-xs text-gray-500 mt-1">{label}</div>
                  </div>
                ))}
              </div>
              {historySummary && (
                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-black/[0.05] text-xs">
                  <div className="text-center">
                    <div className="text-gray-500">ชั่วโมงทำงานรวม</div>
                    <div className="font-medium tabular-nums text-[#111110] mt-0.5">
                      {historySummary.totalWorkHours ?? '0.0'} ชม.
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-gray-500">OT รวม</div>
                    <div className="font-medium tabular-nums text-[#534AB7] mt-0.5">
                      {historySummary.totalOtHours ?? '0.0'} ชม.
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* History */}
          <div className="card">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h2 className="text-sm font-semibold text-[#111110] flex items-center gap-2">
                <IconClock size={14} className="text-gray-400" />
                ประวัติลงเวลา
              </h2>
              <div className="flex items-center gap-2">
                <select
                  className="input py-1.5 text-xs w-auto"
                  value={historyMonth}
                  onChange={e => setHistoryMonth(parseInt(e.target.value, 10))}
                >
                  {THAI_MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
                <select
                  className="input py-1.5 text-xs w-auto"
                  value={historyYear}
                  onChange={e => setHistoryYear(parseInt(e.target.value, 10))}
                >
                  {Array.from({ length: 4 }).map((_, i) => {
                    const y = dayjs().year() - i
                    return <option key={y} value={y}>{y + 543}</option>
                  })}
                </select>
              </div>
            </div>

            {history.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">ไม่มีประวัติในเดือนนี้</div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-black/[0.06]">
                        {['วันที่','เวลาเข้า','เวลาออก','ชั่วโมง','สถานะ','รายละเอียด'].map(h => (
                          <th key={h} className="text-left py-2 px-3 text-xs text-gray-500 font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(historyExpanded ? history : history.slice(0, 15)).map((r: any) => (
                        <tr key={r.id} className="border-b border-black/[0.04] hover:bg-gray-50/60">
                          <td className="py-2.5 px-3 text-xs text-gray-700">{dayjs(r.date).format('D MMM')}</td>
                          <td className="py-2.5 px-3 text-xs tabular-nums">{r.check_in_at ? dayjs(r.check_in_at).format('HH:mm') : '—'}</td>
                          <td className="py-2.5 px-3 text-xs tabular-nums">{r.check_out_at ? dayjs(r.check_out_at).format('HH:mm') : '—'}</td>
                          <td className="py-2.5 px-3 text-xs tabular-nums">
                            {r.work_hours ? `${Number(r.work_hours).toFixed(1)}` : '—'}
                            {r.ot_hours > 0 && <span className="text-[#534AB7] ml-1">+{Number(r.ot_hours).toFixed(1)} OT</span>}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className={clsx('badge', STATUS_MAP[r.status]?.cls || 'badge-gray')}>
                              {STATUS_MAP[r.status]?.label || r.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-[11px] text-gray-500 max-w-[200px] truncate" title={r.status_detail || ''}>
                            {r.status_detail || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {history.length > 15 && (
                  <button
                    onClick={() => setHistoryExpanded(e => !e)}
                    className="btn text-xs mt-3 w-full justify-center"
                  >
                    {historyExpanded
                      ? <>ย่อ ({history.length} รายการ) <IconChevronUp size={13} /></>
                      : <>แสดงทั้งหมด ({history.length} รายการ) <IconChevronDown size={13} /></>
                    }
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/* ===== Daily summary card (HR / Owner) ===== */
function DailySummaryCard({
  date, onDateChange, data, loading, expanded, onToggle, onRefresh,
}: {
  date: string
  onDateChange: (d: string) => void
  data: any | null
  loading: boolean
  expanded: boolean
  onToggle: () => void
  onRefresh: () => void
}) {
  const summary = data?.summary
  const records = data?.records || []

  const groups = useMemo(() => {
    const g: Record<string, any[]> = { present: [], late: [], absent: [], leave: [], other: [] }
    for (const r of records) {
      const k = (r.status && g[r.status]) ? r.status : 'other'
      g[k].push(r)
    }
    return g
  }, [records])

  return (
    <div className="card mb-5"
      style={{ background: 'linear-gradient(135deg, #FFFFFF 0%, #F0F8F4 100%)' }}>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-sm font-semibold text-[#111110] flex items-center gap-2">
          <IconUsers size={14} className="text-[#1D9E75]" />
          วันนี้ในออฟฟิศ
        </h2>
        <div className="flex items-center gap-2">
          <input
            type="date"
            className="input py-1.5 text-xs w-auto"
            value={date}
            onChange={e => onDateChange(e.target.value)}
            max={dayjs().format('YYYY-MM-DD')}
          />
          <button onClick={onRefresh} className="btn btn-ghost p-1.5" title="รีเฟรช" disabled={loading}>
            <IconRefresh size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <Stat label="ทั้งหมด" value={summary?.total ?? 0} color="#6B6A66" />
        <Stat label="เข้าตรงเวลา" value={summary?.present ?? 0} color="#1D9E75" />
        <Stat label="มาสาย" value={summary?.late ?? 0} color="#BA7517" />
        <Stat label="ยังไม่เข้า" value={summary?.notCheckedIn ?? 0} color="#E24B4A" />
        <Stat label="ลา" value={summary?.leave ?? 0} color="#534AB7" />
      </div>

      {summary && summary.total > 0 && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[11px] text-gray-500 mb-1">
            <span>อัตราการเข้างาน</span>
            <span className="font-medium text-[#085041] tabular-nums">{summary.attendanceRate ?? 0}%</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-[#1D9E75] rounded-full transition-all"
              style={{ width: `${Math.min(100, summary.attendanceRate || 0)}%` }} />
          </div>
        </div>
      )}

      {/* Expandable employee list */}
      {records.length > 0 && (
        <>
          <button
            onClick={onToggle}
            className="w-full mt-3 pt-3 border-t border-black/[0.06] flex items-center justify-center gap-1 text-xs text-gray-600 hover:text-[#111110]"
          >
            {expanded ? <>ย่อ <IconChevronUp size={12} /></> : <>ดูรายชื่อ ({records.length} คน) <IconChevronDown size={12} /></>}
          </button>
          {expanded && (
            <div className="mt-3 space-y-3">
              {(['present','late','absent','leave','other'] as const).map(key => {
                const list = groups[key]
                if (list.length === 0) return null
                const meta = STATUS_MAP[key] || { label: 'อื่นๆ', cls: 'badge-gray' }
                return (
                  <div key={key}>
                    <div className="text-[11px] font-medium text-gray-500 mb-1.5 flex items-center gap-1.5">
                      <span className={clsx('badge', meta.cls)}>{meta.label}</span>
                      <span>{list.length} คน</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {list.map((r: any) => (
                        <div key={r.id} className="flex items-center gap-2 px-2 py-1.5 rounded-[8px] bg-white/60 border border-black/[0.04]">
                          <EmployeeAvatar person={r} size={26} />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-[#111110] truncate">
                              {r.first_name} {r.last_name}
                            </div>
                            <div className="text-[10px] text-gray-500 tabular-nums">
                              {r.check_in_at ? dayjs(r.check_in_at).format('HH:mm') : '—'}
                              {r.check_out_at && <> – {dayjs(r.check_out_at).format('HH:mm')}</>}
                              {r.status_detail && <span className="ml-1 text-gray-400">· {r.status_detail}</span>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {summary && summary.notCheckedIn > 0 && records.length === 0 && (
        <p className="text-xs text-gray-400 mt-3 text-center">ยังไม่มีใครเช็คอินวันนี้</p>
      )}
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center bg-white rounded-[10px] p-2 border border-black/[0.04]">
      <div className="text-xl font-semibold tabular-nums" style={{ color }}>{value}</div>
      <div className="text-[11px] text-gray-500 mt-0.5">{label}</div>
    </div>
  )
}
