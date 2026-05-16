'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { employeeApi, departmentApi, positionApi, type Position, EmployeeUpdate, SelfUpdate } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import {
  IconArrowLeft, IconUser, IconId, IconBriefcase, IconCash,
  IconCheck, IconX, IconDeviceFloppy, IconPhoto, IconEdit
} from '@tabler/icons-react'
import clsx from 'clsx'

interface Profile {
  id: string
  employee_id: string
  user_id: string
  email?: string
  role?: string
  first_name: string
  last_name: string
  nickname?: string
  phone?: string
  position?: string
  position_id?: string | null
  department_name?: string
  manager_id?: string | null
  avatar_url?: string | null
  is_active: boolean
  // Personal
  title?: string
  first_name_en?: string
  last_name_en?: string
  nickname_en?: string
  gender?: string
  nationality?: string
  marital_status?: string
  date_of_birth?: string
  address?: string
  // IDs
  national_id?: string
  passport_number?: string
  social_security_number?: string
  tax_id?: string
  fingerprint_code?: string
  // Employment
  start_date?: string
  hire_date?: string
  contract_end_date?: string
  retirement_year?: number
  probation_days?: number
  probation_end_date?: string
  employment_type?: string
  base_salary?: number
  // Bank
  bank_account?: string
  bank_name?: string
  bank_branch_code?: string
  payment_method?: string
  // Free-form
  notes?: string
  hashtags?: string[]
}

const GENDERS = [
  { value: '', label: '— ไม่ระบุ' },
  { value: 'male', label: 'ชาย' },
  { value: 'female', label: 'หญิง' },
  { value: 'other', label: 'อื่นๆ' },
]
const MARITALS = [
  { value: '', label: '— ไม่ระบุ' },
  { value: 'single', label: 'โสด' },
  { value: 'married', label: 'สมรส' },
  { value: 'divorced', label: 'หย่า' },
  { value: 'widowed', label: 'หม้าย' },
]
const NATIONALITIES = [
  { value: '', label: '— ไม่ระบุ' },
  { value: 'ไทย', label: 'ไทย' },
  { value: 'ต่างชาติ', label: 'ต่างชาติ' },
]
const PAYMENT_METHODS = [
  { value: '', label: '— ไม่ระบุ' },
  { value: 'transfer', label: 'โอน' },
  { value: 'cash', label: 'เงินสด' },
  { value: 'cheque', label: 'เช็ค' },
]
const EMPLOYMENT_TYPES = [
  { value: '', label: '— ไม่ระบุ' },
  { value: 'fulltime', label: 'พนักงานประจำ' },
  { value: 'parttime', label: 'พาร์ทไทม์' },
  { value: 'contract', label: 'สัญญาจ้าง' },
  { value: 'probation', label: 'ทดลองงาน' },
]

const TABS = [
  { key: 'basic', label: 'ข้อมูลพื้นฐาน', icon: IconUser },
  { key: 'identity', label: 'เอกสารระบุตัว', icon: IconId },
  { key: 'employment', label: 'การจ้างงาน', icon: IconBriefcase },
  { key: 'bank', label: 'ธนาคาร / ภาษี', icon: IconCash },
] as const
type TabKey = typeof TABS[number]['key']

function ymd(d?: string) {
  if (!d) return ''
  // backend may return "YYYY-MM-DDTxxx"; keep date only
  return d.length >= 10 ? d.slice(0, 10) : d
}

