'use client'
import { useEffect, useMemo, useState } from 'react'
import { otApi } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import {
  IconPlus, IconCheck, IconX, IconClockPlus,
  IconUserCheck, IconUserX, IconTrash, IconAlertCircle,
  IconClock,
} from '@tabler/icons-react'
import dayjs from 'dayjs'
import clsx from 'clsx'
import EmployeeAvatar from '@/components/employees/EmployeeAvatar'
import { useToast } from '@/components/ui/Toast'

// Backend uses a 4-state CHECK constraint:
//   pending → hr_approved | rejected (or manager_approved as an
//   intermediate, currently unused by the UI)
// The /ot/:id/cancel route maps employee-cancel onto 'rejected' with a
// sentinel reason, so we surface that as "ยกเลิก" for the user.
const SENTINEL_CANCEL_REASON = 'ยกเลิกโดยพนักงาน'

type DisplayStatus = 'pending' | 'hr_approved' | 'rejected' | 'cancelled' | 'manager_approved'
const STATUS_BADGE: Record<DisplayStatus, string> = {
  pending: 'badge-amber',
  manager_approved: 'badge-amber',
  hr_approved: 'badge-green',
  rejected: 'badge-red',
  cancelled: 'badge-gray',
}
const STATUS_TH: Record<DisplayStatus, string> = {
  pending: 'รออนุมัติ',
  manager_approved: 'รออนุมัติ',
  hr_approved: 'อนุมัติแล้ว',
  rejected: 'ปฏิเสธ',
  cancelled: 'ยกเลิก',
}
type StatusFilter = 'all' | 'pending' | 'hr_approved' | 'rejected' | 'cancelled'

/** Decide display status by inspecting raw status + the sentinel reason. */
function displayStatus(r: any): DisplayStatus {
  if (r.status === 'rejected' && r.rejected_reason === SENTINEL_CANCEL_REASON) return 'cancelled'
  return r.status
}

function calcHours(start: string, end: string): number {
  if (!start || !end) return 0
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  if ([sh, sm, eh, em].some(n => Number.isNaN(n))) return 0
  const mins = (eh * 60 + em) - (sh * 60 + sm)
  return mins > 0 ? +(mins / 60).toFixed(2) : 0
}

const todayISO = () => dayjs().format('YYYY-MM-DD')

