'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { payrollApi, employeeApi, otApi, type PayrollRecord, type PayrollStatus, type OtBreakdownItem } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import {
  IconPlus, IconCheck, IconCash, IconTrash, IconReceipt2,
  IconPrinter, IconFileInvoice, IconX, IconWand, IconBrandLine,
} from '@tabler/icons-react'
import dayjs from 'dayjs'
import clsx from 'clsx'
import EmployeeAvatar from '@/components/employees/EmployeeAvatar'
import { isLiffConfigured, initLiff, shareViaLine } from '@/lib/liff'
import { SkeletonRow } from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'

const MONTHS_TH = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]
const STATUS_BADGE: Record<PayrollStatus, string> = {
  draft: 'badge-gray', approved: 'badge-amber', paid: 'badge-green',
}
const STATUS_TH: Record<PayrollStatus, string> = {
  draft: 'ร่าง', approved: 'อนุมัติแล้ว', paid: 'จ่ายแล้ว',
}

const toNum = (v: any) => Number(v ?? 0)
const fmtMoney = (v: any) =>
  toNum(v).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function PayrollPage() {
  const { user } = useAuthStore()
  const role = user?.role
  const canManage = role === 'hr' || role === 'owner'

  const now = dayjs()
  const [month, setMonth] = useState<number | ''>(now.month() + 1)
  const [year, setYear] = useState<number>(now.year())
  const [statusFilter, setStatusFilter] = useState<PayrollStatus | ''>('')

  const [records, setRecords] = useState<PayrollRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')

  const [showGenerate, setShowGenerate] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  // When HR clicks a slipless row, we want the CreateSlipModal to open
  // with that employee already chosen so they don't have to scroll the
  // employee dropdown. null = open in fresh state (e.g. "+ เพิ่มสลิป" btn).
  const [createPrefillEmpId, setCreatePrefillEmpId] = useState<string | null>(null)
  const [selected, setSelected] = useState<PayrollRecord | null>(null)

  const load = async () => {
    setLoading(true); setErr('')
    try {
      const params: any = { year }
      if (month) params.month = month
      if (statusFilter) params.status = statusFilter
      const r = await payrollApi.list(params)
      setRecords(r.data.data || [])
    } catch (e: any) {
      setErr(e.response?.data?.message || 'โหลดข้อมูลไม่สำเร็จ')
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [month, year, statusFilter])

  // Skip "slipless" rows in totals — they're roster reminders, not real
  // payroll figures. Counting them would inflate the rayการ count and
  // count() would always equal roster size.
  const totals = useMemo(() => {
    const slips = records.filter(r => r.id)
    const acc = { count: slips.length, slipless: records.length - slips.length, gross: 0, deductions: 0, net: 0 }
    for (const r of slips) {
      acc.gross += toNum(r.base_salary) + toNum(r.ot_amount) + toNum(r.bonus) + toNum(r.allowances)
      acc.deductions += toNum(r.social_security) + toNum(r.income_tax) + toNum(r.other_deductions)
      acc.net += toNum(r.net_salary)
    }
    return acc
  }, [records])

  // Track the dismiss timer in a ref so back-to-back flash() calls don't
  // leave an orphan timer that clobbers a later message, and clear it on
  // unmount to avoid the React "setState on unmounted component" warning
  // when the user navigates away mid-flash.
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current) }, [])
  const flash = (msg: string, isError = false) => {
    if (isError) { setErr(msg); setInfo('') } else { setInfo(msg); setErr('') }
    if (flashTimer.current) clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => { setErr(''); setInfo(''); flashTimer.current = null }, 4000)
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#111110]">
            {canManage ? 'เงินเดือน' : 'สลิปเงินเดือน'}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {canManage ? 'จัดการสลิปเงินเดือนรายเดือน' : 'ดูสลิปเงินเดือนย้อนหลัง'}
          </p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <button onClick={() => setShowGenerate(true)} className="btn text-sm">
              <IconWand size={15} /> สร้างสลิปประจำเดือน
            </button>
            <button onClick={() => setShowCreate(true)} className="btn btn-primary text-sm">
              <IconPlus size={15} /> เพิ่มสลิป
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="card mb-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="label">เดือน</label>
            <select
              className="input"
              value={month}
              onChange={e => setMonth(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
            >
              <option value="">ทั้งปี</option>
              {MONTHS_TH.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="label">ปี</label>
            <select
              className="input"
              value={year}
              onChange={e => setYear(parseInt(e.target.value, 10))}
            >
              {Array.from({ length: 5 }).map((_, i) => {
                const y = now.year() - i
                return <option key={y} value={y}>{y + 543}</option>
              })}
            </select>
          </div>
          {canManage && (
            <div>
              <label className="label">สถานะ</label>
              <select
                className="input"
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as PayrollStatus | '')}
              >
                <option value="">ทั้งหมด</option>
                <option value="draft">ร่าง</option>
                <option value="approved">อนุมัติแล้ว</option>
                <option value="paid">จ่ายแล้ว</option>
              </select>
            </div>
          )}
          <div className="flex items-end">
            <div className="text-xs text-gray-500">
              <div>
                รวม {totals.count} รายการ
                {totals.slipless > 0 && (
                  <span className="text-amber-700"> · ยังไม่มีสลิป {totals.slipless} คน</span>
                )}
              </div>
              <div className="text-[#085041] font-medium mt-0.5">สุทธิ ฿{fmtMoney(totals.net)}</div>
            </div>
          </div>
        </div>
      </div>

      {(err || info) && (
        <div className={clsx(
          'mb-4 px-3 py-2 rounded-[10px] text-xs',
          err ? 'bg-[#FCEBEB] text-[#791F1F]' : 'bg-[#E1F5EE] text-[#085041]'
        )}>
          {err || info}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="card p-0 overflow-hidden">
          {/* Mimic the row shape so the layout doesn't jump when data
              arrives — three SkeletonRows is enough to fill above-the-
              fold on most screens. */}
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="px-4 border-b border-black/[0.04] last:border-0">
              <SkeletonRow />
            </div>
          ))}
        </div>
      ) : records.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={IconReceipt2}
            title="ยังไม่มีสลิปในช่วงเวลานี้"
            description={canManage
              ? 'กดปุ่มด้านล่างเพื่อสร้างสลิปประจำเดือนให้พนักงานทุกคน'
              : 'พอ HR สร้างสลิปแล้วจะแสดงที่นี่'}
            action={canManage
              ? <button onClick={() => setShowGenerate(true)} className="btn btn-primary text-sm">
                  <IconWand size={13} /> สร้างสลิปประจำเดือน
                </button>
              : undefined}
          />
        </div>
      ) : canManage ? (
        <PayrollTable
          records={records}
          onPick={(r) => {
            // Slipless rows (id=null) route to the create modal pre-
            // filled with that employee instead of the detail modal —
            // there's no slip to open yet.
            if (!r.id) {
              setCreatePrefillEmpId(r.employee_id)
              setShowCreate(true)
            } else {
              setSelected(r)
            }
          }}
        />
      ) : (
        <PayrollCards records={records} onPick={setSelected} />
      )}

      {/* Modals */}
      {showGenerate && canManage && (
        <BulkGenerateModal
          defaultMonth={typeof month === 'number' ? month : now.month() + 1}
          defaultYear={year}
          onClose={() => setShowGenerate(false)}
          onDone={(msg) => { setShowGenerate(false); flash(msg); load() }}
          onError={(msg) => flash(msg, true)}
        />
      )}
      {showCreate && canManage && (
        <CreateSlipModal
          prefillEmployeeId={createPrefillEmpId}
          defaultMonth={typeof month === 'number' ? month : now.month() + 1}
          defaultYear={year}
          onClose={() => { setShowCreate(false); setCreatePrefillEmpId(null) }}
          onDone={() => {
            setShowCreate(false)
            setCreatePrefillEmpId(null)
            flash('สร้างสลิปแล้ว')
            load()
          }}
          onError={(msg) => flash(msg, true)}
        />
      )}
      {selected && selected.id && (
        // selected.id-truthy guard narrows to a real slip — see RealSlip
        // type on SlipDetailModal. We route slipless rows elsewhere so
        // this branch is the only path into the detail modal.
        <SlipDetailModal
          record={selected as RealSlip}
          canManage={canManage}
          onClose={() => setSelected(null)}
          onChanged={() => { setSelected(null); load() }}
          onError={(msg) => flash(msg, true)}
        />
      )}
    </div>
  )
}