export default function EmployeeProfilePage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const id = params?.id
  const { user } = useAuthStore()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [form, setForm] = useState<Partial<Profile>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState({ text: '', ok: true })
  const [tab, setTab] = useState<TabKey>('basic')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([])
  const [positions, setPositions] = useState<Position[]>([])

  const isOwner = user?.role === 'owner'
  const isHR = isOwner || user?.role === 'hr'
  // Determine if this profile is "me"
  const isSelf = profile?.user_id === user?.id

  // Permission: HR/owner can edit everything; employee can self-edit limited fields
  const canEdit = isHR || isSelf
  // Field-level: HR/owner edits employment/salary; self cannot
  const canEditEmployment = isHR

  const load = async () => {
    if (!id) return
    setLoading(true)
    try {
      // "me" sentinel goes to /employees/me; otherwise /employees/:id
      const res = id === 'me' ? await employeeApi.me() : await employeeApi.getOne(id)
      const p = res.data.data as Profile
      setProfile(p)
      setForm({})
      // Also load departments + positions for HR-only dropdowns. Positions
      // power the "ตำแหน่ง" select on the employment tab — open to everyone
      // because the endpoint is auth-only and the data is needed to render
      // the readonly view too.
      if (isHR) {
        const d = await departmentApi.list().catch(() => null)
        if (d) setDepartments(d.data.data || [])
      }
      // Renamed local from `p` → `posRes` because line 141 already
      // declared `const p = res.data.data as Profile` in this same block;
      // TS/SWC rejected the redeclaration and the Vercel build failed
      // for commit 8e8b1db2.
      const posRes = await positionApi.list().catch(() => null)
      if (posRes) setPositions(posRes.data.data || [])
    } catch (e: any) {
      setMsg({ text: e.response?.data?.message || 'โหลดข้อมูลไม่ได้', ok: false })
    } finally { setLoading(false) }
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [id])

  const setField = <K extends keyof Profile>(k: K, v: Profile[K]) => {
    setForm(prev => ({ ...prev, [k]: v }))
  }

  const fieldValue = <K extends keyof Profile>(k: K): any => {
    if (k in form) return (form as any)[k]
    return (profile as any)?.[k]
  }

  const hasChanges = Object.keys(form).length > 0

  const save = async () => {
    if (!hasChanges || !profile) return
    setSaving(true)
    setMsg({ text: '', ok: true })
    try {
      // Map snake_case form keys → camelCase API payload
      const map: Record<string, string> = {
        first_name: 'firstName', last_name: 'lastName', nickname: 'nickname', phone: 'phone',
        position: 'position', position_id: 'positionId',
        department_name: 'department',
        base_salary: 'baseSalary', avatar_url: 'avatarUrl',
        bank_account: 'bankAccount', bank_name: 'bankName', national_id: 'nationalId',
        title: 'title', first_name_en: 'firstNameEn', last_name_en: 'lastNameEn',
        nickname_en: 'nicknameEn', gender: 'gender', nationality: 'nationality',
        marital_status: 'maritalStatus', date_of_birth: 'dateOfBirth', address: 'address',
        passport_number: 'passportNumber', social_security_number: 'socialSecurityNumber',
        tax_id: 'taxId', fingerprint_code: 'fingerprintCode',
        hire_date: 'hireDate', retirement_year: 'retirementYear',
        probation_days: 'probationDays', probation_end_date: 'probationEndDate',
        contract_end_date: 'contractEndDate', employment_type: 'employmentType',
        start_date: 'startDate',
        bank_branch_code: 'bankBranchCode', payment_method: 'paymentMethod',
        notes: 'notes', hashtags: 'hashtags',
      }
      const payload: any = {}
      for (const [k, v] of Object.entries(form)) {
        if (map[k]) payload[map[k]] = v
        else payload[k] = v
      }

      if (isSelf && !isHR) {
        await employeeApi.updateMe(payload as SelfUpdate)
      } else {
        await employeeApi.update(profile.id, payload as EmployeeUpdate)
      }
      setMsg({ text: 'บันทึกข้อมูลแล้ว', ok: true })
      load()
    } catch (e: any) {
      setMsg({ text: e.response?.data?.message || 'เกิดข้อผิดพลาด', ok: false })
    } finally { setSaving(false) }
  }

  const handleAvatarPick = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      setMsg({ text: 'ไฟล์ใหญ่เกิน 5MB', ok: false }); return
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onerror = () => reject(new Error('อ่านไฟล์ไม่ได้'))
      reader.onload = () => {
        const img = new Image()
        img.onload = () => {
          const scale = Math.min(1, 400 / Math.max(img.width, img.height))
          const w = Math.round(img.width * scale)
          const h = Math.round(img.height * scale)
          const canvas = document.createElement('canvas')
          canvas.width = w; canvas.height = h
          canvas.getContext('2d')?.drawImage(img, 0, 0, w, h)
          resolve(canvas.toDataURL('image/jpeg', 0.85))
        }
        img.src = reader.result as string
      }
      reader.readAsDataURL(file)
    })
    setField('avatar_url', dataUrl)
  }

  if (loading && !profile) {
    return <div className="p-6 text-sm text-gray-400">กำลังโหลด...</div>
  }
  if (!profile) {
    return (
      <div className="p-6">
        <div className="card text-center py-10">
          <p className="text-sm text-gray-500">ไม่พบข้อมูลพนักงาน</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <button onClick={() => router.back()} className="btn btn-ghost text-xs mb-3">
        <IconArrowLeft size={14} /> กลับ
      </button>

      {/* Header */}
      <div className="card mb-5 flex items-start gap-4">
        <div className="relative">
          {fieldValue('avatar_url') ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={fieldValue('avatar_url')}
              alt={`${profile.first_name} ${profile.last_name}`}
              className="w-20 h-20 rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-[#1D9E75] text-white text-2xl font-semibold flex items-center justify-center flex-shrink-0">
              {profile.first_name?.charAt(0) || '?'}{profile.last_name?.charAt(0) || ''}
            </div>
          )}
          {canEdit && (
            <>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
                onChange={e => e.target.files?.[0] && handleAvatarPick(e.target.files[0])} />
              <button onClick={() => fileInputRef.current?.click()}
                className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-white border border-black/[0.1] flex items-center justify-center hover:bg-gray-50"
                title="เปลี่ยนรูป">
                <IconPhoto size={13} className="text-gray-600" />
              </button>
            </>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold text-[#111110]">
            {profile.first_name} {profile.last_name}
            {profile.nickname && <span className="text-gray-400 font-normal ml-2">({profile.nickname})</span>}
          </h1>
          <div className="text-sm text-gray-500 mt-0.5">
            {profile.employee_id}
            {profile.position && <> · {profile.position}</>}
            {profile.department_name && <> · {profile.department_name}</>}
          </div>
          <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
            {profile.email && <span>📧 {profile.email}</span>}
            {profile.phone && <span>📞 {profile.phone}</span>}
          </div>
        </div>
        {hasChanges && (
          <button onClick={save} disabled={saving} className="btn btn-primary text-sm">
            <IconDeviceFloppy size={14} /> {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        )}
      </div>

      {msg.text && (
        <div className={clsx(
          'flex items-center gap-2 p-2.5 rounded-[10px] text-xs mb-3',
          msg.ok ? 'bg-[#E1F5EE] text-[#085041]' : 'bg-red-50 text-red-600'
        )}>
          {msg.ok ? <IconCheck size={13} /> : <IconX size={13} />}
          {msg.text}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-black/[0.06] overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={clsx(
              'px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
              tab === t.key ? 'border-[#1D9E75] text-[#085041]' : 'border-transparent text-gray-500 hover:text-gray-700'
            )}
          >
            <span className="inline-flex items-center gap-1.5">
              <t.icon size={14} />
              {t.label}
            </span>
          </button>
        ))}
      </div>

      {/* Basic */}
      {tab === 'basic' && (
        <div className="card space-y-4">
          <Section title="ชื่อ-นามสกุล">
            <Grid>
              <Field label="คำนำหน้า" value={fieldValue('title') || ''} disabled={!canEdit}
                onChange={v => setField('title', v)} placeholder="นาย / นาง / นางสาว" />
              <Field label="ชื่อ" value={fieldValue('first_name') || ''} disabled={!canEditEmployment}
                onChange={v => setField('first_name', v)} required />
              <Field label="นามสกุล" value={fieldValue('last_name') || ''} disabled={!canEditEmployment}
                onChange={v => setField('last_name', v)} required />
              <Field label="ชื่อเล่น" value={fieldValue('nickname') || ''} disabled={!canEdit}
                onChange={v => setField('nickname', v)} />
              <Field label="ชื่อ (EN)" value={fieldValue('first_name_en') || ''} disabled={!canEdit}
                onChange={v => setField('first_name_en', v)} placeholder="First name" />
              <Field label="นามสกุล (EN)" value={fieldValue('last_name_en') || ''} disabled={!canEdit}
                onChange={v => setField('last_name_en', v)} placeholder="Last name" />
              <Field label="ชื่อเล่น (EN)" value={fieldValue('nickname_en') || ''} disabled={!canEdit}
                onChange={v => setField('nickname_en', v)} />
            </Grid>
          </Section>

          <Section title="ข้อมูลส่วนตัว">
            <Grid>
              <Select label="เพศ" value={fieldValue('gender') || ''} options={GENDERS}
                disabled={!canEdit} onChange={v => setField('gender', v)} />
              <Select label="สัญชาติ" value={fieldValue('nationality') || ''} options={NATIONALITIES}
                disabled={!canEdit} onChange={v => setField('nationality', v)} />
              <Select label="สถานะ" value={fieldValue('marital_status') || ''} options={MARITALS}
                disabled={!canEdit} onChange={v => setField('marital_status', v)} />
              <Field label="วันเกิด" type="date" value={ymd(fieldValue('date_of_birth'))} disabled={!canEdit}
                onChange={v => setField('date_of_birth', v)} />
            </Grid>
          </Section>

          <Section title="ที่อยู่ติดต่อ">
            <Grid>
              <Field label="เบอร์โทรศัพท์" value={fieldValue('phone') || ''} disabled={!canEdit}
                onChange={v => setField('phone', v)} placeholder="08X-XXX-XXXX" />
              <div className="sm:col-span-2">
                <Textarea label="ที่อยู่" value={fieldValue('address') || ''} disabled={!canEdit}
                  onChange={v => setField('address', v)} placeholder="บ้านเลขที่ ซอย ถนน ตำบล อำเภอ จังหวัด ไปรษณีย์" />
              </div>
            </Grid>
          </Section>
        </div>
      )}

      {/* Identity */}
      {tab === 'identity' && (
        <div className="card space-y-4">
          <Section title="เอกสารระบุตัวตน">
            <Grid>
              <Field label="เลขประจำตัวประชาชน" value={fieldValue('national_id') || ''}
                disabled={!canEdit} onChange={v => setField('national_id', v)} placeholder="13 หลัก" />
              <Field label="เลขประจำตัวผู้เสียภาษี" value={fieldValue('tax_id') || ''}
                disabled={!canEdit} onChange={v => setField('tax_id', v)}
                placeholder="ปกติเลขเดียวกับบัตรประชาชน" />
              <Field label="เลขหนังสือเดินทาง / Work Permit" value={fieldValue('passport_number') || ''}
                disabled={!canEdit} onChange={v => setField('passport_number', v)} />
              <Field label="เลขประกันสังคม" value={fieldValue('social_security_number') || ''}
                disabled={!canEdit} onChange={v => setField('social_security_number', v)} />
              <Field label="รหัสลายนิ้วมือ" value={fieldValue('fingerprint_code') || ''}
                disabled={!canEditEmployment} onChange={v => setField('fingerprint_code', v)} />
            </Grid>
          </Section>
        </div>
      )}

      {/* Employment */}
      {tab === 'employment' && (
        <div className="card space-y-4">
          <Section title="ตำแหน่งและหน่วยงาน">
            <Grid>
              <Field label="รหัสพนักงาน" value={profile.employee_id} disabled
                onChange={() => {}} />
              {/* Position is now an FK to the positions tree. Editing
                  picks a row by id; display falls back to the legacy
                  position text when the FK is null (unmatched on
                  backfill) so the data point isn't visually lost. */}
              {canEditEmployment ? (
                <Select label="ตำแหน่ง" value={fieldValue('position_id') || ''}
                  options={[
                    { value: '', label: '— ไม่ระบุ' },
                    ...positions.map(p => ({ value: p.id, label: p.name })),
                  ]}
                  disabled={!canEditEmployment}
                  onChange={v => setField('position_id', v)} />
              ) : (
                <Field label="ตำแหน่ง" value={fieldValue('position') || ''} disabled
                  onChange={() => {}} />
              )}
              {isHR && departments.length > 0 ? (
                <Select label="แผนก" value={fieldValue('department_name') || ''}
                  options={[{ value: '', label: '— ไม่มี' }, ...departments.map(d => ({ value: d.name, label: d.name }))]}
                  disabled={!canEditEmployment} onChange={v => setField('department_name', v)} />
              ) : (
                <Field label="แผนก" value={fieldValue('department_name') || ''} disabled
                  onChange={() => {}} />
              )}
              <Select label="ประเภทพนักงาน" value={fieldValue('employment_type') || ''}
                options={EMPLOYMENT_TYPES} disabled={!canEditEmployment}
                onChange={v => setField('employment_type', v)} />
            </Grid>
          </Section>

          <Section title="วันสำคัญ">
            <Grid>
              <Field label="วันที่เริ่มงาน" type="date" value={ymd(fieldValue('start_date'))}
                disabled={!canEditEmployment} onChange={v => setField('start_date', v)} />
              <Field label="วันที่บรรจุ" type="date" value={ymd(fieldValue('hire_date'))}
                disabled={!canEditEmployment} onChange={v => setField('hire_date', v)} />
              <Field label="วันสิ้นสุดสัญญา" type="date" value={ymd(fieldValue('contract_end_date'))}
                disabled={!canEditEmployment} onChange={v => setField('contract_end_date', v)} />
              <Field label="ปีที่เกษียณ" type="number" value={fieldValue('retirement_year')?.toString() || ''}
                disabled={!canEditEmployment} onChange={v => setField('retirement_year', v ? parseInt(v) : undefined)} />
              <Field label="ระยะเวลาทดลองงาน (วัน)" type="number" value={fieldValue('probation_days')?.toString() || ''}
                disabled={!canEditEmployment} onChange={v => setField('probation_days', v ? parseInt(v) : undefined)} />
              <Field label="วันสิ้นสุดทดลองงาน" type="date" value={ymd(fieldValue('probation_end_date'))}
                disabled={!canEditEmployment} onChange={v => setField('probation_end_date', v)} />
            </Grid>
          </Section>

          {canEditEmployment && (
            <Section title="บันทึก">
              <Textarea label="หมายเหตุ" value={fieldValue('notes') || ''} disabled={!canEditEmployment}
                onChange={v => setField('notes', v)} placeholder="หมายเหตุภายในเกี่ยวกับพนักงาน" />
            </Section>
          )}
        </div>
      )}

      {/* Bank / Tax */}
      {tab === 'bank' && (
        <div className="card space-y-4">
          <Section title="บัญชีรับเงินเดือน">
            <Grid>
              <Select label="ช่องทางการจ่าย" value={fieldValue('payment_method') || ''}
                options={PAYMENT_METHODS} disabled={!canEdit}
                onChange={v => setField('payment_method', v)} />
              <Field label="ธนาคาร" value={fieldValue('bank_name') || ''} disabled={!canEdit}
                onChange={v => setField('bank_name', v)} placeholder="เช่น กสิกรไทย, ไทยพาณิชย์" />
              <Field label="รหัสสาขา" value={fieldValue('bank_branch_code') || ''} disabled={!canEdit}
                onChange={v => setField('bank_branch_code', v)} />
              <Field label="เลขที่บัญชี" value={fieldValue('bank_account') || ''} disabled={!canEdit}
                onChange={v => setField('bank_account', v)} />
            </Grid>
          </Section>

          {isHR && (
            <Section title="เงินเดือน (เจ้าของ/HR เท่านั้น)">
              <Grid>
                <Field label="เงินเดือนฐาน (บาท)" type="number" value={fieldValue('base_salary')?.toString() || ''}
                  disabled={!canEditEmployment} onChange={v => setField('base_salary', v ? parseFloat(v) : undefined)} />
              </Grid>
            </Section>
          )}
        </div>
      )}
    </div>
  )
}

// ===== Small helpers =====
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">{title}</div>
      {children}
    </div>
  )
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{children}</div>
}

interface FieldProps {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  disabled?: boolean
  required?: boolean
}
function Field({ label, value, onChange, type = 'text', placeholder, disabled, required }: FieldProps) {
  return (
    <div>
      <label className="label">{label}{required && <span className="text-red-500"> *</span>}</label>
      <input
        type={type}
        className={clsx('input', disabled && 'bg-gray-50 text-gray-500')}
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
      />
    </div>
  )
}

interface SelectProps {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
  disabled?: boolean
}
function Select({ label, value, options, onChange, disabled }: SelectProps) {
  return (
    <div>
      <label className="label">{label}</label>
      <select
        className={clsx('input', disabled && 'bg-gray-50 text-gray-500')}
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

interface TextareaProps {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  disabled?: boolean
}
function Textarea({ label, value, onChange, placeholder, disabled }: TextareaProps) {
  return (
    <div>
      <label className="label">{label}</label>
      <textarea
        className={clsx('input min-h-[70px] resize-y', disabled && 'bg-gray-50 text-gray-500')}
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
      />
    </div>
  )
}
