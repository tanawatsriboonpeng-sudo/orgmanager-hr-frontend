'use client'
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { attendanceApi } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import {
  IconMapPin, IconClockCheck, IconClockOff, IconAlertTriangle,
  IconCheck, IconX, IconChevronDown, IconChevronUp,
  IconRefresh, IconClock, IconUsers, IconCalendar,
  IconExternalLink,
} from '@tabler/icons-react'
import dayjs from 'dayjs'
import clsx from 'clsx'
import EmployeeAvatar from '@/components/employees/EmployeeAvatar'
// Modal components extracted to keep this page from drifting back past
// 1.7K lines. Each one is a self-contained leaf — props in, callbacks
// out, no shared state with the parent.
import SelfieModal from '@/components/attendance/SelfieModal'
import BackdateRequestModal from '@/components/attendance/BackdateRequestModal'
import AdminRecordModal from '@/components/attendance/AdminRecordModal'

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

// "HH:MM[:SS]" → minutes since midnight, tolerant of PG TIME serialization.
function timeToMin(t?: string | null): number {
  if (!t) return 0
  const [hh, mm] = String(t).split(':')
  return (parseInt(hh, 10) || 0) * 60 + (parseInt(mm, 10) || 0)
}

// Live hint shown above the check-in buttons. Three branches:
//   - not yet checked in : show which bucket they'd fall into and how
//     long until the next one (the original behavior).
//   - checked-in, not yet checked-out, past work_end : nudge them
//     to tap เช็คเอาท์ (Layer 5 of the forgot-checkout prevention).
//   - everything else : null (no hint).
function shiftHint(
  now: any,
  shift: any | null,
  todayLog: { check_in_at?: any; check_out_at?: any } | null,
): { text: string; color: string } | null {
  if (!shift || shift.isDayOff) return null
  const checkedIn  = !!todayLog?.check_in_at
  const checkedOut = !!todayLog?.check_out_at
  const nowMin = now.hour() * 60 + now.minute() + now.second() / 60

  // === Post-checkin, awaiting checkout ===
  if (checkedIn && !checkedOut) {
    // Flexible shift: pick the latest checkout time across the tiers
    // (most lenient bound). If we're past it, nudge.
    if (shift.shift_type === 'flexible' && Array.isArray(shift.flex_tiers) && shift.flex_tiers.length) {
      const latestOut = shift.flex_tiers.reduce(
        (acc: number, t: any) => Math.max(acc, timeToMin(t.checkout)),
        0,
      )
      if (latestOut && nowMin > latestOut) {
        const over = Math.floor(nowMin - latestOut)
        return { text: `เลยเวลาเลิกงานแล้ว ${over} นาที — อย่าลืมเช็คเอาท์`, color: '#BA7517' }
      }
      return null
    }
    const workEnd = timeToMin(shift.work_end)
    if (workEnd && nowMin > workEnd) {
      const over = Math.floor(nowMin - workEnd)
      return { text: `เลยเวลาเลิกงานแล้ว ${over} นาที — อย่าลืมเช็คเอาท์`, color: '#BA7517' }
    }
    return null
  }

  // === Already checked-out ===
  if (checkedOut) return null

  // === Not yet checked in (original pre-checkin behavior) ===

  if (shift.shift_type === 'flexible' && Array.isArray(shift.flex_tiers) && shift.flex_tiers.length) {
    const sorted = [...shift.flex_tiers].sort((a: any, b: any) => timeToMin(a.checkin_until) - timeToMin(b.checkin_until))
    for (const tier of sorted) {
      if (nowMin <= timeToMin(tier.checkin_until)) {
        return { text: `ถ้าเช็คอินตอนนี้ → ออกงาน ${tier.checkout}`, color: '#1D9E75' }
      }
    }
    return { text: 'เกินเวลาเช็คอินสุดท้ายแล้ว — จะนับเป็นสาย/ขาด', color: '#E24B4A' }
  }

  const workStart = timeToMin(shift.work_start)
  const lateWarn  = shift.late_warning_minutes ?? 1
  const lateTh    = shift.late_threshold_minutes ?? 10
  const absentTh  = shift.absent_threshold_minutes ?? 20
  const diff = nowMin - workStart

  if (diff < lateWarn) {
    return { text: `ตรงเวลา · เหลือ ${Math.ceil(lateWarn - diff)} นาทีก่อนเกือบสาย`, color: '#1D9E75' }
  }
  if (diff < lateTh) {
    return { text: `เกือบสาย · เหลือ ${Math.ceil(lateTh - diff)} นาทีก่อน "สาย"`, color: '#BA7517' }
  }
  if (diff < absentTh) {
    return { text: `สาย · เหลือ ${Math.ceil(absentTh - diff)} นาทีก่อน "ขาดงาน"`, color: '#E24B4A' }
  }
  return { text: 'ขาดงาน — เกินเวลาเช็คอินที่กำหนด', color: '#E24B4A' }
}