export default function OTPage() {
  const { user } = useAuthStore()
  const toastApi = useToast()
  const role = user?.role
  const isOwner = role === 'owner'
  const canSeePending = role === 'hr' || role === 'owner'

  const [pending, setPending] = useState<any[]>([])
  const [history, setHistory] = useState<any[]>([])
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const [form, setForm] = useState({
    date: todayISO(),
    startTime: '18:00',
    endTime: '20:00',
    reason: '',
  })
  const [showForm, setShowForm] = useState(false)
  const [formMsg, setFormMsg] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [actingId, setActingId] = useState<string | null>(null)

  const load = async () => {
    const promises: Promise<any>[] = []
    if (canSeePending) promises.push(otApi.pending().catch(() => null))
    if (!isOwner) promises.push(otApi.myHistory().catch(() => null))
    const results = await Promise.all(promises)
    if (canSeePending) setPending(results[0]?.data?.data || [])
    if (!isOwner) {
      const idx = canSeePending ? 1 : 0
      setHistory(results[idx]?.data?.data || [])
    }
  }

  // useAuthStore.user populates async — first render has role=undefined
  // so canSeePending/isOwner are both false and load() pulls the wrong
  // bundle (history only, no pending). Re-run when those resolve.
  useEffect(() => { load() /* eslint-disable-next-line */ }, [canSeePending, isOwner])

  useEffect(() => {
    if (!toast || !toast.ok) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  const flash = (text: string, ok = true) => setToast({ text, ok })

  const previewHours = useMemo(
    () => calcHours(form.startTime, form.endTime),
    [form.startTime, form.endTime]
  )
  const timesInvalid = !!form.startTime && !!form.endTime && previewHours <= 0
  const dateInPast = !!form.date && dayjs(form.date).isBefore(todayISO())
  // Date in past is a soft warning (HR may need to log retroactive OT) but
  // form still submits.

  const canSubmit = form.date && form.startTime && form.endTime && form.reason.trim()
    && !timesInvalid && !submitting

  const submit = async () => {
    if (!canSubmit) {
      if (!form.date || !form.startTime || !form.endTime || !form.reason.trim()) {
        setFormMsg('กรุณากรอกข้อมูลให้ครบ')
      } else if (timesInvalid) {
        setFormMsg('เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม (ข้ามวันยังไม่รองรับ)')
      }
      return
    }
    setSubmitting(true); setFormMsg('')
    try {
      await otApi.create(form)
      flash(`ยื่นขอ OT ${previewHours} ชม. เรียบร้อย รออนุมัติ`)
      setShowForm(false)
      setForm({ date: todayISO(), startTime: '18:00', endTime: '20:00', reason: '' })
      load()
    } catch (e: any) {
      setFormMsg(e.response?.data?.message || 'เกิดข้อผิดพลาด')
    } finally { setSubmitting(false) }
  }

  const approve = async (id: string) => {
    setActingId(id)
    try {
      await otApi.approve(id, 'approved')
      flash('อนุมัติ OT แล้ว')
      load()
    } catch (e: any) {
      flash(e.response?.data?.message || 'อนุมัติไม่สำเร็จ', false)
    } finally { setActingId(null) }
  }

  const startReject = (id: string) => { setRejectingId(id); setRejectReason('') }
  const confirmReject = async (id: string) => {
    setActingId(id)
    try {
      await otApi.approve(id, 'rejected', rejectReason.trim() || undefined)
      flash('ปฏิเสธ OT แล้ว')
      setRejectingId(null); setRejectReason('')
      load()
    } catch (e: any) {
      flash(e.response?.data?.message || 'ปฏิเสธไม่สำเร็จ', false)
    } finally { setActingId(null) }
  }

  const cancelOwn = async (id: string) => {
    const ok = await toastApi.confirm('ยกเลิกคำขอ OT นี้?', { confirmText: 'ยกเลิกคำขอ', tone: 'danger' })
    if (!ok) return
    setActingId(id)
    try {
      await otApi.cancel(id)
      flash('ยกเลิกคำขอ OT แล้ว')
      load()
    } catch (e: any) {
      flash(e.response?.data?.message || 'ยกเลิกไม่สำเร็จ', false)
    } finally { setActingId(null) }
  }

  const historyDisplay = useMemo(
    () => history.map(h => ({ ...h, _display: displayStatus(h) })),
    [history]
  )
  const filteredHistory = useMemo(() => {
    if (statusFilter === 'all') return historyDisplay
    return historyDisplay.filter(h => h._display === statusFilter)
  }, [historyDisplay, statusFilter])

  const historyCounts = useMemo(() => {
    const c: Record<StatusFilter, number> = { all: historyDisplay.length, pending: 0, hr_approved: 0, rejected: 0, cancelled: 0 }
    for (const h of historyDisplay) {
      const k = h._display === 'manager_approved' ? 'pending' : h._display
      if (k in c) c[k as StatusFilter] = (c[k as StatusFilter] || 0) + 1
    }
    return c
  }, [historyDisplay])

  const totalApprovedHours = useMemo(
    () => historyDisplay
      .filter(h => h._display === 'hr_approved')
      .reduce((sum, h) => sum + Number(h.hours || 0), 0),
    [historyDisplay]
  )

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#111110]">OT — ล่วงเวลา</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isOwner ? 'อนุมัติคำขอ OT ของพนักงาน' : 'ยื่นและติดตามคำขอทำงานล่วงเวลา'}
          </p>
        </div>
        {!isOwner && (
          <button
            onClick={() => { setShowForm(s => !s); setFormMsg('') }}
            className="btn btn-primary text-sm"
          >
            <IconPlus size={15} /> {showForm ? 'ปิดฟอร์ม' : 'ยื่นคำขอ OT'}
          </button>
        )}
      </div>

      {toast && (
        <div className={clsx(
          'mb-4 px-3 py-2 rounded-[10px] text-sm flex items-center gap-2',
          toast.ok ? 'bg-[#E1F5EE] text-[#085041]' : 'bg-red-50 text-red-600'
        )}>
          {toast.ok ? <IconCheck size={14} /> : <IconAlertCircle size={14} />}
          <span className="flex-1">{toast.text}</span>
          <button onClick={() => setToast(null)} aria-label="ปิด"><IconX size={13} /></button>
        </div>
      )}

      {/* Form */}
      {showForm && !isOwner && (
        <div className="card mb-5">
          <h2 className="text-sm font-semibold mb-4">ยื่นคำขอ OT ใหม่</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="label">วันที่</label>
              <input
                type="date"
                className="input"
                value={form.date}
                onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
              />
            </div>
            <div>
              <label className="label">เวลาเริ่ม</label>
              <input
                type="time"
                className="input"
                value={form.startTime}
                onChange={e => setForm(p => ({ ...p, startTime: e.target.value }))}
              />
            </div>
            <div>
              <label className="label">เวลาสิ้นสุด</label>
              <input
                type="time"
                className="input"
                value={form.endTime}
                onChange={e => setForm(p => ({ ...p, endTime: e.target.value }))}
              />
            </div>
            <div className="sm:col-span-3">
              <label className="label">เหตุผล</label>
              <input
                className="input"
                placeholder="ระบุเหตุผล เช่น ปิดงบสิ้นเดือน, ส่งงานลูกค้า"
                value={form.reason}
                onChange={e => setForm(p => ({ ...p, reason: e.target.value }))}
              />
            </div>
          </div>

          {/* Hour preview / warnings */}
          <div className={clsx(
            'mt-3 px-3 py-2 rounded-[10px] text-xs flex items-center gap-2',
            timesInvalid
              ? 'bg-red-50 text-red-700'
              : dateInPast
                ? 'bg-[#FAEEDA] text-[#633806]'
                : previewHours > 0
                  ? 'bg-[#E1F5EE] text-[#085041]'
                  : 'bg-gray-50 text-gray-500'
          )}>
            {timesInvalid
              ? <>เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม (ข้ามวันยังไม่รองรับ)</>
              : previewHours > 0
                ? <>
                    <IconClockPlus size={13} />
                    รวมเวลาทำงาน <strong>{previewHours} ชั่วโมง</strong>
                    {dateInPast && <span className="ml-2 text-[#633806]">· ระวัง: วันที่ผ่านมาแล้ว</span>}
                  </>
                : <>เลือกเวลาเริ่ม-สิ้นสุดเพื่อดูจำนวนชั่วโมง</>
            }
          </div>

          {formMsg && <p className="text-xs mt-3 text-red-600">{formMsg}</p>}

          <div className="flex gap-2 mt-4">
            <button onClick={submit} disabled={!canSubmit} className="btn btn-primary text-sm">
              {submitting ? 'กำลังส่ง…' : 'ส่งคำขอ'}
            </button>
            <button onClick={() => { setShowForm(false); setFormMsg('') }} className="btn text-sm">ยกเลิก</button>
          </div>
        </div>
      )}

      <div className={clsx(
        'grid gap-5',
        // Owner sees only pending. Non-HR sees only history. HR sees both.
        canSeePending && !isOwner
          ? 'grid-cols-1 lg:grid-cols-2'
          : 'grid-cols-1'
      )}>
        {/* Pending list (HR/owner) */}
        {canSeePending && (
          <div className="card">
            <h2 className="text-sm font-semibold mb-3 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <IconUserCheck size={14} className="text-gray-400" />
                OT รออนุมัติ
              </span>
              {pending.length > 0 && <span className="text-xs text-gray-400">{pending.length} รายการ</span>}
            </h2>
            {pending.length === 0
              ? <p className="text-xs text-gray-400 py-6 text-center">ไม่มีคำขอ OT รออนุมัติ</p>
              : <div className="divide-y divide-black/[0.05]">
                  {pending.map((r: any) => (
                    <div key={r.id} className="py-3">
                      <div className="flex items-start gap-3">
                        <EmployeeAvatar person={r} size={32} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-[#111110] truncate">
                            {r.first_name} {r.last_name}
                            {r.nickname && <span className="text-gray-400 font-normal ml-1">({r.nickname})</span>}
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            <IconClock size={11} className="inline mr-1 -mt-0.5" />
                            {dayjs(r.date).format('D MMM YY')} · {r.start_time?.slice(0,5)}–{r.end_time?.slice(0,5)}
                            <span className="text-gray-700 font-medium ml-1">· {Number(r.hours).toFixed(1)} ชม.</span>
                          </div>
                          {r.reason && (
                            <div className="text-xs text-gray-500 mt-1 break-words">เหตุผล: {r.reason}</div>
                          )}
                        </div>
                        <div className="flex gap-1.5 flex-shrink-0">
                          <button
                            onClick={() => startReject(r.id)}
                            disabled={actingId === r.id}
                            className="btn text-xs px-2.5 py-1.5 text-red-500 border-red-200 hover:bg-red-50"
                            title="ปฏิเสธ"
                          >
                            <IconX size={13} />
                          </button>
                          <button
                            onClick={() => approve(r.id)}
                            disabled={actingId === r.id}
                            className="btn btn-primary text-xs px-2.5 py-1.5"
                            title="อนุมัติ"
                          >
                            <IconCheck size={13} />
                          </button>
                        </div>
                      </div>
                      {rejectingId === r.id && (
                        <div className="mt-3 ml-11 p-3 rounded-[10px] bg-red-50/40 border border-red-100">
                          <label className="block text-[11px] font-medium text-red-700 mb-1.5">
                            เหตุผลที่ปฏิเสธ (ไม่บังคับ)
                          </label>
                          <textarea
                            className="input text-xs min-h-[50px]"
                            placeholder="เช่น ไม่ใช่เคสด่วน / ขอจัดสรรเวลาในวันทำงานก่อน"
                            value={rejectReason}
                            onChange={e => setRejectReason(e.target.value)}
                            autoFocus
                          />
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={() => confirmReject(r.id)}
                              disabled={actingId === r.id}
                              className="btn text-xs text-red-600 border-red-200 hover:bg-red-50"
                            >
                              {actingId === r.id ? 'กำลังบันทึก…' : 'ยืนยันปฏิเสธ'}
                            </button>
                            <button
                              onClick={() => { setRejectingId(null); setRejectReason('') }}
                              className="btn text-xs"
                            >
                              ยกเลิก
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>}
          </div>
        )}

        {/* History (non-owner) */}
        {!isOwner && (
          <div className="card">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <IconClock size={14} className="text-gray-400" />
                ประวัติ OT
              </h2>
              {totalApprovedHours > 0 && (
                <span className="text-[11px] text-[#085041] bg-[#E1F5EE] px-2 py-0.5 rounded-md">
                  รวมอนุมัติ {totalApprovedHours.toFixed(1)} ชม.
                </span>
              )}
            </div>

            {/* Status filter chips */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {(['all','pending','hr_approved','rejected','cancelled'] as StatusFilter[]).map(s => {
                const active = statusFilter === s
                const count = historyCounts[s] || 0
                return (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    disabled={s !== 'all' && count === 0}
                    className={clsx(
                      'text-[11px] px-2.5 py-1 rounded-full border transition-colors',
                      active
                        ? 'bg-[#111110] text-white border-[#111110]'
                        : count === 0 && s !== 'all'
                          ? 'bg-gray-50 text-gray-300 border-transparent cursor-not-allowed'
                          : 'bg-white text-gray-600 border-black/[0.08] hover:bg-gray-50'
                    )}
                  >
                    {s === 'all' ? 'ทั้งหมด' : STATUS_TH[s as DisplayStatus]} {count > 0 && (
                      <span className={clsx('ml-1', active ? 'opacity-70' : 'text-gray-400')}>{count}</span>
                    )}
                  </button>
                )
              })}
            </div>

            {filteredHistory.length === 0
              ? <p className="text-xs text-gray-400 py-6 text-center">
                  {historyDisplay.length === 0 ? 'ยังไม่มีประวัติ OT' : 'ไม่มีรายการในสถานะนี้'}
                </p>
              : <div className="divide-y divide-black/[0.05]">
                  {filteredHistory.map((r: any) => {
                    const ds: DisplayStatus = r._display
                    const isPending = ds === 'pending' || ds === 'manager_approved'
                    const isApproved = ds === 'hr_approved'
                    const isRejected = ds === 'rejected'
                    const approverName = r.approver_first_name
                      ? `${r.approver_first_name}${r.approver_last_name ? ' ' + r.approver_last_name : ''}`
                      : null
                    return (
                      <div key={r.id} className="py-2.5">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm text-[#111110]">
                                {dayjs(r.date).format('D MMM YY')} · {r.start_time?.slice(0,5)}–{r.end_time?.slice(0,5)}
                              </span>
                              <span className="text-xs text-gray-500 tabular-nums">{Number(r.hours).toFixed(1)} ชม.</span>
                              <span className={clsx('badge flex-shrink-0', STATUS_BADGE[ds] || 'badge-gray')}>
                                {STATUS_TH[ds] || ds}
                              </span>
                            </div>
                          </div>
                          {isPending && (
                            <button
                              onClick={() => cancelOwn(r.id)}
                              disabled={actingId === r.id}
                              className="btn text-xs px-2 py-1 text-gray-500 hover:text-red-600 hover:bg-red-50 hover:border-red-200"
                              title="ยกเลิกคำขอ"
                            >
                              <IconTrash size={12} />
                            </button>
                          )}
                        </div>
                        {(isApproved || isRejected) && (approverName || r.rejected_reason) && (
                          <div className="text-[11px] text-gray-400 mt-1">
                            {isApproved && approverName && <>อนุมัติโดย {approverName}</>}
                            {/* When isRejected is true, ds is already
                                narrowed to 'rejected' (cancellations have
                                ds='cancelled' and isRejected=false), so we
                                don't need an extra ds!=='cancelled' guard
                                — TS even flags it as a no-overlap compare. */}
                            {isRejected && (
                              <>
                                <span className="inline-flex items-center gap-1 text-red-500">
                                  <IconUserX size={11} /> ปฏิเสธ
                                </span>
                                {approverName && <> โดย {approverName}</>}
                                {r.rejected_reason && r.rejected_reason !== SENTINEL_CANCEL_REASON && (
                                  <span className="text-gray-500"> · "{r.rejected_reason}"</span>
                                )}
                              </>
                            )}
                          </div>
                        )}
                        {r.reason && (
                          <div className="text-[11px] text-gray-400 mt-0.5 truncate">เหตุผล: {r.reason}</div>
                        )}
                      </div>
                    )
                  })}
                </div>}
          </div>
        )}
      </div>
    </div>
  )
}
