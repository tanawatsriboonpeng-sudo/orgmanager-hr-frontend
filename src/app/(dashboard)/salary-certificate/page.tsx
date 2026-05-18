'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'
import 'dayjs/locale/th'
import { IconPrinter, IconCertificate, IconArrowLeft } from '@tabler/icons-react'
import { useAuthStore } from '@/lib/store'
import { employeeApi, orgApi, type OrgSettings } from '@/lib/api'
import { bahtToThai } from '@/lib/thaiNumbers'

// Thai month names (locale 'th' formats Buddhist year by default which
// we want, but we keep an explicit month array for the centred letter
// date so we don't accidentally pick up a "พ.ค." abbreviation form).
const TH_MONTHS = [
  'มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
  'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม',
]

function thaiLongDate(iso: string): string {
  if (!iso) return '—'
  const d = dayjs(iso)
  if (!d.isValid()) return '—'
  return `${d.date()} ${TH_MONTHS[d.month()]} ${d.year() + 543}`
}

type Title = 'นาย' | 'นาง' | 'นางสาว'

/**
 * Salary Certification Letter (หนังสือรับรองเงินเดือน).
 *
 * HR/owner-only page. Two columns when not printing:
 *   - Left: editable form (employee, title, start date, salary, purpose,
 *     issue date)
 *   - Right: live A4-shaped preview that mirrors what comes out of the
 *     printer
 *
 * Print path: window.print(). Tailwind `print:hidden` strips the form
 * and chrome away; only the preview survives the print stylesheet.
 * The HR person printing signs as themselves — name + position pulled
 * from the auth store, with sensible fallbacks ("ผู้จัดการฝ่ายบุคคล").
 */