/* ===== HR/Owner Table ===== */
function PayrollTable({ records, onPick }: { records: PayrollRecord[]; onPick: (r: PayrollRecord) => void }) {
  return (
    <div className="card p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="text-left px-4 py-3 font-medium">พนักงาน</th>
              <th className="text-left px-4 py-3 font-medium">เดือน/ปี</th>
              <th className="text-right px-4 py-3 font-medium">เงินเดือน</th>
              <th className="text-right px-4 py-3 font-medium">OT</th>
              <th className="text-right px-4 py-3 font-medium">โบนัส/เบี้ย</th>
              <th className="text-right px-4 py-3 font-medium">หัก</th>
              <th className="text-right px-4 py-3 font-medium">สุทธิ</th>
              <th className="text-center px-4 py-3 font-medium">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => {
              const slipless = !r.id
              const additions = toNum(r.bonus) + toNum(r.allowances)
              const deductions = toNum(r.social_security) + toNum(r.income_tax) + toNum(r.other_deductions)
              return (
                <tr
                  // employee_id is always present (backend aliases e.id);
                  // r.id is null on slipless rows so we fall back to it.
                  key={r.id || `noslip-${r.employee_id}`}
                  onClick={() => onPick(r)}
                  className={clsx(
                    'border-t border-black/[0.04] cursor-pointer',
                    slipless ? 'bg-amber-50/30 hover:bg-amber-50/60' : 'hover:bg-gray-50',
                  )}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <EmployeeAvatar person={r} size={30} />
                      <div className="min-w-0">
                        <div className="font-medium text-[#111110] truncate">
                          {r.first_name} {r.last_name}
                        </div>
                        <div className="text-xs text-gray-500 truncate">{r.position || '—'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                    {r.month != null && r.year != null
                      ? `${MONTHS_TH[r.month - 1]} ${r.year + 543}`
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {slipless ? <span className="text-gray-300">—</span> : fmtMoney(r.base_salary)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-600">
                    {slipless ? <span className="text-gray-300">—</span>
                      : toNum(r.ot_amount) > 0 ? fmtMoney(r.ot_amount) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-600">
                    {slipless ? <span className="text-gray-300">—</span>
                      : additions > 0 ? fmtMoney(additions) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-red-600">
                    {slipless ? <span className="text-gray-300">—</span>
                      : deductions > 0 ? `-${fmtMoney(deductions)}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-[#085041]">
                    {slipless ? <span className="text-gray-300">—</span> : fmtMoney(r.net_salary)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {slipless ? (
                      <span className="badge bg-amber-100 text-amber-800 border border-amber-200">
                        + สร้างสลิป
                      </span>
                    ) : (
                      <span className={clsx('badge', STATUS_BADGE[r.status as PayrollStatus])}>
                        {STATUS_TH[r.status as PayrollStatus]}
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ===== Employee Cards ===== */
function PayrollCards({ records, onPick }: { records: PayrollRecord[]; onPick: (r: PayrollRecord) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {records.filter(r => r.id).map((r) => (
        <button
          key={r.id}
          onClick={() => onPick(r)}
          className="card text-left hover:shadow-md transition-shadow"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs text-gray-500">
              {r.month ? MONTHS_TH[r.month - 1] : '-'} {r.year ? r.year + 543 : ''}
            </div>
            {r.status && (
              <span className={clsx('badge', STATUS_BADGE[r.status])}>
                {STATUS_TH[r.status]}
              </span>
            )}
          </div>
          <div className="text-2xl font-semibold text-[#085041] tabular-nums">
            ฿{fmtMoney(r.net_salary)}
          </div>
          <div className="text-xs text-gray-500 mt-1">เงินเดือนสุทธิ</div>
          <div className="mt-3 pt-3 border-t border-black/[0.05] text-xs text-gray-500 flex justify-between">
            <span>เงินเดือน ฿{fmtMoney(r.base_salary)}</span>
            {toNum(r.ot_amount) > 0 && <span>OT ฿{fmtMoney(r.ot_amount)}</span>}
          </div>
        </button>
      ))}
    </div>
  )
}

/* ===== Bulk Generate Modal ===== */
function BulkGenerateModal({
  defaultMonth, defaultYear, onClose, onDone, onError,
}: {
  defaultMonth: number; defaultYear: number
  onClose: () => void
  onDone: (msg: string) => void
  onError: (msg: string) => void
}) {
  const [m, setM] = useState(defaultMonth)
  const [y, setY] = useState(defaultYear)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    try {
      const res = await payrollApi.bulkGenerate(m, y)
      onDone(res.data.message || 'สร้างสลิปแล้ว')
    } catch (e: any) {
      onError(e.response?.data?.message || 'สร้างสลิปไม่สำเร็จ')
    } finally { setBusy(false) }
  }

  return (
    <ModalShell onClose={onClose} title="สร้างสลิปประจำเดือน">
      <p className="text-xs text-gray-500 mb-4">
        ระบบจะสร้างสลิป <strong>ร่าง</strong> ของพนักงานทุกคน (ยกเว้นเจ้าของ) โดยใช้:
      </p>
      <ul className="text-xs text-gray-600 space-y-1 mb-4 ml-4 list-disc">
        <li>เงินเดือนพื้นฐานจากข้อมูลพนักงานปัจจุบัน</li>
        <li>วันทำงาน / ขาดงาน / มาสายจากการลงเวลา</li>
        <li>ชั่วโมง OT จากคำขอที่อนุมัติแล้ว</li>
        <li>คำนวณ OT × 1.5 และประกันสังคม 5% (สูงสุด 750 บาท) อัตโนมัติ</li>
      </ul>
      <p className="text-xs text-gray-500 mb-4">
        ถ้าพนักงานคนใดมีสลิปของเดือนนี้แล้ว ระบบจะข้ามไป (ไม่ทับ)
      </p>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="label">เดือน</label>
          <select className="input" value={m} onChange={e => setM(parseInt(e.target.value, 10))}>
            {MONTHS_TH.map((mm, i) => <option key={i} value={i + 1}>{mm}</option>)}
          </select>
        </div>
        <div>
          <label className="label">ปี</label>
          <select className="input" value={y} onChange={e => setY(parseInt(e.target.value, 10))}>
            {Array.from({ length: 5 }).map((_, i) => {
              const yr = dayjs().year() - i
              return <option key={yr} value={yr}>{yr + 543}</option>
            })}
          </select>
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onClose} className="btn text-sm">ยกเลิก</button>
        <button onClick={submit} disabled={busy} className="btn btn-primary text-sm">
          {busy ? 'กำลังสร้าง…' : 'สร้างสลิป'}
        </button>
      </div>
    </ModalShell>
  )
}

/* ===== Create Single Slip Modal ===== */
function CreateSlipModal({
  onClose, onDone, onError, prefillEmployeeId, defaultMonth, defaultYear,
}: {
  onClose: () => void
  onDone: () => void
  onError: (msg: string) => void
  prefillEmployeeId?: string | null
  defaultMonth?: number
  defaultYear?: number
}) {
  const now = dayjs()
  const [employees, setEmployees] = useState<any[]>([])
  const [form, setForm] = useState({
    employeeId: prefillEmployeeId || '',
    month: defaultMonth ?? (now.month() + 1),
    year: defaultYear ?? now.year(),
    baseSalary: 0, otAmount: 0, bonus: 0, allowances: 0,
    socialSecurity: 0, incomeTax: 0, otherDeductions: 0,
    workDays: 0, absentDays: 0, lateCount: 0, otHours: 0,
    notes: '',
  })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    employeeApi.list().then(r => {
      const list = r.data.data || []
      setEmployees(list)
      // If the parent pre-selected an employee (e.g. clicked a slipless
      // row in the table), populate base_salary from their profile now
      // that the list is loaded — same behavior as if the user picked
      // them from the dropdown.
      if (prefillEmployeeId) {
        const emp = list.find((x: any) => x.id === prefillEmployeeId)
        if (emp) {
          setForm(p => ({
            ...p,
            employeeId: prefillEmployeeId,
            baseSalary: toNum(emp.base_salary),
          }))
        }
      }
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onEmployeeChange = (id: string) => {
    const emp = employees.find(e => e.id === id)
    setForm(p => ({
      ...p,
      employeeId: id,
      baseSalary: toNum(emp?.base_salary),
    }))
  }

  const submit = async () => {
    if (!form.employeeId || !form.baseSalary) {
      onError('กรุณาเลือกพนักงานและระบุเงินเดือนพื้นฐาน'); return
    }
    setBusy(true)
    try {
      await payrollApi.create(form)
      onDone()
    } catch (e: any) {
      onError(e.response?.data?.message || 'สร้างสลิปไม่สำเร็จ')
    } finally { setBusy(false) }
  }

  return (
    <ModalShell onClose={onClose} title="เพิ่มสลิปเงินเดือน" wide>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <div className="sm:col-span-2">
          <label className="label">พนักงาน</label>
          <select className="input" value={form.employeeId} onChange={e => onEmployeeChange(e.target.value)}>
            <option value="">เลือกพนักงาน</option>
            {employees.map(e => (
              <option key={e.id} value={e.id}>
                {e.first_name} {e.last_name} {e.nickname ? `(${e.nickname})` : ''}
              </option>
            ))}
          </select>
        </div>
        <NumField label="เดือน" value={form.month} onChange={v => setForm(p => ({ ...p, month: v }))} />
        <NumField label="ปี (ค.ศ.)" value={form.year} onChange={v => setForm(p => ({ ...p, year: v }))} />
      </div>

      <SlipAmountsForm
        form={form}
        setForm={setForm}
        otContext={form.employeeId ? { employeeId: form.employeeId, month: form.month, year: form.year } : undefined}
      />

      <div className="mt-4">
        <label className="label">หมายเหตุ</label>
        <textarea
          className="input min-h-[60px]"
          value={form.notes}
          onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
        />
      </div>

      <NetPreview form={form} />

      <div className="flex gap-2 justify-end mt-4">
        <button onClick={onClose} className="btn text-sm">ยกเลิก</button>
        <button onClick={submit} disabled={busy} className="btn btn-primary text-sm">
          {busy ? 'กำลังบันทึก…' : 'บันทึกสลิป'}
        </button>
      </div>
    </ModalShell>
  )
}

/* ===== Slip Detail / Edit Modal ===== */
// This modal is only ever opened for rows that have a real slip (the
// parent routes slipless roster rows to CreateSlipModal instead), so we
// narrow PayrollRecord to guarantee id/month/year/status are present.
type RealSlip = PayrollRecord & { id: string; month: number; year: number; status: PayrollStatus }
function SlipDetailModal({
  record, canManage, onClose, onChanged, onError,
}: {
  record: RealSlip
  canManage: boolean
  onClose: () => void
  onChanged: () => void
  onError: (msg: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    baseSalary: toNum(record.base_salary),
    otAmount: toNum(record.ot_amount),
    bonus: toNum(record.bonus),
    allowances: toNum(record.allowances),
    socialSecurity: toNum(record.social_security),
    incomeTax: toNum(record.income_tax),
    otherDeductions: toNum(record.other_deductions),
    workDays: record.work_days ?? 0,
    absentDays: record.absent_days ?? 0,
    lateCount: record.late_count ?? 0,
    otHours: toNum(record.ot_hours),
    notes: record.notes || '',
  })

  // Pull the per-request OT breakdown lazily — the list endpoint
  // doesn't include it (it's a separate join, only worth running when
  // someone is actually looking at the slip). null = still loading,
  // [] = no breakdown rows (slip has 0 OT or generated before OT
  // requests existed).
  const [otBreakdown, setOtBreakdown] = useState<OtBreakdownItem[] | null>(null)
  useEffect(() => {
    let alive = true
    payrollApi.getOne(record.id)
      .then(r => { if (alive) setOtBreakdown(r.data.data?.ot_breakdown || []) })
      .catch(() => { if (alive) setOtBreakdown([]) })
    return () => { alive = false }
  }, [record.id])

  const save = async () => {
    setBusy(true)
    try {
      await payrollApi.update(record.id, form)
      onChanged()
    } catch (e: any) {
      onError(e.response?.data?.message || 'บันทึกไม่สำเร็จ')
    } finally { setBusy(false) }
  }

  const action = async (fn: () => Promise<any>, successMsg: string) => {
    setBusy(true)
    try { await fn(); onChanged() } catch (e: any) {
      onError(e.response?.data?.message || successMsg + 'ไม่สำเร็จ')
    } finally { setBusy(false) }
  }

  const isPaid = record.status === 'paid'
  const isDraft = record.status === 'draft'
  const isApproved = record.status === 'approved'

  // LIFF share — the button only renders when NEXT_PUBLIC_LIFF_ID is
  // set AND the SDK was able to init. Outside LIFF, shareViaLine still
  // works (opens LINE in a browser flow) so we keep the button visible
  // as long as the SDK initialized at all.
  const [liffReady, setLiffReady] = useState(false)
  const [sharing, setSharing] = useState(false)
  useEffect(() => {
    if (!isLiffConfigured()) return
    initLiff().then(({ ready }) => setLiffReady(ready))
  }, [])

  const handleShareLine = async () => {
    setSharing(true)
    try {
      // Plain-text payslip — formatted so it reads cleanly inside a
      // LINE chat bubble. We intentionally only include the high-level
      // numbers (no employee ID, no tax-id), so it's safe even if the
      // recipient is a spouse / accountant.
      const lines: string[] = []
      lines.push(`🧾 สลิปเงินเดือน`)
      lines.push(`${record.first_name || ''} ${record.last_name || ''}`.trim())
      lines.push(`${MONTHS_TH[record.month - 1]} ${record.year + 543}`)
      lines.push('')
      lines.push(`เงินเดือน: ${'฿' + fmtMoney(record.base_salary)}`)
      if (toNum(record.ot_amount) > 0)   lines.push(`OT: ${'฿' + fmtMoney(record.ot_amount)}`)
      if (toNum(record.bonus) > 0)       lines.push(`โบนัส: ${'฿' + fmtMoney(record.bonus)}`)
      if (toNum(record.allowances) > 0)  lines.push(`สวัสดิการ: ${'฿' + fmtMoney(record.allowances)}`)
      if (toNum(record.social_security) > 0) lines.push(`หักประกันสังคม: -${'฿' + fmtMoney(record.social_security)}`)
      if (toNum(record.income_tax) > 0)      lines.push(`หักภาษี: -${'฿' + fmtMoney(record.income_tax)}`)
      if (toNum(record.other_deductions) > 0) lines.push(`หักอื่นๆ: -${'฿' + fmtMoney(record.other_deductions)}`)
      lines.push('')
      lines.push(`รับสุทธิ: ${'฿' + fmtMoney(record.net_salary)}`)
      const res = await shareViaLine(lines.join('\n'))
      if (res.ok) {
        onError('')  // clear any previous error
      } else if (res.code === 'unavailable') {
        onError('แชร์ผ่าน LINE ไม่ได้ในเบราว์เซอร์นี้ — เปิดผ่าน LINE OA แทน')
      } else if (res.code === 'cancelled') {
        // user dismissed — silent
      } else {
        onError('แชร์ไม่สำเร็จ')
      }
    } finally { setSharing(false) }
  }

  return (
    <ModalShell onClose={onClose} title="" wide>
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b border-black/[0.06]">
        <EmployeeAvatar person={record} size={48} />
        <div className="flex-1 min-w-0">
          <div className="text-base font-semibold text-[#111110]">
            {record.first_name} {record.last_name}
          </div>
          <div className="text-xs text-gray-500">
            {record.position || '—'} · {record.department_name || '—'}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500">{MONTHS_TH[record.month - 1]} {record.year + 543}</div>
          <span className={clsx('badge mt-1', STATUS_BADGE[record.status])}>
            {STATUS_TH[record.status]}
          </span>
        </div>
      </div>

      {/* Body */}
      {editing && canManage ? (
        <div className="py-4">
          <SlipAmountsForm
            form={form}
            setForm={setForm}
            otContext={{ employeeId: record.employee_id, month: record.month, year: record.year }}
          />
          <div className="mt-4">
            <label className="label">หมายเหตุ</label>
            <textarea
              className="input min-h-[60px]"
              value={form.notes}
              onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
            />
          </div>
          <NetPreview form={form} />
        </div>
      ) : (
        <SlipReadOnly record={record} otBreakdown={otBreakdown} />
      )}

      {/* Footer actions */}
      <div className="flex flex-wrap gap-2 justify-end pt-4 border-t border-black/[0.06] mt-2">
        {!canManage ? (
          <>
            {liffReady && isPaid && (
              <button onClick={handleShareLine} disabled={sharing} className="btn text-sm" style={{ borderColor: '#06C755', color: '#06C755' }}>
                <IconBrandLine size={14} /> {sharing ? 'กำลังเปิด…' : 'แชร์ผ่าน LINE'}
              </button>
            )}
            <button onClick={() => window.print()} className="btn text-sm">
              <IconPrinter size={14} /> พิมพ์
            </button>
          </>
        ) : editing ? (
          <>
            <button onClick={() => setEditing(false)} className="btn text-sm">ยกเลิก</button>
            <button onClick={save} disabled={busy || isPaid} className="btn btn-primary text-sm">
              {busy ? 'กำลังบันทึก…' : 'บันทึก'}
            </button>
          </>
        ) : (
          <>
            {isDraft && (
              <button
                onClick={() => action(() => payrollApi.delete(record.id), 'ลบ')}
                disabled={busy}
                className="btn text-sm text-red-500 border-red-200 hover:bg-red-50"
              >
                <IconTrash size={14} /> ลบ
              </button>
            )}
            {liffReady && isPaid && (
              <button onClick={handleShareLine} disabled={sharing} className="btn text-sm" style={{ borderColor: '#06C755', color: '#06C755' }}>
                <IconBrandLine size={14} /> {sharing ? 'กำลังเปิด…' : 'แชร์ผ่าน LINE'}
              </button>
            )}
            <button onClick={() => window.print()} className="btn text-sm">
              <IconPrinter size={14} /> พิมพ์
            </button>
            {!isPaid && (
              <button onClick={() => setEditing(true)} className="btn text-sm">
                <IconFileInvoice size={14} /> แก้ไข
              </button>
            )}
            {isDraft && (
              <button
                onClick={() => action(() => payrollApi.approve(record.id), 'อนุมัติ')}
                disabled={busy}
                className="btn btn-primary text-sm"
              >
                <IconCheck size={14} /> อนุมัติ
              </button>
            )}
            {isApproved && (
              <button
                onClick={() => action(() => payrollApi.markPaid(record.id), 'ทำเครื่องหมายจ่ายแล้ว')}
                disabled={busy}
                className="btn btn-primary text-sm"
              >
                <IconCash size={14} /> จ่ายแล้ว
              </button>
            )}
            {isPaid && (
              <button
                onClick={() => action(() => payrollApi.update(record.id, { status: 'approved' }), 'ย้อนสถานะ')}
                disabled={busy}
                className="btn text-sm"
              >
                ย้อนกลับเป็น "อนุมัติแล้ว"
              </button>
            )}
          </>
        )}
      </div>
    </ModalShell>
  )
}

function SlipReadOnly({ record, otBreakdown }: { record: PayrollRecord; otBreakdown?: OtBreakdownItem[] | null }) {
  const additions = toNum(record.base_salary) + toNum(record.ot_amount) + toNum(record.bonus) + toNum(record.allowances)
  const deductions = toNum(record.social_security) + toNum(record.income_tax) + toNum(record.other_deductions)
  return (
    <div className="py-4 grid grid-cols-1 md:grid-cols-2 gap-5">
      <div>
        <h3 className="text-xs font-semibold text-gray-500 mb-2">รายรับ</h3>
        <Row label="เงินเดือนพื้นฐาน" value={record.base_salary} />
        <Row label="ค่าล่วงเวลา (OT)" value={record.ot_amount} sub={`${toNum(record.ot_hours)} ชม.`} />
        <OtBreakdownPanel breakdown={otBreakdown} totalHours={toNum(record.ot_hours)} totalAmount={toNum(record.ot_amount)} />
        <Row label="โบนัส" value={record.bonus} />
        <Row label="เบี้ยเลี้ยง/อื่นๆ" value={record.allowances} />
        <Row label="รวมรายรับ" value={additions} bold />
      </div>
      <div>
        <h3 className="text-xs font-semibold text-gray-500 mb-2">รายการหัก</h3>
        <Row label="ประกันสังคม" value={record.social_security} negative />
        <Row label="ภาษี" value={record.income_tax} negative />
        <Row label="หักอื่นๆ" value={record.other_deductions} negative />
        <Row label="รวมรายการหัก" value={deductions} bold negative />

        <h3 className="text-xs font-semibold text-gray-500 mb-2 mt-4">สถิติ</h3>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-gray-50 rounded p-2">
            <div className="text-gray-500">วันทำงาน</div>
            <div className="font-medium">{record.work_days ?? '—'} วัน</div>
          </div>
          <div className="bg-gray-50 rounded p-2">
            <div className="text-gray-500">ขาดงาน</div>
            <div className="font-medium">{record.absent_days} วัน</div>
          </div>
          <div className="bg-gray-50 rounded p-2">
            <div className="text-gray-500">มาสาย</div>
            <div className="font-medium">{record.late_count} ครั้ง</div>
          </div>
          <div className="bg-gray-50 rounded p-2">
            <div className="text-gray-500">OT</div>
            <div className="font-medium">{toNum(record.ot_hours)} ชม.</div>
          </div>
        </div>
      </div>

      <div className="md:col-span-2 mt-2 p-4 rounded-[10px] bg-[#E1F5EE] flex items-center justify-between">
        <div className="text-sm text-[#085041]">เงินเดือนสุทธิ</div>
        <div className="text-2xl font-bold text-[#085041] tabular-nums">฿{fmtMoney(record.net_salary)}</div>
      </div>

      {record.notes && (
        <div className="md:col-span-2">
          <div className="text-xs text-gray-500 mb-1">หมายเหตุ</div>
          <div className="text-sm text-gray-700 whitespace-pre-wrap">{record.notes}</div>
        </div>
      )}

      {record.paid_at && (
        <div className="md:col-span-2 text-xs text-gray-500">
          จ่ายเมื่อ {dayjs(record.paid_at).format('D MMM BBBB HH:mm')}
        </div>
      )}
    </div>
  )
}

function Row({ label, value, sub, bold, negative }: { label: string; value: any; sub?: string; bold?: boolean; negative?: boolean }) {
  return (
    <div className={clsx('flex justify-between py-1.5 text-sm', bold && 'border-t border-black/[0.06] pt-2 font-semibold')}>
      <div>
        <span className="text-gray-700">{label}</span>
        {sub && <span className="text-xs text-gray-400 ml-1">({sub})</span>}
      </div>
      <span className={clsx('tabular-nums', negative ? 'text-red-600' : 'text-[#111110]')}>
        {negative && toNum(value) > 0 ? '-' : ''}{fmtMoney(value)}
      </span>
    </div>
  )
}

/* ===== OT Breakdown Panel =====
 * Renders the per-request trace of approved OT under the "ค่าล่วงเวลา"
 * row in SlipReadOnly. Three rendering states:
 *   - breakdown === null → still loading (skeleton text)
 *   - breakdown.length === 0 → no approved OT (panel hidden entirely)
 *   - otherwise → expandable list
 *
 * Sum-mismatch warning: if the rows don't sum to record.ot_hours (e.g.
 * HR manually edited the slip's ot_hours after generation), we show a
 * small amber note so the discrepancy is visible — otherwise the trace
 * would look like a lie.
 */
function OtBreakdownPanel({
  breakdown, totalHours, totalAmount,
}: {
  breakdown?: OtBreakdownItem[] | null
  totalHours: number
  totalAmount: number
}) {
  const [expanded, setExpanded] = useState(false)

  if (breakdown === null || breakdown === undefined) {
    return (
      <div className="ml-3 mb-1 text-[11px] text-gray-400 italic">
        กำลังโหลดรายละเอียด OT…
      </div>
    )
  }
  if (breakdown.length === 0) {
    // No approved OT requests for this month — skip the panel entirely
    // so the slip stays compact. The "0.00" already shows on the Row.
    return null
  }

  const sumHours = breakdown.reduce((acc, b) => acc + toNum(b.hours), 0)
  const hoursMismatch = Math.abs(sumHours - totalHours) > 0.01
  // The slip stores ot_amount as a separate (editable) figure; we derive
  // a per-request amount on the fly by prorating totalAmount across
  // hours so the column sums to the slip total even when rates differ.
  const perHourAmount = sumHours > 0 ? totalAmount / sumHours : 0

  return (
    <div className="ml-3 mb-2">
      <button
        onClick={() => setExpanded(v => !v)}
        className="text-[11px] text-[#1D9E75] hover:underline flex items-center gap-1"
      >
        {expanded ? '▾ ซ่อน' : '▸ ดู'}รายการ OT {breakdown.length} ครั้ง
        {hoursMismatch && (
          <span className="text-amber-700 ml-1" title="ชั่วโมง OT ในสลิปถูกแก้ไขด้วยมือ ไม่ตรงกับยอดรวมคำขอ">
            ⚠ ไม่ตรงกับสลิป
          </span>
        )}
      </button>

      {expanded && (
        <div className="mt-1.5 bg-gray-50 rounded-[8px] border border-black/[0.05] divide-y divide-black/[0.05] text-[11px]">
          {breakdown.map(b => {
            const hrs = toNum(b.hours)
            const amt = hrs * perHourAmount
            return (
              <div key={b.id} className="px-2.5 py-1.5 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-700 tabular-nums">
                    {dayjs(b.date).format('D MMM')}
                    <span className="text-gray-400 font-normal ml-1.5">
                      {String(b.start_time || '').slice(0,5)}–{String(b.end_time || '').slice(0,5)}
                    </span>
                  </div>
                  {b.reason && (
                    <div className="text-gray-500 truncate" title={b.reason}>
                      {b.reason}
                    </div>
                  )}
                </div>
                <div className="text-right tabular-nums flex-shrink-0">
                  <div className="text-gray-700">{hrs.toFixed(2)} ชม.</div>
                  <div className="text-gray-400 text-[10px]">฿{fmtMoney(amt)}</div>
                </div>
              </div>
            )
          })}
          <div className="px-2.5 py-1.5 flex justify-between font-semibold text-gray-700 bg-white">
            <span>รวม</span>
            <span className="tabular-nums">{sumHours.toFixed(2)} ชม.</span>
          </div>
        </div>
      )}
    </div>
  )
}

/* ===== Shared amount form ===== */
function SlipAmountsForm({
  form, setForm, otContext,
}: {
  form: any
  setForm: (fn: (p: any) => any) => void
  // When set, surface the "↻ ดึงจากคำขอ OT" button so HR can pull
  // approved OT for this (employee, month, year) directly into the
  // otHours + otAmount fields. Not set for the BulkGenerateModal flow
  // since bulk-generate computes those columns on the server already.
  otContext?: { employeeId: string; month: number; year: number }
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <h3 className="text-xs font-semibold text-gray-500 mb-2">รายรับ</h3>
        <NumField label="เงินเดือนพื้นฐาน" value={form.baseSalary} onChange={v => setForm((p: any) => ({ ...p, baseSalary: v }))} money />
        <div className="relative">
          <NumField label="ค่าล่วงเวลา (OT)" value={form.otAmount} onChange={v => setForm((p: any) => ({ ...p, otAmount: v }))} money />
          {otContext && (
            <OtPullButton
              employeeId={otContext.employeeId}
              month={otContext.month}
              year={otContext.year}
              baseSalary={toNum(form.baseSalary)}
              onApply={({ hours, amount }) => {
                setForm((p: any) => ({ ...p, otHours: hours, otAmount: amount }))
              }}
            />
          )}
        </div>
        <NumField label="โบนัส" value={form.bonus} onChange={v => setForm((p: any) => ({ ...p, bonus: v }))} money />
        <NumField label="เบี้ยเลี้ยง/อื่นๆ" value={form.allowances} onChange={v => setForm((p: any) => ({ ...p, allowances: v }))} money />
      </div>
      <div>
        <h3 className="text-xs font-semibold text-gray-500 mb-2">รายการหัก</h3>
        <NumField label="ประกันสังคม" value={form.socialSecurity} onChange={v => setForm((p: any) => ({ ...p, socialSecurity: v }))} money />
        <NumField label="ภาษี" value={form.incomeTax} onChange={v => setForm((p: any) => ({ ...p, incomeTax: v }))} money />
        <NumField label="หักอื่นๆ" value={form.otherDeductions} onChange={v => setForm((p: any) => ({ ...p, otherDeductions: v }))} money />
      </div>
      <div className="sm:col-span-2">
        <h3 className="text-xs font-semibold text-gray-500 mb-2">สถิติเดือนนี้</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <NumField label="วันทำงาน" value={form.workDays} onChange={v => setForm((p: any) => ({ ...p, workDays: v }))} />
          <NumField label="ขาดงาน" value={form.absentDays} onChange={v => setForm((p: any) => ({ ...p, absentDays: v }))} />
          <NumField label="มาสาย (ครั้ง)" value={form.lateCount} onChange={v => setForm((p: any) => ({ ...p, lateCount: v }))} />
          <NumField label="OT (ชม.)" value={form.otHours} onChange={v => setForm((p: any) => ({ ...p, otHours: v }))} />
        </div>
      </div>
    </div>
  )
}

/* ===== OT Pull Button =====
 * Sits under the "ค่าล่วงเวลา (OT)" field. Fetches all hr_approved OT
 * requests for the (employee, month, year) and writes the rolled-up
 * hours + computed amount back into the slip form. Computation mirrors
 * the bulk-generate SQL: hours × 1.5 × (baseSalary / 240).
 *
 * Three states are surfaced so HR understands what just happened:
 *   - idle:    "↻ ดึงจากคำขอ OT" link
 *   - loading: "กำลังดึง…"
 *   - done:    "✓ ดึง N ครั้ง (xx.x ชม.)" — sticks around as a hint
 *
 * baseSalary=0 → the amount becomes 0 too, which is confusing. We
 * surface a small warning in that case so HR knows to fill base salary
 * first before pulling OT.
 */
function OtPullButton({
  employeeId, month, year, baseSalary, onApply,
}: {
  employeeId: string
  month: number
  year: number
  baseSalary: number
  onApply: (v: { hours: number; amount: number; count: number }) => void
}) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ hours: number; count: number } | null>(null)
  const [err, setErr] = useState('')

  const pull = async () => {
    setBusy(true); setErr('')
    try {
      const r = await otApi.approvedSummary(employeeId, month, year)
      const hours = Number(r.data.data?.hours || 0)
      const count = (r.data.data?.items || []).length
      // Bulk-generate formula: hours × 1.5 × (baseSalary / 240). Keep
      // identical to back-end logic so manual pull and "สร้างสลิป
      // ประจำเดือน" produce the same OT amount for the same inputs.
      const amount = baseSalary > 0
        ? +(hours * 1.5 * (baseSalary / 240)).toFixed(2)
        : 0
      onApply({ hours, amount, count })
      setResult({ hours, count })
    } catch (e: any) {
      setErr(e.response?.data?.message || 'ดึงไม่สำเร็จ')
    } finally { setBusy(false) }
  }

  return (
    <div className="-mt-1.5 mb-2 ml-1 text-[11px]">
      <button type="button" onClick={pull} disabled={busy || !employeeId} className="text-[#1D9E75] hover:underline disabled:text-gray-400 disabled:no-underline">
        {busy ? 'กำลังดึง…' : '↻ ดึงจากคำขอ OT ที่อนุมัติแล้ว'}
      </button>
      {result && !busy && (
        <span className="text-gray-500 ml-2">
          ดึง {result.count} ครั้ง = {result.hours.toFixed(2)} ชม.
          {baseSalary <= 0 && (
            <span className="text-amber-700 ml-1">⚠ กรอกเงินเดือนก่อน เพื่อคำนวณค่า OT</span>
          )}
        </span>
      )}
      {err && <span className="text-red-600 ml-2">{err}</span>}
    </div>
  )
}

function NumField({ label, value, onChange, money }: { label: string; value: number; onChange: (v: number) => void; money?: boolean }) {
  return (
    <div className="mb-2">
      <label className="label">{label}</label>
      <div className="relative">
        {money && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">฿</span>}
        <input
          type="number"
          step={money ? '0.01' : '1'}
          className={clsx('input tabular-nums', money && 'pl-7')}
          value={value}
          onChange={e => onChange(Number(e.target.value || 0))}
        />
      </div>
    </div>
  )
}

function NetPreview({ form }: { form: any }) {
  const net = toNum(form.baseSalary) + toNum(form.otAmount) + toNum(form.bonus) + toNum(form.allowances)
    - toNum(form.socialSecurity) - toNum(form.incomeTax) - toNum(form.otherDeductions)
  return (
    <div className="mt-4 p-3 rounded-[10px] bg-[#E1F5EE] flex items-center justify-between">
      <div className="text-xs text-[#085041]">เงินเดือนสุทธิ (คำนวณอัตโนมัติ)</div>
      <div className="text-lg font-bold text-[#085041] tabular-nums">฿{fmtMoney(net)}</div>
    </div>
  )
}

/* ===== Modal shell ===== */
function ModalShell({ onClose, title, children, wide }: { onClose: () => void; title: string; children: any; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className={clsx(
          'bg-white rounded-[14px] shadow-xl w-full max-h-[92vh] overflow-y-auto',
          wide ? 'max-w-3xl' : 'max-w-md'
        )}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-black/[0.06]">
          <h2 className="text-base font-semibold text-[#111110]">{title || ' '}</h2>
          <button onClick={onClose} className="btn btn-ghost p-1.5">
            <IconX size={16} />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}
