'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { employeeApi, departmentApi } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import {
  IconCrown, IconUsers, IconHierarchy,
  IconBuilding, IconBriefcase, IconCircleOff,
  IconEdit, IconX, IconCheck, IconPlus, IconTrash,
  IconPhoto, IconUserCircle
} from '@tabler/icons-react'
import clsx from 'clsx'

interface Employee {
  id: string
  employee_id: string
  first_name: string
  last_name: string
  nickname?: string
  phone?: string
  email: string
  role: 'owner' | 'hr' | 'employee' | string
  position: string
  department_name: string
  manager_id?: string | null
  manager_first_name?: string | null
  manager_last_name?: string | null
  avatar_url?: string | null
  is_active: boolean
}

interface Department {
  id: string
  name: string
  description?: string
  manager_id?: string | null
  manager_name?: string | null
  member_count?: number
}

const ROLES = [
  { value: 'owner', label: 'เจ้าของ' },
  { value: 'hr', label: 'HR Admin' },
  { value: 'employee', label: 'พนักงาน' },
]

const ROLE_BADGE: Record<string, string> = {
  owner: 'badge-purple',
  hr: 'badge-green',
  employee: 'badge-blue',
}
const ROLE_TH: Record<string, string> = {
  owner: 'เจ้าของ',
  hr: 'HR',
  employee: 'พนักงาน',
}
const ROLE_COLOR: Record<string, string> = {
  owner: '#534AB7',
  hr: '#1D9E75',
  employee: '#185FA5',
}
const ROLE_ORDER: Record<string, number> = { owner: 0, hr: 1, employee: 2 }

function Avatar({ emp, size = 36 }: { emp: Employee; size?: number }) {
  const color = ROLE_COLOR[emp.role] || '#6B6A66'
  const initials = `${emp.first_name?.charAt(0) || ''}${emp.last_name?.charAt(0) || ''}`.toUpperCase()
  if (emp.avatar_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={emp.avatar_url}
        alt={`${emp.first_name} ${emp.last_name}`}
        className="rounded-full object-cover flex-shrink-0"
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0"
      style={{ background: color, width: size, height: size, fontSize: size <= 36 ? 12 : 16 }}
    >
      {initials || '?'}
    </div>
  )
}