export default function SalaryCertificatePage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const role = user?.role
  const canManage = role === 'hr' || role === 'owner'

  // Bounce non-HR/owner to dashboard — this endpoint is HR-only because
  // the issuer signs the letter as themselves.
  useEffect(() => {
    if (user && !canManage) router.replace('/dashboard')
  }, [user, canManage, router])

  const [employees, setEmployees] = useState<any[]>([])
  const [org, setOrg] = useState<OrgSettings | null>(null)
  const [empId, setEmpId] = useState('')
  const [title, setTitle] = useState<Title>('นาย')
  const [purpose, setPurpose] = useState('')
  const [issueDate, setIssueDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [startDate, setStartDate] = useState('')
  const [salary, setSalary] = useState<number>(0)
  // Signer block — both name and position are overridable. Default to
  // the logged-in HR user's name + "ผู้จัดการฝ่ายบุคคล", but lots of
  // real cases need a different signer (the letter is being prepared
  // for the owner to sign, the HR person has a longer formal name on
  // their ID card, etc.). `signerNameTouched` prevents the
  // auth-store-derived default from clobbering a manual edit on the
  // first /auth/me refresh.
  const [signerName, setSignerName] = useState('')
  const [signerNameTouched, setSignerNameTouched] = useState(false)
  const [signerPosition, setSignerPosition] = useState('ผู้จัดการฝ่ายบุคคล')

  useEffect(() => {
    employeeApi.list().then(r => setEmployees(r.data.data || [])).catch(() => {})
    orgApi.get().then(r => setOrg(r.data.data || null)).catch(() => {})
  }, [])

  // When the employee changes, refresh the auto-fillable fields. HR can
  // still override afterwards (e.g. if the system has the wrong start
  // date for an older hire).
  useEffect(() => {
    const emp = employees.find(e => e.id === empId)
    if (!emp) return
    setStartDate(emp.hire_date || emp.start_date || '')
    setSalary(Number(emp.base_salary || 0))
    if (emp.gender === 'female') setTitle('นางสาว')
    else if (emp.gender === 'male') setTitle('นาย')
  }, [empId, employees])

  const emp = useMemo(() => employees.find(e => e.id === empId), [employees, empId])
  const fullName = emp ? `${emp.first_name || ''} ${emp.last_name || ''}`.trim() : ''
  const position = emp?.position || '—'
  const salaryWords = useMemo(() => bahtToThai(salary), [salary])
  const issueThai = useMemo(() => thaiLongDate(issueDate), [issueDate])
  const startThai = useMemo(() => thaiLongDate(startDate), [startDate])

  // Seed the signer-name field from the logged-in user when the auth
  // store first resolves. The store has both camelCase and snake_case
  // keys depending on which path populated it (login vs /auth/me), so
  // we coalesce. We only seed if HR hasn't typed anything yet —
  // otherwise a later /auth/me refresh could wipe their edit.
  useEffect(() => {
    if (signerNameTouched) return
    const f = (user as any)?.firstName || (user as any)?.first_name || ''
    const l = (user as any)?.lastName  || (user as any)?.last_name  || ''
    const full = `${f} ${l}`.trim()
    if (full) setSignerName(full)
  }, [user, signerNameTouched])

  const canPrint = empId && purpose.trim()

  if (!user) {
    return <div className="p-6 text-sm text-gray-500">กำลังโหลด…</div>
  }
  if (!canManage) {
    return <div className="p-6 text-sm text-gray-500">เฉพาะ HR / เจ้าของเท่านั้น</div>
  }

  return (
    <div className="p-6 max-w-6xl mx-auto print:p-0 print:max-w-none">
      {/* Header — hidden on print */}
      <div className="print:hidden flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <button
            onClick={() => router.back()}
            className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-1"
          >
            <IconArrowLeft size={12} /> กลับ
          </button>
          <h1 className="text-xl font-semibold text-[#111110] flex items-center gap-2">
            <IconCertificate size={20} /> หนังสือรับรองเงินเดือน
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            ออกหนังสือรับรองเงินเดือนให้พนักงาน · กรอกข้อมูลแล้วกดพิมพ์
          </p>
        </div>
        <button
          onClick={() => window.print()}
          disabled={!canPrint}
          className="btn btn-primary text-sm disabled:opacity-50"
        >
          <IconPrinter size={15} /> พิมพ์
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6 print:grid-cols-1 print:gap-0">
        {/* Form column — hidden on print */}
        <div className="print:hidden">
          <div className="card space-y-3">
            <div>
              <label className="label">พนักงาน</label>
              <select
                className="input"
                value={empId}
                onChange={e => setEmpId(e.target.value)}
              >
                <option value="">เลือกพนักงาน</option>
                {employees.map(e => (
                  <option key={e.id} value={e.id}>
                    {e.first_name} {e.last_name}
                    {e.nickname ? ` (${e.nickname})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">คำนำหน้า</label>
              <div className="flex gap-1">
                {(['นาย', 'นาง', 'นางสาว'] as Title[]).map(t => (
                  <button
                    key={t}
                    onClick={() => setTitle(t)}
                    className={
                      'flex-1 py-1.5 text-xs rounded-[8px] border transition-colors ' +
                      (title === t
                        ? 'border-[#1D9E75] bg-[#E1F5EE] text-[#085041] font-medium'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50')
                    }
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="label">วันที่เริ่มงาน</label>
              <input
                type="date"
                className="input"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
              />
            </div>

            <div>
              <label className="label">เงินเดือนปัจจุบัน (บาท)</label>
              <input
                type="number"
                className="input tabular-nums"
                value={salary}
                onChange={e => setSalary(Number(e.target.value || 0))}
                step="0.01"
              />
              <div className="text-[11px] text-gray-400 mt-1 leading-snug">
                {salary > 0 ? `(${salaryWords})` : 'กรอกเงินเดือน — ระบบจะแปลงเป็นตัวอักษรอัตโนมัติ'}
              </div>
            </div>

            <div>
              <label className="label">วัตถุประสงค์</label>
              <textarea
                className="input min-h-[64px]"
                value={purpose}
                onChange={e => setPurpose(e.target.value)}
                placeholder="ตัวอย่าง: ใช้ประกอบการยื่นขอสินเชื่อกับธนาคาร"
              />
            </div>

            <div>
              <label className="label">วันที่ออกหนังสือ</label>
              <input
                type="date"
                className="input"
                value={issueDate}
                onChange={e => setIssueDate(e.target.value)}
              />
            </div>

            <div className="pt-3 border-t border-black/[0.06] space-y-3">
              <div>
                <label className="label">ชื่อผู้ลงนาม</label>
                <input
                  className="input"
                  value={signerName}
                  onChange={e => { setSignerName(e.target.value); setSignerNameTouched(true) }}
                  placeholder="ชื่อ-นามสกุล"
                />
                <div className="text-[11px] text-gray-400 mt-1">
                  เริ่มต้นเป็นชื่อของคุณ แก้ไขได้หากผู้ลงนามเป็นคนอื่น
                </div>
              </div>
              <div>
                <label className="label">ตำแหน่งผู้ลงนาม</label>
                <input
                  className="input"
                  value={signerPosition}
                  onChange={e => setSignerPosition(e.target.value)}
                />
              </div>
            </div>

            {!canPrint && (
              <div className="text-[11px] text-amber-700 bg-amber-50 rounded-[8px] px-2 py-1.5">
                {!empId
                  ? 'กรุณาเลือกพนักงาน'
                  : 'กรุณาระบุวัตถุประสงค์ก่อนพิมพ์'}
              </div>
            )}
          </div>
        </div>

        {/* Letter preview — the .print-doc-root class hooks into the
            globals.css @media print rules: everything outside this
            wrapper gets visibility:hidden, this wrapper gets pulled
            out of the layout (position:absolute; inset:0) so the
            sidebar / form column / chat widget all disappear and the
            letter prints by itself on a clean page. */}
        <div className="print-doc-root bg-white border border-gray-200 rounded-[12px] shadow-sm print:border-0 print:shadow-none print:rounded-none">
          <div className="px-12 py-14 print:px-12 print:py-12 max-w-[210mm] mx-auto text-[15px] leading-[1.9] text-[#111110]">
            {/* Company header — top right block */}
            <div className="text-right mb-10">
              <div className="font-semibold text-[16px]">
                {org?.company_name || 'บริษัท —'}
              </div>
              {org?.company_address ? (
                <div className="text-[13px] text-gray-700 whitespace-pre-line">
                  {org.company_address}
                </div>
              ) : (
                <div className="text-[12px] text-gray-400 italic print:hidden">
                  (ตั้งค่าที่อยู่บริษัทได้ที่ /settings)
                </div>
              )}
            </div>

            <h2 className="text-center font-semibold text-[18px] mb-10">
              หนังสือรับรองเงินเดือน
            </h2>

            <div className="space-y-4">
              <p className="indent-12">
                หนังสือฉบับนี้ออกให้เพื่อรับรองว่า <Slot>{title} {fullName || '—'}</Slot>
                {' '}เป็นพนักงานของ <Slot>{org?.company_name || '—'}</Slot>
                {' '}ปฏิบัติงานในตำแหน่ง <Slot>{position}</Slot>
                {' '}โดยเริ่มงานตั้งแต่วันที่ <Slot>{startThai}</Slot>
                {' '}จนถึงปัจจุบัน ซึ่งปัจจุบันมีอัตราเงินเดือน
                เดือนละ <Slot>{salary.toLocaleString('th-TH', { minimumFractionDigits: 0 })} บาท</Slot>
                {' '}({salaryWords || '—'})
              </p>

              <p className="indent-12">
                หนังสือรับรองเงินเดือนฉบับนี้ใช้เพื่อ{' '}
                <Slot>{purpose.trim() || '...(ระบุวัตถุประสงค์ในการใช้)...'}</Slot>
                {' '}เท่านั้น
              </p>
            </div>

            {/* Date + signature block */}
            <div className="mt-16 flex flex-col items-end gap-1">
              <div>ออกให้ ณ วันที่ {issueThai}</div>
              <div className="mt-14 text-center">
                <div>ลงชื่อ {'.'.repeat(34)}</div>
                <div className="mt-1">
                  ({signerName || '.'.repeat(28)})
                </div>
                <div className="mt-1">ตำแหน่ง {signerPosition}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}

/** Inline "slot" styling — the filled-in value sits between the form
 *  blanks. We render a thin underline on screen but drop it on print
 *  so the letter looks like a typed document, not a fill-in-the-blank. */
function Slot({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-medium border-b border-gray-200 px-1 print:border-0">
      {children}
    </span>
  )
}