export default function AttendancePage() {
  const { user } = useAuthStore()
  const role = user?.role
  const isOwner = role === 'owner'
  const canSeeDaily = role === 'hr' || role === 'owner'

  // Today / check-in state (non-owner)
  const [todayLog, setTodayLog] = useState<any>(null)
  // Shift config for today (work_start, late thresholds, flex_tiers).
  // Provided by /attendance/today so we can show expected hours + live
  // status hint without a second round-trip to /shift-configs.
  const [shiftInfo, setShiftInfo] = useState<any | null>(null)
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
  // Off-site check-ins awaiting HR/owner approval. Loaded alongside the
  // daily summary so refresh button covers both.
  const [offsitePending, setOffsitePending] = useState<any[]>([])
  // Backdated check-in/out requests awaiting HR/owner approval.
  const [backdatePending, setBackdatePending] = useState<any[]>([])
  // Employee's own backdate request history (shown to non-HR users).
  const [myBackdates, setMyBackdates] = useState<any[]>([])
  // Backdate request modal toggle. When opened from the rejected-offsite
  // CTA on today's log card, backdateInitialDate carries the date so the
  // form starts with the right day pre-filled.
  const [showBackdate, setShowBackdate] = useState(false)
  const [backdateInitialDate, setBackdateInitialDate] = useState<string | undefined>(undefined)
  // HR/owner "ลงเวลาให้พนักงาน" modal toggle.
  const [showAdminRecord, setShowAdminRecord] = useState(false)

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
      setShiftInfo(r.data.shift || null)
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
      const [sumR, offsiteR, backdateR] = await Promise.allSettled([
        attendanceApi.dailySummary(dailyDate),
        attendanceApi.offsitePending(),
        attendanceApi.backdatePending(),
      ])
      setDaily(sumR.status === 'fulfilled' ? sumR.value.data.data : null)
      setOffsitePending(offsiteR.status === 'fulfilled' ? (offsiteR.value.data.data || []) : [])
      setBackdatePending(backdateR.status === 'fulfilled' ? (backdateR.value.data.data || []) : [])
    } finally { setDailyLoading(false) }
  }, [canSeeDaily, dailyDate])

  const loadMyBackdates = useCallback(async () => {
    if (isOwner || canSeeDaily) return  // owner has no employee record; HR sees the pending queue separately
    try {
      const r = await attendanceApi.myBackdates()
      setMyBackdates(r.data.data || [])
    } catch {}
  }, [isOwner, canSeeDaily])

  const handleApproveBackdate = async (id: string) => {
    try {
      await attendanceApi.approveBackdate(id)
      flash('อนุมัติคำขอลงเวลาย้อนหลังแล้ว')
      loadDaily()
    } catch (e: any) {
      flash(e.response?.data?.message || 'อนุมัติไม่สำเร็จ', false)
    }
  }
  const handleRejectBackdate = async (id: string, reason: string) => {
    try {
      await attendanceApi.rejectBackdate(id, reason)
      flash('ปฏิเสธคำขอแล้ว')
      loadDaily()
    } catch (e: any) {
      flash(e.response?.data?.message || 'ปฏิเสธไม่สำเร็จ', false)
    }
  }

  const handleApproveOffsite = async (id: string) => {
    try {
      await attendanceApi.approveOffsite(id)
      flash('อนุมัติการลงเวลานอกสถานที่แล้ว')
      loadDaily()
    } catch (e: any) {
      flash(e.response?.data?.message || 'อนุมัติไม่สำเร็จ', false)
    }
  }
  const handleRejectOffsite = async (id: string, reason: string) => {
    try {
      await attendanceApi.rejectOffsite(id, reason)
      flash('ปฏิเสธคำขอแล้ว')
      loadDaily()
    } catch (e: any) {
      flash(e.response?.data?.message || 'ปฏิเสธไม่สำเร็จ', false)
    }
  }

  useEffect(() => { loadToday() }, [loadToday])
  useEffect(() => { loadHistory() }, [loadHistory])
  useEffect(() => { loadDaily() }, [loadDaily])
  useEffect(() => { loadMyBackdates() }, [loadMyBackdates])

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

  // Selfie capture flow: opens a modal with a live webcam preview, lets
  // the user snap a frame, then submits the check-in/out with the JPEG
  // dataURL attached. selfieMode tells the modal whether the user is
  // checking IN or OUT — flips its labels + which submit path runs.
  const [selfieMode, setSelfieMode] = useState<'checkin' | 'checkout' | null>(null)

  const doCheckIn = async (selfie?: string) => {
    setActing(true)
    try {
      const res = await attendanceApi.checkIn(coords?.lat, coords?.lng, 'gps', selfie)
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

  // Off-site path: same selfie + GPS coords, but the row goes into the
  // backend as offsite_status='pending' and HR/owner has to approve. Used
  // when an employee is legitimately working away from the office
  // (client site, training, field work).
  const doCheckInOffsite = async (selfie: string, reason: string) => {
    setActing(true)
    try {
      const res = await attendanceApi.checkInOffsite({
        lat: coords?.lat, lng: coords?.lng, selfie, reason,
      })
      flash(res.data.message)
      loadToday(); loadDaily()
    } catch (e: any) {
      flash(e.response?.data?.message || 'ส่งคำขอไม่สำเร็จ', false)
    } finally { setActing(false) }
  }

  const doCheckOut = async (selfie?: string) => {
    setActing(true)
    try {
      const res = await attendanceApi.checkOut(coords?.lat, coords?.lng, 'gps', selfie)
      flash(res.data.message)
      loadToday(); loadDaily()
    } catch (e: any) {
      flash(e.response?.data?.message || 'เช็คเอาท์ไม่สำเร็จ', false)
    } finally { setActing(false) }
  }

  // Off-site checkout — when the employee is leaving from outside
  // the radius (client site, field work). Same pending-approval flow
  // as offsite check-in.
  const doCheckOutOffsite = async (selfie: string, reason: string) => {
    setActing(true)
    try {
      const res = await attendanceApi.checkOutOffsite({
        lat: coords?.lat, lng: coords?.lng, selfie, reason,
      })
      flash(res.data.message)
      loadToday(); loadDaily()
    } catch (e: any) {
      flash(e.response?.data?.message || 'ส่งคำขอไม่สำเร็จ', false)
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
          <p className="text-sm text-gray-500 mt-0.5">{now.format('dddd D MMMM BBBB')}</p>
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

      {/* Past-missing-checkout banner (Layer 3). Surfaces every past
          day where the user checked in but never tapped เช็คเอาท์ — so
          they can file a backdate request with the actual out time
          instead of letting the row sit with work_hours=0 forever. */}
      {(() => {
        const today = dayjs().format('YYYY-MM-DD')
        const missing = history.filter(r =>
          r.check_in_at && !r.check_out_at && r.date && r.date < today
        )
        if (missing.length === 0) return null
        const first = missing[0]
        return (
          <div className="mb-4 p-3 rounded-[10px] border border-amber-200 bg-amber-50/70 flex items-start gap-3">
            <IconAlertTriangle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium text-amber-900">
                คุณยังไม่ได้เช็คเอาท์ {missing.length === 1
                  ? `วันที่ ${dayjs(first.date).format('D MMM')}`
                  : `${missing.length} วันที่ผ่านมา`
                }
              </div>
              <div className="text-[11px] text-amber-800 mt-0.5">
                กรุณายื่นคำขอลงเวลาย้อนหลังเพื่อแจ้งเวลาออกจริง — ไม่อย่างนั้นจะนับชั่วโมงทำงานวันนั้นเป็น 0
              </div>
            </div>
            <button
              onClick={() => { setBackdateInitialDate(first.date); setShowBackdate(true) }}
              className="btn btn-primary text-xs py-1.5 px-2.5 flex-shrink-0"
            >
              ยื่นย้อนหลัง
            </button>
          </div>
        )
      })()}

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
          offsitePending={offsitePending}
          onApproveOffsite={handleApproveOffsite}
          onRejectOffsite={handleRejectOffsite}
          backdatePending={backdatePending}
          onApproveBackdate={handleApproveBackdate}
          onRejectBackdate={handleRejectBackdate}
          onOpenAdminRecord={() => setShowAdminRecord(true)}
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

              {/* Shift-aware status: shows the expected work start time,
                  the shift name/code if HR assigned one, and a live
                  countdown to the next bucket. Re-rendered every second
                  because `now` ticks at 1Hz. */}
              {shiftInfo && !shiftInfo.isDayOff && (
                <div className="mb-3 p-3 rounded-[10px] border border-black/[0.05] bg-gray-50/60">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-gray-600">
                      เข้างาน <span className="font-medium tabular-nums text-[#111110]">{(shiftInfo.work_start || '').slice(0, 5)}</span>
                      {shiftInfo.work_end && (
                        <> – <span className="tabular-nums">{shiftInfo.work_end.slice(0, 5)}</span></>
                      )}
                    </span>
                    {shiftInfo.code && (
                      <span className="text-[11px] text-gray-500">
                        กะ <span className="font-medium text-[#111110]">{shiftInfo.code}</span>
                        {shiftInfo.name && <span className="text-gray-400"> · {shiftInfo.name}</span>}
                      </span>
                    )}
                  </div>
                  {(() => {
                    const hint = shiftHint(now, shiftInfo, todayLog)
                    return hint ? (
                      <div className="mt-1.5 text-[11px] font-medium" style={{ color: hint.color }}>
                        {hint.text}
                      </div>
                    ) : null
                  })()}
                </div>
              )}
              {shiftInfo?.isDayOff && (
                <div className="mb-3 p-3 rounded-[10px] border border-amber-200 bg-amber-50/60 text-[12px] text-amber-800">
                  วันนี้เป็น <span className="font-medium">วันหยุด</span>ของคุณ — ไม่ต้องลงเวลา
                </div>
              )}

              {todayLog ? (
                <div className="p-3 bg-[#E1F5EE]/60 rounded-[10px] mb-4 text-sm">
                  <div className="flex items-start gap-3 mb-2">
                    {todayLog.check_in_selfie && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={todayLog.check_in_selfie}
                        alt="selfie"
                        className="w-14 h-14 rounded-[8px] object-cover border border-black/[0.05] flex-shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-gray-600">เวลาเข้า</span>
                    <span className="font-medium tabular-nums">
                      {todayLog.check_in_at ? dayjs(todayLog.check_in_at).format('HH:mm น.') : '—'}
                    </span>
                  </div>
                  {todayLog.check_out_at && (
                    <div className="flex justify-between mb-1.5">
                      <span className="text-gray-600">เวลาออก</span>
                      <span className="font-medium tabular-nums flex items-center gap-1.5 justify-end">
                        {dayjs(todayLog.check_out_at).format('HH:mm น.')}
                        {todayLog.check_out_status && (
                          <span className={clsx(
                            'px-1.5 py-0.5 rounded-full border text-[10px] font-medium',
                            todayLog.check_out_status === 'early'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : todayLog.check_out_status === 'overtime'
                                ? 'bg-purple-50 text-purple-700 border-purple-200'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          )}>
                            {todayLog.check_out_status === 'early' ? 'ออกก่อนเวลา'
                              : todayLog.check_out_status === 'overtime' ? 'อยู่หลังเลิกงาน'
                              : 'ออกตรงเวลา'}
                          </span>
                        )}
                      </span>
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
                  {todayLog.missing_checkout && (
                    <div className="mt-2 pt-2 border-t border-amber-200 bg-amber-50/40 -mx-3 px-3 pb-2 rounded-b-[10px]">
                      <div className="flex justify-between items-start">
                        <div className="text-xs">
                          <div className="font-medium text-amber-800">ลืมลงเวลาออก</div>
                          <div className="text-[11px] text-amber-700 mt-0.5">
                            ระบบหักเวลาทำงานเหลือครึ่งวัน · ถ้าออกจริง ยื่นคำขอย้อนหลังได้
                          </div>
                        </div>
                        <span className="badge badge-amber text-[10px] flex-shrink-0">ครึ่งวัน</span>
                      </div>
                    </div>
                  )}
                  {todayLog.is_offsite && (
                    <div className="mt-2 pt-2 border-t border-[#1D9E75]/20">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600 text-xs">ลงเวลานอกสถานที่</span>
                        <span className={clsx('badge text-[10px]',
                          todayLog.offsite_status === 'approved' ? 'badge-green'
                          : todayLog.offsite_status === 'rejected' ? 'badge-red'
                          : 'badge-amber'
                        )}>
                          {todayLog.offsite_status === 'approved' ? 'อนุมัติแล้ว'
                            : todayLog.offsite_status === 'rejected' ? 'ปฏิเสธ'
                            : 'รออนุมัติ'}
                        </span>
                      </div>
                      {todayLog.offsite_reason && (
                        <div className="text-[11px] text-gray-500 mt-1">เหตุผล: {todayLog.offsite_reason}</div>
                      )}
                      {todayLog.offsite_status === 'rejected' && todayLog.offsite_reject_reason && (
                        <div className="text-[11px] text-red-500 mt-1">หมายเหตุ: {todayLog.offsite_reject_reason}</div>
                      )}
                      {/* Rejection isn't necessarily a dead-end — the
                          employee can submit a backdate request for the
                          same day with stronger evidence (receipt,
                          calendar shot, etc.) for HR to review fresh. */}
                      {todayLog.offsite_status === 'rejected' && (
                        <button
                          onClick={() => {
                            setBackdateInitialDate(dayjs(todayLog.date).format('YYYY-MM-DD'))
                            setShowBackdate(true)
                          }}
                          className="mt-2 text-[11px] text-[#1D9E75] hover:underline inline-flex items-center gap-0.5"
                        >
                          ยื่นคำขอย้อนหลังพร้อมหลักฐาน →
                        </button>
                      )}
                    </div>
                  )}
                    </div>
                  </div>
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

              {/* Buttons. เช็คอิน opens the selfie modal first; the modal
                  calls doCheckIn(dataUrl) once the user confirms the photo.
                  Disabled until GPS resolves so we don't open a camera
                  modal just to discover the user is out of radius. */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setSelfieMode('checkin')}
                  disabled={!canCheckIn || acting || locStatus !== 'ok'}
                  className="btn btn-primary justify-center py-3 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <IconClockCheck size={16} />
                  เช็คอิน
                </button>
                <button
                  onClick={() => setSelfieMode('checkout')}
                  disabled={!canCheckOut || acting || locStatus !== 'ok'}
                  className="btn justify-center py-3 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <IconClockOff size={16} />
                  เช็คเอาท์
                </button>
              </div>
              {/* Secondary action — small link-style so it doesn't
                  compete with the primary check-in/out buttons but is
                  still discoverable when the employee realises they
                  missed a tap on a past day. */}
              <button
                onClick={() => setShowBackdate(true)}
                className="w-full mt-3 text-[11px] text-[#1D9E75] hover:underline text-center"
              >
                ลืมลงเวลา? ขอลงเวลาย้อนหลัง →
              </button>
            </div>

            {/* Monthly summary */}
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-[#111110] flex items-center gap-2">
                  <IconCalendar size={14} className="text-gray-400" />
                  สรุปเดือนนี้
                </h2>
              </div>
              {/* 5 buckets. `present` from the backend includes almost_late
                  rows (so the legacy attendanceRate stays meaningful), so
                  the "ตรงเวลา" cell subtracts almostLate to avoid
                  double-counting next to its own bucket. */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-3">
                {[
                  { label: 'ตรงเวลา',  value: Math.max(0, (historySummary?.present ?? 0) - (historySummary?.almostLate ?? 0)), color: '#1D9E75' },
                  { label: 'เกือบสาย', value: historySummary?.almostLate ?? 0, color: '#D9914A' },
                  { label: 'มาสาย',    value: historySummary?.late ?? 0,       color: '#BA7517' },
                  { label: 'ขาดงาน',   value: historySummary?.absent ?? 0,     color: '#E24B4A' },
                  { label: 'ลางาน',    value: history.filter((r:any) => r.status === 'leave').length, color: '#534AB7' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-gray-50 rounded-[10px] p-3 text-center">
                    <div className="text-2xl font-semibold tabular-nums" style={{ color }}>{value}</div>
                    <div className="text-[11px] text-gray-500 mt-1 whitespace-nowrap">{label}</div>
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

      {selfieMode && (
        <SelfieModal
          mode={selfieMode}
          onClose={() => setSelfieMode(null)}
          onSubmit={async ({ dataUrl, offsite, reason }) => {
            const m = selfieMode
            setSelfieMode(null)
            if (m === 'checkout') {
              if (offsite) await doCheckOutOffsite(dataUrl, reason || '')
              else         await doCheckOut(dataUrl)
            } else {
              if (offsite) await doCheckInOffsite(dataUrl, reason || '')
              else         await doCheckIn(dataUrl)
            }
          }}
          busy={acting}
        />
      )}

      {showBackdate && (
        <BackdateRequestModal
          initialDate={backdateInitialDate}
          onClose={() => { setShowBackdate(false); setBackdateInitialDate(undefined) }}
          onSubmitted={() => {
            setShowBackdate(false)
            setBackdateInitialDate(undefined)
            flash('ส่งคำขอลงเวลาย้อนหลังแล้ว')
            loadMyBackdates()
          }}
          onError={(m) => flash(m, false)}
        />
      )}

      {showAdminRecord && (
        <AdminRecordModal
          onClose={() => setShowAdminRecord(false)}
          onSubmitted={(msg) => {
            setShowAdminRecord(false)
            flash(msg)
            loadDaily()
          }}
          onError={(m) => flash(m, false)}
        />
      )}
    </div>
  )
}

/* ===== Daily summary card (HR / Owner) ===== */
function DailySummaryCard({
  date, onDateChange, data, loading, expanded, onToggle, onRefresh,
  offsitePending, onApproveOffsite, onRejectOffsite,
  backdatePending, onApproveBackdate, onRejectBackdate,
  onOpenAdminRecord,
}: {
  date: string
  onDateChange: (d: string) => void
  data: any | null
  loading: boolean
  expanded: boolean
  onToggle: () => void
  onRefresh: () => void
  offsitePending: any[]
  onApproveOffsite: (id: string) => void
  onRejectOffsite: (id: string, reason: string) => void
  backdatePending: any[]
  onApproveBackdate: (id: string) => void
  onRejectBackdate: (id: string, reason: string) => void
  onOpenAdminRecord: () => void
}) {
  const summary = data?.summary
  const records = data?.records || []
  const rejectedRecords = data?.rejectedRecords || []
  // Inline reject flow: which row is being rejected, and the reason text.
  // Tagged with the queue (offsite|backdate) since they share UI but
  // different reject endpoints.
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectingKind, setRejectingKind] = useState<'offsite' | 'backdate' | null>(null)
  const [rejectReason, setRejectReason] = useState('')

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
          <button
            onClick={onOpenAdminRecord}
            className="btn text-xs py-1.5"
            title="ลงเวลาให้พนักงานคนใดก็ได้"
          >
            <IconClock size={13} /> ลงเวลาให้พนักงาน
          </button>
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

      {/* Stats grid. "เข้าตรงเวลา" subtracts almostLate because backend
          `present` includes the warning bucket — keeps the legacy
          attendanceRate meaningful while letting us show เกือบสาย as
          its own number for HR. */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        <Stat label="ทั้งหมด"   value={summary?.total ?? 0} color="#6B6A66" />
        <Stat label="ตรงเวลา"   value={Math.max(0, (summary?.present ?? 0) - (summary?.almostLate ?? 0))} color="#1D9E75" />
        <Stat label="เกือบสาย"  value={summary?.almostLate ?? 0} color="#D9914A" />
        <Stat label="มาสาย"     value={summary?.late ?? 0} color="#BA7517" />
        <Stat label="ยังไม่เข้า" value={summary?.notCheckedIn ?? 0} color="#E24B4A" />
        <Stat label="ลา"        value={summary?.leave ?? 0} color="#534AB7" />
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

      {/* Off-site approval queue. Only renders when there's something to
          act on so the card stays compact on a normal day. */}
      {offsitePending.length > 0 && (
        <div className="mt-4 pt-3 border-t border-black/[0.05]">
          <h3 className="text-xs font-semibold text-[#111110] mb-2 flex items-center gap-2">
            <IconMapPin size={12} className="text-[#BA7517]" />
            ลงเวลานอกสถานที่รออนุมัติ
            <span className="text-[10px] font-normal text-gray-400">({offsitePending.length})</span>
          </h3>
          <div className="space-y-2">
            {offsitePending.map((r: any) => (
              <div key={r.id} className="rounded-[10px] border border-amber-200 bg-amber-50/30 p-2.5">
                <div className="flex items-start gap-2.5">
                  {r.check_in_selfie && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.check_in_selfie} alt="selfie"
                      className="w-12 h-12 rounded-[8px] object-cover border border-black/[0.05] flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[13px] font-medium text-[#111110]">{r.first_name} {r.last_name}</span>
                      {r.nickname && <span className="text-[11px] text-gray-400">({r.nickname})</span>}
                      <span className="text-[11px] tabular-nums text-gray-500">
                        · {dayjs(r.check_in_at).format('HH:mm')}
                      </span>
                      {r.check_in_distance_m != null && (
                        <span className="text-[11px] text-gray-400">
                          · ห่าง {(r.check_in_distance_m / 1000).toFixed(1)} กม.
                        </span>
                      )}
                    </div>
                    {/* GPS location pin so HR can verify where the
                        employee actually was. Coordinates as text +
                        Google Maps deep link (opens new tab). */}
                    {r.check_in_lat != null && r.check_in_lng != null && (
                      <div className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <IconMapPin size={11} className="text-gray-400" />
                        <span className="tabular-nums">
                          {Number(r.check_in_lat).toFixed(5)}, {Number(r.check_in_lng).toFixed(5)}
                        </span>
                        <a
                          href={`https://www.google.com/maps?q=${r.check_in_lat},${r.check_in_lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#1D9E75] hover:underline inline-flex items-center gap-0.5"
                        >
                          ดูบนแผนที่ <IconExternalLink size={10} />
                        </a>
                      </div>
                    )}
                    <div className="text-[12px] text-gray-700 mt-1 break-words">{r.offsite_reason}</div>
                  </div>
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    <button
                      onClick={() => onApproveOffsite(r.id)}
                      className="btn btn-primary text-[11px] px-2 py-1"
                      title="อนุมัติ"
                    >
                      <IconCheck size={12} /> อนุมัติ
                    </button>
                    <button
                      onClick={() => { setRejectingId(r.id); setRejectingKind('offsite'); setRejectReason('') }}
                      className="btn text-[11px] px-2 py-1 text-red-600 border-red-200 hover:bg-red-50"
                      title="ปฏิเสธ"
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
                      <button
                        onClick={() => { onRejectOffsite(r.id, rejectReason); setRejectingId(null); setRejectingKind(null) }}
                        className="btn text-[11px] text-red-600 border-red-200 hover:bg-red-50"
                      >
                        ยืนยันปฏิเสธ
                      </button>
                      <button
                        onClick={() => { setRejectingId(null); setRejectingKind(null); setRejectReason('') }}
                        className="btn text-[11px]"
                      >
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

      {/* Backdated check-in/check-out approval queue. Same layout family
          as the off-site queue (amber-tinted, inline approve/reject).
          Hidden when empty so the card stays compact. */}
      {backdatePending.length > 0 && (
        <div className="mt-4 pt-3 border-t border-black/[0.05]">
          <h3 className="text-xs font-semibold text-[#111110] mb-2 flex items-center gap-2">
            <IconClock size={12} className="text-[#534AB7]" />
            ลงเวลาย้อนหลังรออนุมัติ
            <span className="text-[10px] font-normal text-gray-400">({backdatePending.length})</span>
          </h3>
          <div className="space-y-2">
            {backdatePending.map((r: any) => {
              const typeTxt = r.request_type === 'both'     ? 'เข้า+ออกงาน'
                            : r.request_type === 'check_in' ? 'เข้างาน'
                            :                                  'ออกงาน'
              return (
                <div key={r.id} className="rounded-[10px] border border-violet-200 bg-violet-50/30 p-2.5">
                  <div className="flex items-start gap-2.5">
                    {r.attachment ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <a
                        href={r.attachment}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="คลิกเพื่อดูภาพเต็ม"
                        className="flex-shrink-0"
                      >
                        <img
                          src={r.attachment}
                          alt="หลักฐาน"
                          className="w-12 h-12 rounded-[8px] object-cover border border-black/[0.05]"
                        />
                      </a>
                    ) : (
                      <EmployeeAvatar person={r} size={32} />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[13px] font-medium text-[#111110]">{r.first_name} {r.last_name}</span>
                        {r.nickname && <span className="text-[11px] text-gray-400">({r.nickname})</span>}
                        <span className="badge badge-purple text-[10px]">{typeTxt}</span>
                        <span className="text-[11px] tabular-nums text-gray-500">
                          · {dayjs(r.date).format('D MMM BBYY')}
                        </span>
                      </div>
                      <div className="text-[11px] text-gray-600 mt-1 tabular-nums">
                        {r.check_in_time && <>เข้า {String(r.check_in_time).slice(0,5)} </>}
                        {r.check_out_time && <>· ออก {String(r.check_out_time).slice(0,5)}</>}
                      </div>
                      <div className="text-[12px] text-gray-700 mt-1 break-words">{r.reason}</div>
                    </div>
                    <div className="flex flex-col gap-1 flex-shrink-0">
                      <button
                        onClick={() => onApproveBackdate(r.id)}
                        className="btn btn-primary text-[11px] px-2 py-1"
                        title="อนุมัติ"
                      >
                        <IconCheck size={12} /> อนุมัติ
                      </button>
                      <button
                        onClick={() => { setRejectingId(r.id); setRejectingKind('backdate'); setRejectReason('') }}
                        className="btn text-[11px] px-2 py-1 text-red-600 border-red-200 hover:bg-red-50"
                        title="ปฏิเสธ"
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
                        <button
                          onClick={() => { onRejectBackdate(r.id, rejectReason); setRejectingId(null); setRejectingKind(null) }}
                          className="btn text-[11px] text-red-600 border-red-200 hover:bg-red-50"
                        >
                          ยืนยันปฏิเสธ
                        </button>
                        <button
                          onClick={() => { setRejectingId(null); setRejectingKind(null); setRejectReason('') }}
                          className="btn text-[11px]"
                        >
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

      {/* Expandable employee list */}
      {(records.length > 0 || rejectedRecords.length > 0) && (
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

              {/* "ไม่อนุมัติคำขอลงนอกสถานที่" — framed as a record of HR's
                  decision, not a judgement on the employee. Neutral gray
                  styling, no strikethrough; the row reads as a log entry
                  showing both what the employee asked for and what HR
                  noted when declining, with the selfie thumbnail for
                  context recall. */}
              {rejectedRecords.length > 0 && (
                <div>
                  <div className="text-[11px] font-medium text-gray-500 mb-1.5 flex items-center gap-1.5">
                    <span className="badge badge-gray">ไม่อนุมัติคำขอลงนอกสถานที่</span>
                    <span>{rejectedRecords.length} รายการ</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {rejectedRecords.map((r: any) => (
                      <div
                        key={r.id}
                        className="flex items-start gap-2.5 px-3 py-2.5 rounded-[10px] bg-white border border-slate-200 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                        style={{ borderLeft: '3px solid #94a3b8' }}
                      >
                        {r.check_in_selfie ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={r.check_in_selfie}
                            alt=""
                            className="w-10 h-10 rounded-[8px] object-cover border border-black/[0.05] flex-shrink-0"
                          />
                        ) : (
                          <EmployeeAvatar person={r} size={40} />
                        )}
                        <div className="flex-1 min-w-0 leading-snug">
                          <div className="flex items-baseline gap-1.5 flex-wrap">
                            <span className="text-[13px] font-medium text-[#111110] truncate">
                              {r.first_name} {r.last_name}
                            </span>
                            <span className="text-[11px] text-gray-400 tabular-nums">
                              · {r.check_in_at ? dayjs(r.check_in_at).format('HH:mm') : '—'}
                            </span>
                          </div>
                          {r.offsite_reason && (
                            <div className="text-[11px] text-gray-600 mt-1 truncate" title={r.offsite_reason}>
                              <span className="text-gray-400">คำขอ:</span> {r.offsite_reason}
                            </div>
                          )}
                          {r.offsite_reject_reason && (
                            <div className="text-[11px] text-gray-600 mt-0.5 truncate" title={r.offsite_reject_reason}>
                              <span className="text-gray-400">หมายเหตุ:</span> {r.offsite_reject_reason}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