function PersonCard({
  emp,
  large = false,
  canEdit,
  onEdit,
  manager,
}: {
  emp: Employee
  large?: boolean
  canEdit?: boolean
  onEdit?: (emp: Employee) => void
  manager?: Employee | null
}) {
  return (
    <div className={clsx(
      'group flex items-center gap-3 p-3 rounded-[12px] border transition-all relative',
      emp.is_active === false
        ? 'bg-gray-50 border-black/[0.04] opacity-60'
        : 'bg-white border-black/[0.06] hover:shadow-sm',
      large && 'p-4'
    )}>
      <Avatar emp={emp} size={large ? 48 : 36} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className={clsx('font-medium text-[#111110] truncate', large ? 'text-base' : 'text-sm')}>
            {emp.first_name} {emp.last_name}
            {emp.nickname && (
              <span className="text-gray-400 font-normal ml-1">({emp.nickname})</span>
            )}
          </div>
          <span className={clsx('badge', ROLE_BADGE[emp.role] || 'badge-gray')} style={large ? undefined : { fontSize: 10 }}>
            {ROLE_TH[emp.role] || emp.role}
          </span>
          {emp.is_active === false && (
            <span className="badge badge-gray inline-flex items-center gap-1" style={{ fontSize: 10 }}>
              <IconCircleOff size={10} />
              ระงับ
            </span>
          )}
        </div>
        {emp.position && (
          <div className={clsx('text-gray-500 mt-0.5', large ? 'text-sm' : 'text-xs')}>
            {emp.position}
          </div>
        )}
        {manager && (
          <div className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1">
            <IconUserCircle size={10} />
            ภายใต้ {manager.first_name} {manager.last_name}
          </div>
        )}
      </div>
      {canEdit && onEdit && (
        <button
          onClick={() => onEdit(emp)}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-[8px] hover:bg-gray-100 text-gray-500 hover:text-[#1D9E75]"
          title="แก้ไข"
          aria-label={`แก้ไข ${emp.first_name} ${emp.last_name}`}
        >
          <IconEdit size={15} />
        </button>
      )}
    </div>
  )
}

// Resize image client-side to keep base64 small
async function fileToResizedBase64(file: File, maxSize = 400, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('อ่านไฟล์ไม่ได้'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('โหลดรูปไม่ได้'))
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
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

function EditModal({
  emp,
  allEmployees,
  departments,
  isOwner,
  onClose,
  onSaved,
}: {
  emp: Employee
  allEmployees: Employee[]
  departments: Department[]
  isOwner: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    firstName: emp.first_name || '',
    lastName: emp.last_name || '',
    nickname: emp.nickname || '',
    phone: emp.phone || '',
    position: emp.position || '',
    department: emp.department_name || (departments[0]?.name ?? ''),
    role: emp.role || 'employee',
    managerId: emp.manager_id || '',
    avatarUrl: emp.avatar_url || '',
  })
  const [msg, setMsg] = useState({ text: '', ok: true })
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Manager candidates: everyone except self and inactive
  const managerCandidates = allEmployees.filter(e => e.id !== emp.id && e.is_active !== false)

  const handleAvatarPick = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      setMsg({ text: 'ไฟล์ใหญ่เกิน 5MB', ok: false }); return
    }
    try {
      const dataUrl = await fileToResizedBase64(file)
      setForm(p => ({ ...p, avatarUrl: dataUrl }))
      setMsg({ text: '', ok: true })
    } catch (e: any) {
      setMsg({ text: e.message || 'แปลงรูปไม่ได้', ok: false })
    }
  }

  const submit = async () => {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setMsg({ text: 'กรุณากรอกชื่อและนามสกุล', ok: false })
      return
    }
    setSaving(true)
    setMsg({ text: '', ok: true })
    try {
      await employeeApi.update(emp.id, {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        nickname: form.nickname.trim() || undefined,
        phone: form.phone.trim() || undefined,
        position: form.position.trim() || undefined,
        department: form.department,
        role: isOwner ? (form.role as any) : undefined,
        managerId: form.managerId || null,
        avatarUrl: form.avatarUrl !== emp.avatar_url ? form.avatarUrl : undefined,
      })
      setMsg({ text: 'อัปเดตเรียบร้อย', ok: true })
      onSaved()
      setTimeout(onClose, 600)
    } catch (e: any) {
      setMsg({ text: e.response?.data?.message || 'เกิดข้อผิดพลาด', ok: false })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-[14px] shadow-xl w-full max-w-lg p-5 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-[#111110]">แก้ไขข้อมูลพนักงาน</h2>
            <p className="text-xs text-gray-500 mt-0.5">{emp.email} · {emp.employee_id}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-[8px] hover:bg-gray-100 text-gray-500" aria-label="ปิด">
            <IconX size={16} />
          </button>
        </div>

        {/* Avatar */}
        <div className="flex items-center gap-3 mb-4 pb-4 border-b border-black/[0.06]">
          {form.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={form.avatarUrl} alt="avatar" className="w-16 h-16 rounded-full object-cover flex-shrink-0" />
          ) : (
            <Avatar emp={{ ...emp, avatar_url: null }} size={64} />
          )}
          <div className="flex-1">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => e.target.files?.[0] && handleAvatarPick(e.target.files[0])}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="btn text-xs"
            >
              <IconPhoto size={13} /> เลือกรูป
            </button>
            {form.avatarUrl && (
              <button
                type="button"
                onClick={() => setForm(p => ({ ...p, avatarUrl: '' }))}
                className="btn text-xs ml-1.5 text-red-500 border-red-200 hover:bg-red-50"
              >
                <IconX size={13} /> เอาออก
              </button>
            )}
            <p className="text-[10px] text-gray-400 mt-1">รูปจะถูกย่อเป็น 400px อัตโนมัติ</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">ชื่อ</label>
            <input className="input" value={form.firstName}
              onChange={e => setForm(p => ({ ...p, firstName: e.target.value }))} />
          </div>
          <div>
            <label className="label">นามสกุล</label>
            <input className="input" value={form.lastName}
              onChange={e => setForm(p => ({ ...p, lastName: e.target.value }))} />
          </div>
          <div>
            <label className="label">ชื่อเล่น</label>
            <input className="input" placeholder="—" value={form.nickname}
              onChange={e => setForm(p => ({ ...p, nickname: e.target.value }))} />
          </div>
          <div>
            <label className="label">เบอร์โทร</label>
            <input className="input" placeholder="08X-XXX-XXXX" value={form.phone}
              onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
          </div>
          <div className="col-span-2">
            <label className="label">ตำแหน่ง</label>
            <input className="input" placeholder="เช่น Developer, บัญชี" value={form.position}
              onChange={e => setForm(p => ({ ...p, position: e.target.value }))} />
          </div>
          <div>
            <label className="label">แผนก</label>
            <select className="input" value={form.department}
              onChange={e => setForm(p => ({ ...p, department: e.target.value }))}>
              {departments.length === 0 && <option value="">— ไม่มีแผนก —</option>}
              {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">
              สิทธิ์{!isOwner && <span className="text-gray-400 font-normal"> (เฉพาะเจ้าของ)</span>}
            </label>
            <select className="input" value={form.role}
              onChange={e => setForm(p => ({ ...p, role: e.target.value }))} disabled={!isOwner}>
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="label">ผู้บังคับบัญชา (รายงานต่อ)</label>
            <select className="input" value={form.managerId}
              onChange={e => setForm(p => ({ ...p, managerId: e.target.value }))}>
              <option value="">— ไม่มี (รายงานตรงต่อเจ้าของ) —</option>
              {managerCandidates.map(m => (
                <option key={m.id} value={m.id}>
                  {m.first_name} {m.last_name}
                  {m.nickname ? ` (${m.nickname})` : ''}
                  {m.position ? ` — ${m.position}` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {msg.text && (
          <div className={clsx('flex items-center gap-2 p-2.5 rounded-[10px] text-xs mt-4',
            msg.ok ? 'bg-[#E1F5EE] text-[#085041]' : 'bg-red-50 text-red-600')}>
            {msg.ok ? <IconCheck size={13} /> : <IconX size={13} />}
            {msg.text}
          </div>
        )}

        <div className="flex gap-2 mt-5">
          <button onClick={submit} disabled={saving} className="btn btn-primary text-sm flex-1">
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
          <button onClick={onClose} className="btn text-sm">ยกเลิก</button>
        </div>
      </div>
    </div>
  )
}

function DepartmentPanel({
  departments,
  isOwner,
  isHR,
  onChanged,
}: {
  departments: Department[]
  isOwner: boolean
  isHR: boolean
  onChanged: () => void
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [msg, setMsg] = useState({ text: '', ok: true })
  const [busy, setBusy] = useState(false)

  if (!isHR) return null

  const create = async () => {
    if (!name.trim()) { setMsg({ text: 'กรุณาระบุชื่อแผนก', ok: false }); return }
    setBusy(true)
    try {
      await departmentApi.create({ name: name.trim(), description: desc.trim() || undefined })
      setName(''); setDesc(''); setShowAdd(false); setMsg({ text: '', ok: true })
      onChanged()
    } catch (e: any) {
      setMsg({ text: e.response?.data?.message || 'เกิดข้อผิดพลาด', ok: false })
    } finally { setBusy(false) }
  }

  const remove = async (dept: Department) => {
    if (!confirm(`ลบแผนก "${dept.name}"?`)) return
    try {
      await departmentApi.delete(dept.id)
      onChanged()
    } catch (e: any) {
      alert(e.response?.data?.message || 'เกิดข้อผิดพลาด')
    }
  }

  return (
    <div className="card mb-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-[#111110] flex items-center gap-2">
          <IconBuilding size={15} className="text-gray-400" />
          จัดการแผนก ({departments.length})
        </h2>
        <button onClick={() => setShowAdd(!showAdd)} className="btn btn-primary text-xs">
          <IconPlus size={13} /> เพิ่มแผนก
        </button>
      </div>

      {showAdd && (
        <div className="bg-gray-50 rounded-[10px] p-3 mb-3 border border-black/[0.04]">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input className="input" placeholder="ชื่อแผนก" value={name} onChange={e => setName(e.target.value)} />
            <input className="input" placeholder="คำอธิบาย (ไม่บังคับ)" value={desc} onChange={e => setDesc(e.target.value)} />
          </div>
          {msg.text && <p className={clsx('text-xs mt-2', msg.ok ? 'text-[#085041]' : 'text-red-600')}>{msg.text}</p>}
          <div className="flex gap-2 mt-2">
            <button onClick={create} disabled={busy} className="btn btn-primary text-xs">
              {busy ? 'กำลังสร้าง...' : 'สร้าง'}
            </button>
            <button onClick={() => { setShowAdd(false); setName(''); setDesc(''); setMsg({ text: '', ok: true }) }} className="btn text-xs">
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      {departments.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-3">ยังไม่มีแผนก — เพิ่มแผนกแรกได้เลย</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {departments.map(d => (
            <div key={d.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-[8px] bg-gray-50 border border-black/[0.04]">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-[#111110] truncate">{d.name}</div>
                <div className="text-[10px] text-gray-400">{d.member_count || 0} คน</div>
              </div>
              {isOwner && (
                <button
                  onClick={() => remove(d)}
                  disabled={(d.member_count || 0) > 0}
                  className={clsx(
                    'p-1 rounded-[6px] transition-colors',
                    (d.member_count || 0) > 0
                      ? 'text-gray-300 cursor-not-allowed'
                      : 'text-red-400 hover:bg-red-50 hover:text-red-600'
                  )}
                  title={(d.member_count || 0) > 0 ? 'ย้ายพนักงานออกก่อนจึงจะลบได้' : 'ลบแผนก'}
                >
                  <IconTrash size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function OrgChartPage() {
  const { user } = useAuthStore()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [showInactive, setShowInactive] = useState(false)
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null)

  const isOwner = user?.role === 'owner'
  const isHR = user?.role === 'hr' || isOwner

  const loadAll = async () => {
    setLoading(true)
    try {
      const [eRes, dRes] = await Promise.allSettled([
        employeeApi.list(),
        departmentApi.list(),
      ])
      if (eRes.status === 'fulfilled') setEmployees(eRes.value.data.data || [])
      if (dRes.status === 'fulfilled') setDepartments(dRes.value.data.data || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAll() }, [])

  const visible = useMemo(
    () => employees.filter(e => showInactive || e.is_active !== false),
    [employees, showInactive]
  )

  const owners = useMemo(() => visible.filter(e => e.role === 'owner'), [visible])
  const others = useMemo(() => visible.filter(e => e.role !== 'owner'), [visible])
  const empById = useMemo(() => {
    const m: Record<string, Employee> = {}
    for (const e of employees) m[e.id] = e
    return m
  }, [employees])

  const byDept = useMemo(() => {
    const groups: Record<string, Employee[]> = {}
    for (const emp of others) {
      const dept = emp.department_name || 'ทั่วไป'
      if (!groups[dept]) groups[dept] = []
      groups[dept].push(emp)
    }
    Object.values(groups).forEach(list =>
      list.sort((a, b) => {
        const ra = ROLE_ORDER[a.role] ?? 99
        const rb = ROLE_ORDER[b.role] ?? 99
        if (ra !== rb) return ra - rb
        return (a.first_name || '').localeCompare(b.first_name || '', 'th')
      })
    )
    return Object.entries(groups).sort(([aName, aList], [bName, bList]) => {
      const hrA = aList.filter(e => e.role === 'hr').length
      const hrB = bList.filter(e => e.role === 'hr').length
      if (hrA !== hrB) return hrB - hrA
      return aName.localeCompare(bName, 'th')
    })
  }, [others])

  const totalActive = employees.filter(e => e.is_active !== false).length
  const totalInactive = employees.length - totalActive

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-[#111110] flex items-center gap-2">
            <IconHierarchy size={20} className="text-[#1D9E75]" />
            แผนผังองค์กร
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            พนักงาน {totalActive} คน · {departments.length} แผนก
            {totalInactive > 0 && <> · ระงับ {totalInactive} คน</>}
            {isHR && <> · <span className="text-[#1D9E75]">hover การ์ดเพื่อแก้ไข</span></>}
          </p>
        </div>
        {totalInactive > 0 && (
          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="rounded" />
            แสดงพนักงานที่ระงับ
          </label>
        )}
      </div>

      {/* Department management */}
      <DepartmentPanel
        departments={departments}
        isOwner={!!isOwner}
        isHR={!!isHR}
        onChanged={loadAll}
      />

      {loading ? (
        <div className="card text-center py-10 text-sm text-gray-400">กำลังโหลด...</div>
      ) : visible.length === 0 ? (
        <div className="card text-center py-10">
          <IconUsers size={28} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-400">ยังไม่มีพนักงาน</p>
        </div>
      ) : (
        <>
          {owners.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <IconCrown size={15} className="text-[#534AB7]" />
                <h2 className="text-sm font-semibold text-[#111110]">ผู้บริหาร</h2>
                <span className="text-xs text-gray-400">({owners.length})</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {owners.map(emp => (
                  <div key={emp.id} className="rounded-[14px] border-2 p-1"
                    style={{ borderColor: '#EEEDFE', background: 'linear-gradient(135deg, #EEEDFE 0%, #FFFFFF 60%)' }}>
                    <PersonCard emp={emp} large canEdit={isHR} onEdit={setEditingEmp} />
                  </div>
                ))}
              </div>
              {byDept.length > 0 && (
                <div className="flex justify-center my-4">
                  <div className="w-px h-8 bg-gradient-to-b from-[#534AB7]/30 to-[#1D9E75]/30" />
                </div>
              )}
            </div>
          )}

          {byDept.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {byDept.map(([dept, members]) => {
                const hrs = members.filter(m => m.role === 'hr')
                const emps = members.filter(m => m.role === 'employee')
                return (
                  <div key={dept} className="card">
                    <div className="flex items-center justify-between mb-3 pb-3 border-b border-black/[0.06]">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-[8px] bg-[#E1F5EE] text-[#085041] flex items-center justify-center">
                          <IconBuilding size={15} />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-[#111110]">{dept}</div>
                          <div className="text-[11px] text-gray-400">
                            {members.length} คน
                            {hrs.length > 0 && <> · HR {hrs.length}</>}
                          </div>
                        </div>
                      </div>
                    </div>

                    {hrs.length > 0 && (
                      <div className="mb-3">
                        <div className="text-[11px] font-medium text-gray-500 mb-1.5 px-1 flex items-center gap-1">
                          <IconUsers size={11} /> HR
                        </div>
                        <div className="space-y-1.5">
                          {hrs.map(emp => (
                            <PersonCard
                              key={emp.id}
                              emp={emp}
                              canEdit={isHR}
                              onEdit={setEditingEmp}
                              manager={emp.manager_id ? empById[emp.manager_id] : null}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {emps.length > 0 && (
                      <div>
                        {hrs.length > 0 && (
                          <div className="text-[11px] font-medium text-gray-500 mb-1.5 px-1 flex items-center gap-1">
                            <IconBriefcase size={11} /> พนักงาน
                          </div>
                        )}
                        <div className="space-y-1.5">
                          {emps.map(emp => (
                            <PersonCard
                              key={emp.id}
                              emp={emp}
                              canEdit={isHR}
                              onEdit={setEditingEmp}
                              manager={emp.manager_id ? empById[emp.manager_id] : null}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {editingEmp && (
        <EditModal
          emp={editingEmp}
          allEmployees={employees}
          departments={departments}
          isOwner={!!isOwner}
          onClose={() => setEditingEmp(null)}
          onSaved={loadAll}
        />
      )}
    </div>
  )
}
