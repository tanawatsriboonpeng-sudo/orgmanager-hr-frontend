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
  // Override when "ผู้จัดการฝ่ายบุคคล" doesn't match the signer's actual
  // position (e.g. owner signing for a small business).
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

  // Signer info (HR/owner who's logged in). The store has both
  // camelCase and snake_case keys depending on which path populated it
  // (login vs /auth/me), so we coalesce.
  const signerFirst = (user as any)?.firstName || (user as any)?.first_name || ''
  const signerLast  = (user as any)?.lastName  || (user as any)?.last_name  || ''
  const signerName  = `${signerFirst} ${signerLast}`.trim()

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

            <div className="pt-3 border-t border-black/[0.06]">
              <label className="label">ตำแหน่งผู้ลงนาม</label>
              <input
                className="input"
                value={signerPosition}
                onChange={e => setSignerPosition(e.target.value)}
              />
              <div className="text-[11px] text-gray-400 mt-1">
                ลงนามโดย: {signerName || '—'}
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

        {/* Letter preview — prints */}
        <div className="bg-white border border-gray-200 rounded-[12px] shadow-sm print:border-0 print:shadow-none print:rounded-none">
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

      {/* Print-specific tweaks. Tailwind's print: prefix handles most
          things, but A4 sizing + margin needs raw CSS. */}
      <style jsx global>{`
        @media print {
          @page { size: A4; margin: 18mm 16mm; }
          body { background: white !important; }
          /* Strip the sidebar / topbar — anything outside this page's
             tree is wrapped in .print:hidden via the layout, but as a
             safety net we also hide common chrome IDs if present. */
          aside, nav, header { display: none !important; }
        }
      `}</style>
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
