'use client'
import { useEffect, useMemo, useState } from 'react'
import { leaveApi, employeeApi, type LeaveQuotaRow, type LeaveType } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import {
  IconPlus, IconCheck, IconX, IconCalendarOff,
  IconUserCheck, IconUserX, IconTrash, IconAlertCircle, IconUsers,
  IconPaperclip, IconFileText, IconHistory, IconEdit, IconClipboardPlus,
  IconClock,
} from '@tabler/icons-react'
import dayjs from 'dayjs'
import clsx from 'clsx'
import EmployeeAvatar from '@/components/employees/EmployeeAvatar'

// Reduce arbitrary image attachments to ~1024px JPEG so a single phone
// photo (often 5–8 MB raw) lands under our ~500 KB document cap. PDFs
// and non-image files are passed through as their original base64.
async function fileToBase64(file: File, maxImageSize = 1024, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('อ่านไฟล์ไม่ได้'))
    reader.onload = () => {
      if (!file.type.startsWith('image/')) {
        resolve(reader.result as string)
        return
      }
      const img = new Image()
      img.onerror = () => reject(new Error('โหลดรูปไม่ได้'))
      img.onload = () => {
        const scale = Math.min(1, maxImageSize / Math.max(img.width, img.height))
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('canvas error'))
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

function openInNewTab(dataUrl: string) {
  const w = window.open()
  if (!w) return
  w.document.write(`<iframe src="${dataUrl}" style="border:0;width:100vw;height:100vh"></iframe>`)
}

const STATUS_BADGE: Record<string, string> = {
  pending: 'badge-amber', approved: 'badge-green', rejected: 'badge-red', cancelled: 'badge-gray',
}
const STATUS_TH: Record<string, string> = {
  pending: 'รออนุมัติ', approved: 'อนุมัติแล้ว', rejected: 'ปฏิเสธ', cancelled: 'ยกเลิก',
}
type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected' | 'cancelled'

const todayISO = () => dayjs().format('YYYY-MM-DD')

/** Count working days (Mon–Fri) inclusive. Mirrors backend logic. */
function countWorkingDays(startISO: string, endISO: string): number {
  if (!startISO || !endISO) return 0
  const start = dayjs(startISO)
  const end = dayjs(endISO)
  if (!start.isValid() || !end.isValid() || end.isBefore(start)) return 0
  let n = 0
  let cur = start
  while (!cur.isAfter(end)) {
    const dow = cur.day()
    if (dow !== 0 && dow !== 6) n++
    cur = cur.add(1, 'day')
  }
  return n
}

export default function LeavePage() {
  const { user } = useAuthStore()
  const role = user?.role
  // Owner has no quota and no one to approve them — same rule as
  // /attendance and /ot. Page becomes approval-only for owner.
  const isOwner = role === 'owner'
  const canSeePending = role === 'hr' || role === 'owner'

  const [types, setTypes] = useState<LeaveType[]>([])
  const [quota, setQuota] = useState<any[]>([])
  const [history, setHistory] = useState<any[]>([])
  const [pending, setPending] = useState<any[]>([])
  const [teamQuotas, setTeamQuotas] = useState<LeaveQuotaRow[]>([])
  const [teamYear, setTeamYear] = useState<number>(dayjs().year())
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const [form, setForm] = useState<{
    leaveTypeId: string; startDate: string; endDate: string; reason: string; document: string
  }>({ leaveTypeId: '', startDate: '', endDate: '', reason: '', document: '' })
  const [showForm, setShowForm] = useState(false)
  const [formMsg, setFormMsg] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // HR/owner extras: organization-wide request feed + admin-record + quota-edit modals.
  const [allRequests, setAllRequests] = useState<any[]>([])
  const [showAllRequests, setShowAllRequests] = useState(false)
  const [allReqStatus, setAllReqStatus] = useState<StatusFilter>('all')
  const [adminRecordOpen, setAdminRecordOpen] = useState(false)
  const [quotaEditing, setQuotaEditing] = useState<LeaveQuotaRow | null>(null)
  // Doc preview modal — both viewers and HR queue use it.
  const [docPreview, setDocPreview] = useState<string | null>(null)

  // Page-level toast (separate from in-form message so they don't trample
  // each other when both events happen close together).
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null)

  // Inline reject form: which pending row, and its reason text.
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [actingId, setActingId] = useState<string | null>(null)

  const load = async () => {
    // Owner skips the personal calls (types/quota/history). They have no
    // quota row and the type-picker is only useful for filing requests,
    // which they can't do.
    if (!isOwner) {
      const [typesRes, quotaRes, histRes] = await Promise.allSettled([
        leaveApi.types(), leaveApi.myQuota(), leaveApi.myHistory(),
      ])
      if (typesRes.status === 'fulfilled') setTypes(typesRes.value.data.data || [])
      if (quotaRes.status === 'fulfilled') setQuota(quotaRes.value.data.data || [])
      if (histRes.status === 'fulfilled') setHistory(histRes.value.data.data || [])
    }
    if (canSeePending) {
      const pendRes = await leaveApi.pending().catch(() => null)
      if (pendRes) setPending(pendRes.data.data || [])
    }
  }

  // Team-quota overview is HR/owner-only and refetches when the year
  // selector changes; kept separate from load() so changing year doesn't
  // re-pull the personal + pending bundle.
  const loadTeamQuotas = async (year: number) => {
    if (!canSeePending) return
    const r = await leaveApi.allQuotas(year).catch(() => null)
    if (r) setTeamQuotas(r.data.data || [])
  }

  // useAuthStore.user populates async via fetchMe — on the first render
  // role is undefined, so isOwner/canSeePending are both false. We have
  // to re-run load() once those resolve or HR/owner never see the
  // pending queue and owner pointlessly fetches /myQuota → 404.
  useEffect(() => { load() /* eslint-disable-next-line */ }, [isOwner, canSeePending])
  useEffect(() => { loadTeamQuotas(teamYear) /* eslint-disable-next-line */ }, [teamYear, canSeePending])

  // Auto-dismiss success toasts; errors persist until next action.
  useEffect(() => {
    if (!toast || !toast.ok) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  const flash = (text: string, ok = true) => setToast({ text, ok })

  // Live day-count preview based on what the user has typed so far.
  const previewDays = useMemo(
    () => countWorkingDays(form.startDate, form.endDate),
    [form.startDate, form.endDate]
  )
  const selectedQuota = quota.find(q => q.leave_type_id === form.leaveTypeId)
  const selectedType = useMemo(
    () => types.find(t => t.id === form.leaveTypeId),
    [types, form.leaveTypeId]
  )
  // Earliest start date the employee can pick = today + advance_notice_days.
  // 0 = same-day OK (sick leave). dayjs().add returns a new instance so
  // the comparison below is safe to mutate.
  const minStartDate = useMemo(() => {
    const notice = selectedType?.advance_notice_days ?? 0
    return dayjs().add(notice, 'day').format('YYYY-MM-DD')
  }, [selectedType])
  const docRequired = !!selectedType?.requires_document
  const docMissing = docRequired && !form.document
  const quotaWarning = selectedQuota && previewDays > 0 && previewDays > selectedQuota.remaining_days
  const datesInvalid = !!form.startDate && !!form.endDate && dayjs(form.endDate).isBefore(form.startDate)
  const advanceShort = !!form.startDate && selectedType
    ? dayjs(form.startDate).isBefore(minStartDate)
    : false

  const canSubmit = form.leaveTypeId && form.startDate && form.endDate && form.reason.trim()
    && !datesInvalid && previewDays > 0 && !quotaWarning && !advanceShort && !docMissing && !submitting

  const submit = async () => {
    if (!canSubmit) {
      if (!form.leaveTypeId || !form.startDate || !form.endDate || !form.reason.trim()) {
        setFormMsg('กรุณากรอกข้อมูลให้ครบ')
      } else if (datesInvalid) {
        setFormMsg('วันสิ้นสุดต้องไม่ก่อนวันเริ่มลา')
      } else if (previewDays === 0) {
        setFormMsg('ช่วงวันที่เลือกไม่มีวันทำงาน (ส.-อา. ไม่นับ)')
      } else if (advanceShort) {
        setFormMsg(`ลาประเภทนี้ต้องยื่นล่วงหน้าอย่างน้อย ${selectedType?.advance_notice_days} วัน`)
      } else if (docMissing) {
        setFormMsg('ประเภทการลานี้ต้องแนบหลักฐาน')
      } else if (quotaWarning) {
        setFormMsg(`วันลาไม่พอ — คงเหลือ ${selectedQuota?.remaining_days} วัน แต่ขอ ${previewDays} วัน`)
      }
      return
    }
    setSubmitting(true); setFormMsg('')
    try {
      await leaveApi.create({
        leaveTypeId: form.leaveTypeId,
        startDate: form.startDate,
        endDate: form.endDate,
        reason: form.reason,
        document: form.document || undefined,
      })
      flash(`ยื่นคำขอลา ${previewDays} วัน เรียบร้อย รออนุมัติ`)
      setShowForm(false)
      setForm({ leaveTypeId: '', startDate: '', endDate: '', reason: '', document: '' })
      load()
    } catch (e: any) {
      setFormMsg(e.response?.data?.message || 'เกิดข้อผิดพลาด')
    } finally { setSubmitting(false) }
  }

  const handleDocPick = async (file: File) => {
    if (file.size > 8 * 1024 * 1024) {
      setFormMsg('ไฟล์ใหญ่เกิน 8MB'); return
    }
    try {
      const dataUrl = await fileToBase64(file)
      if (dataUrl.length > 700 * 1024) {
        setFormMsg('ไฟล์แนบใหญ่เกินไปหลังบีบอัด (สูงสุด ~500KB)'); return
      }
      setForm(p => ({ ...p, document: dataUrl }))
      setFormMsg('')
    } catch (e: any) {
      setFormMsg(e.message || 'อ่านไฟล์ไม่ได้')
    }
  }

  // HR/owner: reload the org-wide feed whenever the status filter changes
  // or the panel is opened. Doesn't piggyback on load() because it's a
  // separate panel that shouldn't pull every time approvals happen.
  const loadAllRequests = async (status?: StatusFilter) => {
    if (!canSeePending) return
    const params = status && status !== 'all' ? { status } : undefined
    const r = await leaveApi.allRequests(params as any).catch(() => null)
    if (r) setAllRequests(r.data.data || [])
  }
  useEffect(() => {
    if (showAllRequests) loadAllRequests(allReqStatus)
    /* eslint-disable-next-line */
  }, [showAllRequests, allReqStatus])

  const approve = async (id: string) => {
    setActingId(id)
    try {
      await leaveApi.approve(id, 'approved')
      flash('อนุมัติคำขอลาแล้ว')
      load()
    } catch (e: any) {
      flash(e.response?.data?.message || 'อนุมัติไม่สำเร็จ', false)
    } finally { setActingId(null) }
  }

  const startReject = (id: string) => {
    setRejectingId(id)
    setRejectReason('')
  }
  const confirmReject = async (id: string) => {
    setActingId(id)
    try {
      await leaveApi.approve(id, 'rejected', rejectReason.trim() || undefined)
      flash('ปฏิเสธคำขอลาแล้ว')
      setRejectingId(null)
      setRejectReason('')
      load()
    } catch (e: any) {
      flash(e.response?.data?.message || 'ปฏิเสธไม่สำเร็จ', false)
    } finally { setActingId(null) }
  }

  const cancelOwn = async (id: string) => {
    if (!confirm('ยกเลิกคำขอลานี้?')) return
    setActingId(id)
    try {
      await leaveApi.cancel(id)
      flash('ยกเลิกคำขอลาแล้ว')
      load()
    } catch (e: any) {
      flash(e.response?.data?.message || 'ยกเลิกไม่สำเร็จ', false)
    } finally { setActingId(null) }
  }

  const filteredHistory = useMemo(() => {
    if (statusFilter === 'all') return history
    return history.filter(h => h.status === statusFilter)
  }, [history, statusFilter])

  const historyCounts = useMemo(() => {
    const c: Record<StatusFilter, number> = { all: history.length, pending: 0, approved: 0, rejected: 0, cancelled: 0 }
    for (const h of history) c[h.status as StatusFilter] = (c[h.status as StatusFilter] || 0) + 1
    return c
  }, [history])

  // Pivot the flat (employee × leave_type) response into a table layout:
  // columns = union of leave-type names; rows = one per employee, with
  // a cells map keyed by leave-type name. Column order is alphabetical
  // (Thai locale) so a leave_type that appears for some employees but
  // not others still gets a stable column slot.
  const { teamColumns, teamRows } = useMemo(() => {
    const cols = new Set<string>()
    const byEmp = new Map<string, { emp: LeaveQuotaRow; cells: Map<string, LeaveQuotaRow> }>()
    for (const r of teamQuotas) {
      const tname = r.leave_type_name || ''
      if (tname) cols.add(tname)
      if (!byEmp.has(r.employee_id)) byEmp.set(r.employee_id, { emp: r, cells: new Map() })
      if (tname) byEmp.get(r.employee_id)!.cells.set(tname, r)
    }
    const columns = Array.from(cols).sort((a, b) => a.localeCompare(b, 'th'))
    const rows = Array.from(byEmp.values()).sort((a, b) =>
      `${a.emp.first_name || ''} ${a.emp.last_name || ''}`
        .localeCompare(`${b.emp.first_name || ''} ${b.emp.last_name || ''}`, 'th')
    )
    return { teamColumns: columns, teamRows: rows }
  }, [teamQuotas])

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#111110]">การลา</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isOwner ? 'อนุมัติคำขอลาของพนักงาน' : 'จัดการคำขอลาและโควตา'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canSeePending && (
            <>
              <button
                onClick={() => setAdminRecordOpen(true)}
                className="btn text-sm"
                title="บันทึกการลาให้พนักงาน (Auto-approved)"
              >
                <IconClipboardPlus size={15} /> บันทึกย้อนหลัง
              </button>
              <button
                onClick={() => setShowAllRequests(s => !s)}
                className={clsx('btn text-sm', showAllRequests && 'bg-[#111110] text-white border-[#111110]')}
              >
                <IconHistory size={15} /> ภาพรวมทั้งหมด
              </button>
            </>
          )}
          {!isOwner && (
            <button
              onClick={() => { setShowForm(s => !s); setFormMsg('') }}
              className="btn btn-primary text-sm"
            >
              <IconPlus size={15} /> {showForm ? 'ปิดฟอร์ม' : 'ยื่นคำขอลา'}
            </button>
          )}
        </div>
      </div>

      {/* Page-level toast */}
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
          <h2 className="text-sm font-semibold mb-4">ยื่นคำขอลาใหม่</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="label">ประเภทการลา</label>
              <select className="input" value={form.leaveTypeId}
                onChange={e => setForm(p => ({ ...p, leaveTypeId: e.target.value }))}>
                <option value="">— เลือกประเภท —</option>
                {types.map(t => {
                  const q = quota.find(q => q.leave_type_id === t.id)
                  const remain = q?.remaining_days
                  const total = q?.total_days ?? t.days_per_year
                  return (
                    <option key={t.id} value={t.id}>
                      {t.name} {q ? `(คงเหลือ ${remain}/${total} วัน)` : `(${total} วัน/ปี)`}
                    </option>
                  )
                })}
              </select>
            </div>
            <div>
              <label className="label">วันเริ่มลา</label>
              <input
                type="date"
                className="input"
                min={minStartDate}
                value={form.startDate}
                onChange={e => setForm(p => ({
                  ...p,
                  startDate: e.target.value,
                  // Auto-bump endDate if it ends up before the new start
                  endDate: p.endDate && dayjs(p.endDate).isBefore(e.target.value) ? e.target.value : p.endDate,
                }))}
              />
              {selectedType && (
                <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                  <IconClock size={10} />
                  {selectedType.advance_notice_days === 0
                    ? 'ลาประเภทนี้ยื่นวันเดียวกันได้'
                    : `ลาประเภทนี้ต้องยื่นล่วงหน้าอย่างน้อย ${selectedType.advance_notice_days} วัน`}
                </p>
              )}
            </div>
            <div>
              <label className="label">วันสิ้นสุด</label>
              <input
                type="date"
                className="input"
                min={form.startDate || minStartDate}
                value={form.endDate}
                onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label">เหตุผล</label>
              <input className="input" placeholder="ระบุเหตุผล (เช่น ลากิจส่วนตัว, ไปต่างจังหวัด)"
                value={form.reason}
                onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} />
            </div>
            <div className="sm:col-span-2">
              <label className="label flex items-center gap-1.5">
                <IconPaperclip size={13} />
                หลักฐาน (เช่น ใบรับรองแพทย์)
                {docRequired && <span className="text-red-500 text-[11px]">* จำเป็น</span>}
                {!docRequired && <span className="text-gray-400 text-[11px]">(ไม่บังคับ)</span>}
              </label>
              <div className="flex items-center gap-2 flex-wrap">
                <label className={clsx(
                  'btn text-xs cursor-pointer',
                  docRequired && !form.document && 'border-red-200 text-red-600'
                )}>
                  <IconPaperclip size={13} /> เลือกไฟล์
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={e => e.target.files?.[0] && handleDocPick(e.target.files[0])}
                  />
                </label>
                {form.document && (
                  <>
                    {form.document.startsWith('data:image/') ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={form.document}
                        alt="หลักฐาน"
                        onClick={() => setDocPreview(form.document)}
                        className="w-12 h-12 rounded object-cover border border-black/[0.08] cursor-zoom-in"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setDocPreview(form.document)}
                        className="px-2 py-1 text-xs rounded border border-black/[0.08] inline-flex items-center gap-1.5"
                      >
                        <IconFileText size={12} /> ดู PDF
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setForm(p => ({ ...p, document: '' }))}
                      className="btn text-xs text-red-500 border-red-200 hover:bg-red-50"
                    >
                      <IconX size={12} /> เอาออก
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Day preview / warnings */}
          {(form.startDate && form.endDate) && (
            <div className={clsx(
              'mt-3 px-3 py-2 rounded-[10px] text-xs flex items-center gap-2',
              datesInvalid || quotaWarning || advanceShort
                ? 'bg-red-50 text-red-700'
                : previewDays === 0
                  ? 'bg-[#FAEEDA] text-[#633806]'
                  : 'bg-[#E6F1FB] text-[#0C447C]'
            )}>
              {datesInvalid
                ? <>วันสิ้นสุดอยู่ก่อนวันเริ่มลา</>
                : advanceShort
                  ? <>ต้องยื่นล่วงหน้าอย่างน้อย {selectedType?.advance_notice_days} วัน — เลือกวันเริ่มตั้งแต่ {dayjs(minStartDate).format('D MMM YY')} เป็นต้นไป</>
                  : previewDays === 0
                    ? <>ช่วงนี้ไม่มีวันทำงาน (เสาร์-อาทิตย์ไม่นับเป็นวันลา)</>
                    : quotaWarning
                      ? <>วันลาไม่พอ — คงเหลือ {selectedQuota?.remaining_days} วัน แต่ขอ {previewDays} วัน</>
                      : <>ขอลา <strong>{previewDays} วัน</strong> {selectedQuota && <>· จะเหลือ {selectedQuota.remaining_days - previewDays}/{selectedQuota.total_days} วัน</>}</>
              }
            </div>
          )}
          {docMissing && (
            <div className="mt-2 px-3 py-2 rounded-[10px] text-xs bg-amber-50 text-amber-700 flex items-center gap-2">
              <IconAlertCircle size={13} />
              ลา"{selectedType?.name}" ต้องแนบหลักฐาน (เช่น ใบรับรองแพทย์) ก่อนยื่น
            </div>
          )}

          {formMsg && (
            <p className="text-xs mt-3 text-red-600">{formMsg}</p>
          )}

          <div className="flex gap-2 mt-4">
            <button onClick={submit} disabled={!canSubmit} className="btn btn-primary text-sm">
              {submitting ? 'กำลังส่ง…' : 'ส่งคำขอ'}
            </button>
            <button onClick={() => { setShowForm(false); setFormMsg('') }} className="btn text-sm">ยกเลิก</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Quota — owner has no quota row, hide entirely */}
        {!isOwner && (
        <div className="card">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <IconCalendarOff size={14} className="text-gray-400" />
            วันลาคงเหลือปีนี้
          </h2>
          {quota.length === 0
            ? <p className="text-xs text-gray-400">ยังไม่มีข้อมูลโควตา</p>
            : quota.map((q: any) => {
                const pct = q.total_days > 0 ? Math.round(q.used_days / q.total_days * 100) : 0
                return (
                  <div key={q.id} className="mb-3 last:mb-0">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-700">{q.leave_type_name}</span>
                      <span className="font-medium tabular-nums">{q.remaining_days}/{q.total_days} วัน</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: pct > 80 ? '#E24B4A' : pct > 50 ? '#D9914A' : '#1D9E75' }}
                      />
                    </div>
                  </div>
                )
              })}
        </div>
        )}

        {/* Pending (HR/owner). Spans full row width when owner is the
            only viewer (quota + history both hidden). */}
        {canSeePending && (
          <div className={clsx('card', isOwner ? 'lg:col-span-3' : 'lg:col-span-2')}>
            <h2 className="text-sm font-semibold mb-3 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <IconUserCheck size={14} className="text-gray-400" />
                รออนุมัติ
              </span>
              {pending.length > 0 && <span className="text-xs text-gray-400">{pending.length} รายการ</span>}
            </h2>
            {pending.length === 0
              ? <p className="text-xs text-gray-400 py-6 text-center">ไม่มีคำขอรออนุมัติ</p>
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
                            <span className="badge badge-blue mr-1.5" style={{ fontSize: 10 }}>{r.leave_type_name}</span>
                            {dayjs(r.start_date).format('D MMM')}–{dayjs(r.end_date).format('D MMM YY')}
                            <span className="text-gray-700 font-medium ml-1">· {r.days_count} วัน</span>
                          </div>
                          {r.reason && (
                            <div className="text-xs text-gray-500 mt-1 break-words">เหตุผล: {r.reason}</div>
                          )}
                          {r.document && (
                            <button
                              onClick={() => setDocPreview(r.document)}
                              className="mt-1.5 inline-flex items-center gap-1.5"
                            >
                              {r.document.startsWith('data:image/') ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={r.document} alt="หลักฐาน" className="w-12 h-12 rounded object-cover border border-black/[0.08] cursor-zoom-in" />
                              ) : (
                                <span className="text-[11px] text-[#0C447C] underline inline-flex items-center gap-1"><IconFileText size={11} /> เปิดหลักฐาน</span>
                              )}
                            </button>
                          )}
                          {r.requires_document && !r.document && (
                            <div className="mt-1 text-[11px] text-amber-700 inline-flex items-center gap-1">
                              <IconAlertCircle size={11} /> ประเภทนี้บังคับให้แนบหลักฐาน — ไม่มีในคำขอ
                            </div>
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
                            placeholder="เช่น ช่วงนี้งานเร่ง / ขอเลื่อนเป็นสัปดาห์หน้า"
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

        {/* History — owner doesn't have personal leave history */}
        {!isOwner && (
        <div className={clsx('card', !canSeePending && 'lg:col-span-2')}>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <IconCalendarOff size={14} className="text-gray-400" />
              ประวัติการลา
            </h2>
          </div>

          {/* Status filter chips */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {(['all','pending','approved','rejected','cancelled'] as StatusFilter[]).map(s => {
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
                  {s === 'all' ? 'ทั้งหมด' : STATUS_TH[s]} {count > 0 && <span className={clsx('ml-1', active ? 'opacity-70' : 'text-gray-400')}>{count}</span>}
                </button>
              )
            })}
          </div>

          {filteredHistory.length === 0
            ? <p className="text-xs text-gray-400 py-6 text-center">
                {history.length === 0 ? 'ยังไม่มีประวัติการลา' : 'ไม่มีรายการในสถานะนี้'}
              </p>
            : <div className="divide-y divide-black/[0.05]">
                {filteredHistory.map((r: any) => {
                  const isPending = r.status === 'pending'
                  const isRejected = r.status === 'rejected'
                  const isApproved = r.status === 'approved'
                  const approverName = r.approver_first_name
                    ? `${r.approver_first_name}${r.approver_last_name ? ' ' + r.approver_last_name : ''}`
                    : null
                  return (
                    <div key={r.id} className="py-2.5">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm text-[#111110]">{r.leave_type_name}</span>
                            <span className={clsx('badge flex-shrink-0', STATUS_BADGE[r.status] || 'badge-gray')}>
                              {STATUS_TH[r.status] || r.status}
                            </span>
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            {dayjs(r.start_date).format('D MMM')}–{dayjs(r.end_date).format('D MMM YY')} · {r.days_count} วัน
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
                      {(isApproved || isRejected) && (approverName || r.hr_notes) && (
                        <div className="text-[11px] text-gray-400 mt-1 ml-0.5">
                          {isApproved && approverName && <>อนุมัติโดย {approverName}</>}
                          {isRejected && (
                            <>
                              <span className="inline-flex items-center gap-1 text-red-500">
                                <IconUserX size={11} /> ปฏิเสธ
                              </span>
                              {approverName && <> โดย {approverName}</>}
                              {r.hr_notes && <span className="text-gray-500"> · "{r.hr_notes}"</span>}
                            </>
                          )}
                        </div>
                      )}
                      {r.reason && (
                        <div className="text-[11px] text-gray-400 mt-0.5 truncate">เหตุผล: {r.reason}</div>
                      )}
                      {r.document && (
                        <button
                          onClick={() => setDocPreview(r.document)}
                          className="mt-1 inline-flex items-center gap-1 text-[10px] text-[#0C447C] underline"
                        >
                          <IconPaperclip size={10} /> ดูหลักฐานที่แนบ
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>}
        </div>
        )}
      </div>

      {/* Team-quota overview (HR/owner). Placed outside the main grid so
          it stretches to the page width and the table is comfortably
          readable when there are several leave-type columns. */}
      {canSeePending && (
        <div className="card mt-5">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <IconUsers size={14} className="text-gray-400" />
              โควต้าวันลาของทีม
              <span className="text-[11px] font-normal text-gray-400">({teamRows.length} คน)</span>
            </h2>
            <div className="flex items-center gap-2">
              <label className="text-[11px] text-gray-500">ปี</label>
              <select
                className="input text-xs py-1 px-2"
                value={teamYear}
                onChange={e => setTeamYear(parseInt(e.target.value, 10))}
              >
                {Array.from({ length: 5 }).map((_, i) => {
                  const y = dayjs().year() - i
                  return <option key={y} value={y}>{y + 543}</option>
                })}
              </select>
            </div>
          </div>

          {teamRows.length === 0 ? (
            <p className="text-xs text-gray-400 py-8 text-center">
              ยังไม่มีข้อมูลโควต้าในปี {teamYear + 543}
              <span className="block text-[11px] text-gray-400 mt-1">
                โควต้าจะถูกสร้างเมื่อพนักงานเปิดหน้าการลาครั้งแรกในปีนั้น
              </span>
            </p>
          ) : (
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] text-gray-500 border-b border-black/[0.06]">
                    <th className="py-2 pr-3 font-medium">พนักงาน</th>
                    <th className="py-2 pr-3 font-medium hidden sm:table-cell">แผนก</th>
                    {teamColumns.map(c => (
                      <th key={c} className="py-2 pr-3 font-medium text-right whitespace-nowrap">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.04]">
                  {teamRows.map(({ emp, cells }) => (
                    <tr key={emp.employee_id} className="hover:bg-gray-50/60">
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <EmployeeAvatar person={emp} size={26} />
                          <div className="min-w-0">
                            <div className="text-[13px] text-[#111110] truncate">
                              {emp.first_name} {emp.last_name}
                              {emp.nickname && <span className="text-gray-400 font-normal ml-1">({emp.nickname})</span>}
                            </div>
                            {emp.position && (
                              <div className="text-[10px] text-gray-400 truncate">{emp.position}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-[12px] text-gray-700 hidden sm:table-cell">
                        {emp.department_name || <span className="text-gray-300">—</span>}
                      </td>
                      {teamColumns.map(c => {
                        const cell = cells.get(c)
                        if (!cell) {
                          return <td key={c} className="py-2 pr-3 text-right text-[12px] text-gray-300">—</td>
                        }
                        const total = Number(cell.total_days) || 0
                        const used = Number(cell.used_days) || 0
                        const remaining = Number(cell.remaining_days)
                        const pct = total > 0 ? used / total : 0
                        const color =
                          remaining <= 0 ? '#E24B4A'
                          : pct >= 0.8   ? '#BA7517'
                          : '#1D9E75'
                        return (
                          <td key={c} className="py-2 pr-3 text-right">
                            <button
                              onClick={() => setQuotaEditing(cell)}
                              className="inline-flex flex-col items-end leading-tight group cursor-pointer"
                              title="คลิกเพื่อปรับโควตา"
                            >
                              <span className="tabular-nums text-[13px] font-medium group-hover:underline" style={{ color }}>
                                {used}/{total}
                              </span>
                              <span className="text-[10px] text-gray-400">
                                เหลือ {remaining}
                              </span>
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* All-requests panel — HR/owner organization-wide feed.
          Sits below team quotas so the page reads top→down: pending →
          quotas → historical roll-up. */}
      {canSeePending && showAllRequests && (
        <div className="card mt-5">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <IconHistory size={14} className="text-gray-400" />
              ภาพรวมคำขอลาทั้งหมด
              <span className="text-[11px] font-normal text-gray-400">({allRequests.length} รายการล่าสุด)</span>
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {(['all','pending','approved','rejected','cancelled'] as StatusFilter[]).map(s => {
                const active = allReqStatus === s
                return (
                  <button
                    key={s}
                    onClick={() => setAllReqStatus(s)}
                    className={clsx(
                      'text-[11px] px-2.5 py-1 rounded-full border',
                      active
                        ? 'bg-[#111110] text-white border-[#111110]'
                        : 'bg-white text-gray-600 border-black/[0.08] hover:bg-gray-50'
                    )}
                  >
                    {s === 'all' ? 'ทั้งหมด' : STATUS_TH[s]}
                  </button>
                )
              })}
            </div>
          </div>
          {allRequests.length === 0 ? (
            <p className="text-xs text-gray-400 py-8 text-center">ไม่มีรายการ</p>
          ) : (
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] text-gray-500 border-b border-black/[0.06]">
                    <th className="py-2 pr-3 font-medium">พนักงาน</th>
                    <th className="py-2 pr-3 font-medium">ประเภท</th>
                    <th className="py-2 pr-3 font-medium">ช่วงวัน</th>
                    <th className="py-2 pr-3 font-medium text-right">วัน</th>
                    <th className="py-2 pr-3 font-medium">สถานะ</th>
                    <th className="py-2 pr-3 font-medium hidden md:table-cell">เหตุผล</th>
                    <th className="py-2 pr-3 font-medium hidden lg:table-cell">หลักฐาน</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.04]">
                  {allRequests.map(r => (
                    <tr key={r.id} className="hover:bg-gray-50/60">
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <EmployeeAvatar person={r} size={24} />
                          <div className="min-w-0">
                            <div className="text-[13px] text-[#111110] truncate">
                              {r.first_name} {r.last_name}
                            </div>
                            {r.department && (
                              <div className="text-[10px] text-gray-400 truncate">{r.department}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-[12px]">{r.leave_type_name}</td>
                      <td className="py-2 pr-3 text-[12px] text-gray-600 whitespace-nowrap">
                        {dayjs(r.start_date).format('D MMM')}–{dayjs(r.end_date).format('D MMM YY')}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-[12px]">{r.days_count}</td>
                      <td className="py-2 pr-3">
                        <span className={clsx('badge', STATUS_BADGE[r.status] || 'badge-gray')}>
                          {STATUS_TH[r.status] || r.status}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-[11px] text-gray-500 hidden md:table-cell max-w-[200px] truncate">
                        {r.reason || '—'}
                      </td>
                      <td className="py-2 pr-3 hidden lg:table-cell">
                        {r.document ? (
                          <button onClick={() => setDocPreview(r.document)} className="text-[11px] text-[#0C447C] underline inline-flex items-center gap-1">
                            <IconPaperclip size={11} /> ดู
                          </button>
                        ) : <span className="text-gray-300 text-[11px]">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {adminRecordOpen && (
        <AdminRecordModal
          types={types.length ? types : undefined}
          onClose={() => setAdminRecordOpen(false)}
          onSaved={() => {
            setAdminRecordOpen(false)
            flash('บันทึกการลาย้อนหลังแล้ว')
            load()
            loadTeamQuotas(teamYear)
            if (showAllRequests) loadAllRequests(allReqStatus)
          }}
          onError={(text) => flash(text, false)}
        />
      )}
      {quotaEditing && (
        <QuotaEditModal
          row={quotaEditing}
          year={teamYear}
          onClose={() => setQuotaEditing(null)}
          onSaved={() => {
            setQuotaEditing(null)
            flash('ปรับโควตาแล้ว')
            loadTeamQuotas(teamYear)
          }}
          onError={(text) => flash(text, false)}
        />
      )}
      {docPreview && (
        <DocumentPreview src={docPreview} onClose={() => setDocPreview(null)} />
      )}
    </div>
  )
}

/* ===== HELPER COMPONENTS ===== */

function DocumentPreview({ src, onClose }: { src: string; onClose: () => void }) {
  const isImage = src.startsWith('data:image/')
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 cursor-zoom-out"
    >
      <button
        onClick={(e) => { e.stopPropagation(); onClose() }}
        className="absolute top-4 right-4 text-white/80 hover:text-white"
        aria-label="ปิด"
      >
        <IconX size={28} />
      </button>
      {isImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="หลักฐาน" className="max-w-full max-h-full rounded shadow-lg" onClick={e => e.stopPropagation()} />
      ) : (
        <div onClick={e => e.stopPropagation()} className="bg-white rounded p-4 flex flex-col gap-3 items-center">
          <IconFileText size={48} className="text-gray-400" />
          <p className="text-sm text-gray-600">ไฟล์เอกสาร (PDF)</p>
          <button onClick={() => openInNewTab(src)} className="btn btn-primary text-sm">เปิดดู</button>
        </div>
      )}
    </div>
  )
}

function AdminRecordModal({ types, onClose, onSaved, onError }: {
  types?: LeaveType[]
  onClose: () => void
  onSaved: () => void
  onError: (text: string) => void
}) {
  // HR may not have personal types loaded (rare — HR is also an
  // employee in this app), so fetch the full active list ourselves to
  // be safe. Same with employees — we need the dropdown source.
  const [activeTypes, setActiveTypes] = useState<LeaveType[]>(types || [])
  const [employees, setEmployees] = useState<any[]>([])
  const [employeeId, setEmployeeId] = useState('')
  const [leaveTypeId, setLeaveTypeId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')
  const [hrNotes, setHrNotes] = useState('')
  const [deductQuota, setDeductQuota] = useState(true)
  const [document, setDocument] = useState('')
  const [saving, setSaving] = useState(false)
  const [localErr, setLocalErr] = useState('')

  useEffect(() => {
    (async () => {
      const [tRes, eRes] = await Promise.allSettled([leaveApi.types(), employeeApi.list()])
      if (tRes.status === 'fulfilled') setActiveTypes(tRes.value.data.data || [])
      if (eRes.status === 'fulfilled') {
        const list: any[] = eRes.value.data?.data || []
        // Skip owners — they have no quota and shouldn't have leave logged.
        setEmployees(list.filter((e: any) => e.role !== 'owner' && e.is_active !== false))
      }
    })()
  }, [])

  const days = useMemo(() => countWorkingDays(startDate, endDate), [startDate, endDate])
  const selType = activeTypes.find(t => t.id === leaveTypeId)
  const valid = employeeId && leaveTypeId && startDate && endDate && reason.trim() && days > 0

  const handleDoc = async (file: File) => {
    if (file.size > 8 * 1024 * 1024) { setLocalErr('ไฟล์ใหญ่เกิน 8MB'); return }
    try {
      const url = await fileToBase64(file)
      if (url.length > 700 * 1024) { setLocalErr('ไฟล์ใหญ่เกินไปหลังบีบอัด (~500KB)'); return }
      setDocument(url); setLocalErr('')
    } catch (e: any) { setLocalErr(e.message || 'อ่านไฟล์ไม่ได้') }
  }

  const submit = async () => {
    if (!valid) { setLocalErr('กรุณากรอกข้อมูลให้ครบ'); return }
    setSaving(true); setLocalErr('')
    try {
      await leaveApi.adminRecord({
        employeeId, leaveTypeId, startDate, endDate, reason,
        document: document || undefined,
        deductQuota,
        hrNotes: hrNotes.trim() || undefined,
      })
      onSaved()
    } catch (e: any) {
      const msg = e?.response?.data?.message || 'บันทึกไม่สำเร็จ'
      setLocalErr(msg)
      onError(msg)
    } finally { setSaving(false) }
  }

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-[14px] shadow-xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-black/[0.06] flex items-center justify-between">
          <h3 className="text-base font-semibold flex items-center gap-2">
            <IconClipboardPlus size={16} className="text-[#1D9E75]" />
            บันทึกการลาย้อนหลัง
          </h3>
          <button onClick={onClose}><IconX size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-md px-3 py-2 flex gap-2">
            <IconAlertCircle size={14} className="flex-shrink-0 mt-0.5" />
            <span>การบันทึกย้อนหลังจะ <b>อนุมัติอัตโนมัติ</b> และไม่ผ่านคิวรออนุมัติ — ใช้สำหรับการลาที่เกิดขึ้นจริงแล้ว</span>
          </div>

          <div>
            <label className="label">พนักงาน</label>
            <select className="input" value={employeeId} onChange={e => setEmployeeId(e.target.value)}>
              <option value="">— เลือกพนักงาน —</option>
              {employees.map(e => (
                <option key={e.id} value={e.id}>
                  {e.first_name} {e.last_name}
                  {e.department_name ? ` · ${e.department_name}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="label">ประเภทการลา</label>
              <select className="input" value={leaveTypeId} onChange={e => setLeaveTypeId(e.target.value)}>
                <option value="">— เลือกประเภท —</option>
                {activeTypes.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              {selType?.requires_document && (
                <p className="text-[10px] text-amber-700 mt-1">ประเภทนี้ปกติบังคับให้แนบหลักฐาน (admin-record ไม่บังคับ แต่แนะนำ)</p>
              )}
            </div>
            <div>
              <label className="label">วันเริ่ม</label>
              <input type="date" className="input" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="label">วันสิ้นสุด</label>
              <input type="date" className="input" min={startDate} value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="label">เหตุผล</label>
            <input className="input" placeholder="เช่น ลาป่วยจริง ยังไม่ได้ยื่นในระบบ" value={reason} onChange={e => setReason(e.target.value)} />
          </div>

          <div>
            <label className="label">หมายเหตุ HR (optional)</label>
            <input className="input" placeholder="บันทึกภายใน เห็นเฉพาะ HR/owner" value={hrNotes} onChange={e => setHrNotes(e.target.value)} />
          </div>

          <div>
            <label className="label flex items-center gap-1.5"><IconPaperclip size={13} /> หลักฐาน (ไม่บังคับ)</label>
            <div className="flex items-center gap-2 flex-wrap">
              <label className="btn text-xs cursor-pointer">
                <IconPaperclip size={13} /> เลือกไฟล์
                <input type="file" accept="image/*,application/pdf" className="hidden"
                  onChange={e => e.target.files?.[0] && handleDoc(e.target.files[0])} />
              </label>
              {document && (
                <>
                  {document.startsWith('data:image/') ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={document} alt="หลักฐาน" className="w-12 h-12 rounded object-cover border border-black/[0.08]" />
                  ) : (
                    <span className="text-xs text-gray-600 inline-flex items-center gap-1"><IconFileText size={12} /> PDF</span>
                  )}
                  <button type="button" onClick={() => setDocument('')} className="btn text-xs text-red-500 border-red-200">
                    <IconX size={12} /> เอาออก
                  </button>
                </>
              )}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={deductQuota} onChange={e => setDeductQuota(e.target.checked)} className="accent-[#1D9E75]" />
            <span>หักโควตาวันลา</span>
            {!deductQuota && <span className="text-[11px] text-amber-700">(จะบันทึกการลาแต่ไม่หักวัน)</span>}
          </label>

          {days > 0 && (
            <div className="text-xs text-gray-600 bg-gray-50 border border-black/[0.05] rounded-md px-3 py-2">
              จะบันทึกการลา <b>{days} วันทำงาน</b> {deductQuota ? <span className="text-amber-700">· หักโควตา</span> : <span className="text-gray-500">· ไม่หักโควตา</span>}
            </div>
          )}
          {localErr && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">{localErr}</div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-black/[0.06] flex justify-end gap-2">
          <button onClick={onClose} className="btn text-sm">ยกเลิก</button>
          <button onClick={submit} disabled={!valid || saving} className="btn btn-primary text-sm">
            {saving ? 'กำลังบันทึก…' : 'บันทึกการลา'}
          </button>
        </div>
      </div>
    </div>
  )
}

function QuotaEditModal({ row, year, onClose, onSaved, onError }: {
  row: LeaveQuotaRow
  year: number
  onClose: () => void
  onSaved: () => void
  onError: (text: string) => void
}) {
  const [total, setTotal] = useState<number>(Number(row.total_days) || 0)
  const [saving, setSaving] = useState(false)
  const [localErr, setLocalErr] = useState('')

  const used = Number(row.used_days) || 0
  const min = used // can't go below already-consumed days

  const submit = async () => {
    if (!Number.isFinite(total) || total < 0) { setLocalErr('จำนวนวันต้องเป็นเลขบวก'); return }
    if (total < min) { setLocalErr(`ตั้งได้ขั้นต่ำ ${min} วัน (ใช้ไปแล้ว)`); return }
    setSaving(true); setLocalErr('')
    try {
      await leaveApi.setQuota({
        employeeId: row.employee_id,
        leaveTypeId: row.leave_type_id,
        year,
        totalDays: total,
      })
      onSaved()
    } catch (e: any) {
      const msg = e?.response?.data?.message || 'บันทึกไม่สำเร็จ'
      setLocalErr(msg); onError(msg)
    } finally { setSaving(false) }
  }

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-[14px] shadow-xl w-full max-w-sm">
        <div className="px-5 py-4 border-b border-black/[0.06] flex items-center justify-between">
          <h3 className="text-base font-semibold flex items-center gap-2">
            <IconEdit size={16} className="text-[#1D9E75]" />
            ปรับโควตา
          </h3>
          <button onClick={onClose}><IconX size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          <div className="text-xs text-gray-600">
            <div><b>{row.first_name} {row.last_name}</b></div>
            <div>{row.leave_type_name} · ปี {year + 543}</div>
            <div className="mt-1 text-gray-500">ใช้ไปแล้ว {used} วัน</div>
          </div>
          <div>
            <label className="label">จำนวนวันทั้งหมด</label>
            <input
              type="number" min={min} max={365}
              className="input"
              value={total}
              onChange={e => setTotal(parseInt(e.target.value, 10) || 0)}
            />
            <p className="text-[11px] text-gray-400 mt-1">ขั้นต่ำ {min} วัน (ใช้ไปแล้ว) — เพิ่ม/ลดได้ตามนโยบายบริษัท</p>
          </div>
          {localErr && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">{localErr}</div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-black/[0.06] flex justify-end gap-2">
          <button onClick={onClose} className="btn text-sm">ยกเลิก</button>
          <button onClick={submit} disabled={saving} className="btn btn-primary text-sm">
            {saving ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </div>
      </div>
    </div>
  )
}
