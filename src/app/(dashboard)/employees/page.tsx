'use client'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useAuthStore } from '@/lib/store'
import { employeeApi, orgApi, departmentApi, positionApi, type Position } from '@/lib/api'
import api from '@/lib/api'
import {
  IconUserPlus, IconEdit, IconKey, IconCheck, IconX, IconEye,
  IconEyeOff, IconSearch, IconUserCircle, IconDotsVertical,
  IconPlayerPause, IconPlayerPlay, IconArrowUp, IconArrowDown,
  IconArrowsSort, IconFilter,
} from '@tabler/icons-react'
import clsx from 'clsx'
import Link from 'next/link'
import EmployeeAvatar from '@/components/employees/EmployeeAvatar'

const ROLES = [
  { value: 'owner', label: 'เจ้าของ' },
  { value: 'hr', label: 'HR Admin' },
  { value: 'employee', label: 'พนักงาน' },
]

// Departments now come from /api/departments (managed in /org-chart) so
// the dropdown stays in sync with what HR has actually set up. Falls back
// to a small seed list only when the API returns nothing on first ever
// load, so a brand-new install still has options.
const SEED_DEPARTMENTS = ['IT', 'HR', 'Finance', 'Operations', 'Marketing', 'ทั่วไป']

interface Department { id: string; name: string }

interface Employee {
  id: string
  user_id: string
  employee_id: string
  first_name: string
  last_name: string
  email: string
  role: string
  position: string
  position_id?: string | null
  department_name: string
  shift_type: string
  base_salary: number
  is_active: boolean
  account_active: boolean
  last_login_at: string
  avatar_url?: string | null
}

type SortKey = 'employee_id' | 'name' | 'department_name' | 'role' | 'is_active'
type SortDir = 'asc' | 'desc'

const ROLE_BADGE: Record<string, string> = {
  owner: 'badge-purple', hr: 'badge-green', employee: 'badge-blue',
}
const ROLE_TH: Record<string, string> = {
  owner: 'เจ้าของ', hr: 'HR', employee: 'พนักงาน',
}
// Stable order for sorting by role: owner > hr > employee
const ROLE_ORDER: Record<string, number> = { owner: 0, hr: 1, employee: 2 }

export default function EmployeesPage() {
  const { user } = useAuthStore()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [companyName, setCompanyName] = useState<string>('')
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<'' | 'active' | 'inactive'>('')
  const [deptFilter, setDeptFilter] = useState<string>('')
  const [sortKey, setSortKey] = useState<SortKey>('employee_id')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const [showForm, setShowForm] = useState(false)
  const [editEmp, setEditEmp] = useState<Employee | null>(null)
  const [showPwForm, setShowPwForm] = useState<string | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState({ text: '', ok: true })

  const [positions, setPositions] = useState<Position[]>([])

  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '',
    employeeId: '', position: '', positionId: '', department: 'IT',
    role: 'employee',
    baseSalary: '', password: '', confirmPassword: '',
  })

  const [pwForm, setPwForm] = useState({
    newPassword: '', confirmPassword: '', showPw: false,
  })

  const isOwner = user?.role === 'owner'
  const isHR = user?.role === 'hr' || user?.role === 'owner'

  const load = async () => {
    try {
      const res = await employeeApi.list()
      setEmployees(res.data.data || [])
    } catch {}
  }

  const loadCompany = async () => {
    try {
      const r = await orgApi.get()
      setCompanyName(r.data.data?.company_name || '')
    } catch {}
  }

  const loadDepartments = async () => {
    try {
      const r = await departmentApi.list()
      setDepartments(r.data.data || [])
    } catch {}
  }

  const loadPositions = async () => {
    try {
      const r = await positionApi.list()
      setPositions(r.data.data || [])
    } catch {}
  }

  useEffect(() => { load(); loadCompany(); loadDepartments(); loadPositions() }, [])

  // Auto-dismiss success messages after 3.5s; errors stay until user closes.
  useEffect(() => {
    if (!msg.text || !msg.ok) return
    const t = setTimeout(() => setMsg({ text: '', ok: true }), 3500)
    return () => clearTimeout(t)
  }, [msg.text, msg.ok])

  // Close kebab menu on outside click / Escape.
  useEffect(() => {
    if (!openMenuId) return
    const onClick = () => setOpenMenuId(null)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenMenuId(null) }
    document.addEventListener('click', onClick)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('click', onClick); document.removeEventListener('keydown', onKey) }
  }, [openMenuId])

  // Dept options for the EDIT FORM dropdown — the authoritative list from
  // /api/departments (managed in /org-chart). Fall back to a seed list
  // only if the org has no departments configured yet. Also keep the
  // employee's current dept in the options even if it was removed from
  // the master list, so opening their form doesn't silently re-assign.
  const formDeptOptions = useMemo(() => {
    const names = departments.length > 0
      ? departments.map(d => d.name)
      : [...SEED_DEPARTMENTS]
    if (editEmp?.department_name && !names.includes(editEmp.department_name)) {
      names.push(editEmp.department_name)
    }
    return names
  }, [departments, editEmp])

  // Dept options for the FILTER BAR — only show depts that actually
  // appear on at least one employee, so users don't filter to an empty
  // set just because the dept exists but is unused.
  const deptOptions = useMemo(() => {
    const set = new Set<string>()
    for (const e of employees) if (e.department_name) set.add(e.department_name)
    return Array.from(set).sort()
  }, [employees])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = employees.filter(e => {
      if (q && !`${e.first_name} ${e.last_name} ${e.email} ${e.employee_id}`.toLowerCase().includes(q)) return false
      if (roleFilter && e.role !== roleFilter) return false
      if (deptFilter && (e.department_name || '') !== deptFilter) return false
      if (statusFilter === 'active' && !e.is_active) return false
      if (statusFilter === 'inactive' && e.is_active) return false
      return true
    })
    const cmp = (a: Employee, b: Employee): number => {
      const dir = sortDir === 'asc' ? 1 : -1
      switch (sortKey) {
        case 'employee_id':
          return (a.employee_id || '').localeCompare(b.employee_id || '', 'th') * dir
        case 'name':
          return `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`, 'th') * dir
        case 'department_name':
          return (a.department_name || '').localeCompare(b.department_name || '', 'th') * dir
        case 'role':
          return ((ROLE_ORDER[a.role] ?? 99) - (ROLE_ORDER[b.role] ?? 99)) * dir
        case 'is_active':
          return ((b.is_active ? 1 : 0) - (a.is_active ? 1 : 0)) * dir
      }
    }
    return [...filtered].sort(cmp)
  }, [employees, search, roleFilter, deptFilter, statusFilter, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const clearFilters = () => { setSearch(''); setRoleFilter(''); setDeptFilter(''); setStatusFilter('') }
  const hasFilter = !!(search || roleFilter || deptFilter || statusFilter)

  const resetForm = () => {
    // Default new-employee dept to the first real dept from the loaded
    // list so we don't submit a stale 'IT' that may not exist anymore.
    const defaultDept = departments[0]?.name || SEED_DEPARTMENTS[0]
    setForm({ firstName: '', lastName: '', email: '', employeeId: '',
      position: '', positionId: '', department: defaultDept, role: 'employee',
      baseSalary: '', password: '', confirmPassword: '' })
    setEditEmp(null)
    setShowForm(false)
  }

  const openPwForm = (empId: string) => {
    setPwForm({ newPassword: '', confirmPassword: '', showPw: false })
    setShowPwForm(empId)
  }
  const closePwForm = () => {
    setShowPwForm(null)
    setPwForm({ newPassword: '', confirmPassword: '', showPw: false })
  }

  const handleSubmit = async () => {
    if (!form.firstName || !form.lastName || !form.email || !form.employeeId) {
      setMsg({ text: 'กรุณากรอกข้อมูลให้ครบ', ok: false }); return
    }
    if (!editEmp && form.password !== form.confirmPassword) {
      setMsg({ text: 'รหัสผ่านไม่ตรงกัน', ok: false }); return
    }
    if (!editEmp && form.password.length < 6) {
      setMsg({ text: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัว', ok: false }); return
    }

    setLoading(true)
    try {
      if (editEmp) {
        await api.patch(`/employees/${editEmp.id}`, {
          firstName: form.firstName, lastName: form.lastName,
          // positionId is canonical — backend resolves the name and writes
          // both position_id and the legacy position text in sync. Empty
          // string clears both. Only sent when changed from the loaded
          // value to avoid stomping a still-valid legacy text-only row.
          ...(form.positionId !== (editEmp.position_id || '')
            ? { positionId: form.positionId || null }
            : {}),
          department: form.department,
          baseSalary: parseFloat(form.baseSalary) || 0,
          role: form.role,
          // Only send employeeId if HR actually changed it, so a no-op
          // PATCH doesn't trigger the rename branch on the backend.
          ...(form.employeeId !== editEmp.employee_id ? { employeeId: form.employeeId.trim() } : {}),
        })
        setMsg({ text: 'อัปเดตข้อมูลพนักงานแล้ว', ok: true })
      } else {
        await api.post('/employees/create', {
          firstName: form.firstName, lastName: form.lastName,
          email: form.email, employeeId: form.employeeId,
          ...(form.positionId ? { positionId: form.positionId } : {}),
          department: form.department,
          role: form.role,
          baseSalary: parseFloat(form.baseSalary) || 0,
          password: form.password,
        })
        setMsg({ text: `สร้างบัญชี ${form.firstName} ${form.lastName} สำเร็จ`, ok: true })
      }
      resetForm()
      load()
    } catch (e: any) {
      setMsg({ text: e.response?.data?.message || 'เกิดข้อผิดพลาด', ok: false })
    } finally { setLoading(false) }
  }

  const handleEdit = (emp: Employee) => {
    setEditEmp(emp)
    setForm({
      firstName: emp.first_name, lastName: emp.last_name,
      email: emp.email, employeeId: emp.employee_id,
      position: emp.position || '',
      positionId: emp.position_id || '',
      department: emp.department_name || 'IT',
      role: emp.role,
      baseSalary: String(emp.base_salary || ''), password: '', confirmPassword: '',
    })
    setShowForm(true)
    // Scroll form into view in case the user is far down the list.
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50)
  }

  const handleToggleActive = async (emp: Employee) => {
    try {
      await api.patch(`/employees/${emp.id}/toggle-active`)
      setMsg({ text: emp.is_active ? `ระงับบัญชี ${emp.first_name} แล้ว` : `เปิดใช้งาน ${emp.first_name} แล้ว`, ok: true })
      load()
    } catch (e: any) {
      setMsg({ text: e.response?.data?.message || 'เปลี่ยนสถานะไม่สำเร็จ', ok: false })
    }
  }

  const handleResetPassword = async (empId: string) => {
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setMsg({ text: 'รหัสผ่านไม่ตรงกัน', ok: false }); return
    }
    if (pwForm.newPassword.length < 6) {
      setMsg({ text: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัว', ok: false }); return
    }
    try {
      await api.patch(`/employees/${empId}/reset-password`, { newPassword: pwForm.newPassword })
      setMsg({ text: 'รีเซ็ตรหัสผ่านสำเร็จ', ok: true })
      closePwForm()
    } catch (e: any) {
      setMsg({ text: e.response?.data?.message || 'เกิดข้อผิดพลาด', ok: false })
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-[#111110]">จัดการพนักงาน</h1>
          <p className="text-sm text-gray-500 mt-0.5 truncate">
            {companyName ? `${companyName} · ` : ''}{employees.length} คน
            {hasFilter && visible.length !== employees.length && (
              <span className="text-gray-400"> (แสดง {visible.length})</span>
            )}
          </p>
        </div>
        {isHR && (
          <button onClick={() => { resetForm(); setShowForm(true) }} className="btn btn-primary">
            <IconUserPlus size={16} /> เพิ่มพนักงาน
          </button>
        )}
      </div>

      {/* Message */}
      {msg.text && (
        <div className={clsx('flex items-center gap-2 p-3 rounded-[10px] text-sm mb-4',
          msg.ok ? 'bg-[#E1F5EE] text-[#085041]' : 'bg-red-50 text-red-600')}>
          {msg.ok ? <IconCheck size={15} /> : <IconX size={15} />}
          {msg.text}
          <button onClick={() => setMsg({ text: '', ok: true })} className="ml-auto" aria-label="ปิด">
            <IconX size={13} />
          </button>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="text-sm font-semibold">
              {editEmp ? `แก้ไขข้อมูล — ${editEmp.first_name} ${editEmp.last_name}` : 'เพิ่มพนักงานใหม่'}
            </h2>
            {/* Email is the login identity and stays immutable, shown as a
                read-only chip. employee_id (the human code) lives inside
                the editable grid below. */}
            {editEmp && (
              <span className="px-2 py-1 rounded-md bg-gray-100 text-xs text-gray-700">
                {editEmp.email}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="label">ชื่อ *</label>
              <input className="input" value={form.firstName}
                onChange={e => setForm(p => ({ ...p, firstName: e.target.value }))}
                placeholder="ชื่อจริง" />
            </div>
            <div>
              <label className="label">นามสกุล *</label>
              <input className="input" value={form.lastName}
                onChange={e => setForm(p => ({ ...p, lastName: e.target.value }))}
                placeholder="นามสกุล" />
            </div>
            {/* Email is the login identity → only editable when creating
                a brand-new account. employee_id (display code) IS editable
                in both modes — backend updates users.employee_id +
                employees.employee_id together in a transaction. */}
            {!editEmp && (
              <div>
                <label className="label">อีเมล *</label>
                <input className="input" type="email" value={form.email}
                  onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                  placeholder="email@company.co.th" />
              </div>
            )}
            <div>
              <label className="label">รหัสพนักงาน *</label>
              <input
                className="input font-mono"
                value={form.employeeId}
                onChange={e => setForm(p => ({ ...p, employeeId: e.target.value }))}
                placeholder="EMP-001"
              />
            </div>
            <div>
              <label className="label">ตำแหน่ง</label>
              <select className="input" value={form.positionId}
                onChange={e => setForm(p => ({ ...p, positionId: e.target.value }))}>
                <option value="">— ไม่ระบุ —</option>
                {positions.map(pos => (
                  <option key={pos.id} value={pos.id}>{pos.name}</option>
                ))}
              </select>
              {/* Legacy free-text position that didn't match a positions
                  tree entry on backfill. Shown as a hint so HR can see
                  what was there before picking a structured one. */}
              {editEmp && !form.positionId && form.position && (
                <p className="text-[10px] text-gray-400 mt-1">เดิม: {form.position}</p>
              )}
              {positions.length === 0 && (
                <p className="text-[10px] text-gray-400 mt-1">
                  ยังไม่มีตำแหน่ง — สร้างใน <Link href="/org-chart" className="text-[#1D9E75] hover:underline">โครงสร้างตำแหน่ง</Link>
                </p>
              )}
            </div>
            <div>
              <label className="label">แผนก</label>
              <select className="input" value={form.department}
                onChange={e => setForm(p => ({ ...p, department: e.target.value }))}>
                {formDeptOptions.length === 0 && <option value="">— ไม่มีแผนก —</option>}
                {formDeptOptions.map(d => <option key={d}>{d}</option>)}
              </select>
              {departments.length === 0 && (
                <p className="text-[10px] text-gray-400 mt-1">
                  ยังไม่ได้เพิ่มแผนกใน <Link href="/org-chart" className="text-[#1D9E75] hover:underline">หน้าแผนผัง</Link>
                </p>
              )}
            </div>
            <div>
              <label className="label">สิทธิ์การใช้งาน</label>
              <select className="input" value={form.role}
                onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
                disabled={!isOwner}>
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">เงินเดือนฐาน (บาท)</label>
              <input className="input" type="number" value={form.baseSalary}
                onChange={e => setForm(p => ({ ...p, baseSalary: e.target.value }))}
                placeholder="0" />
            </div>
          </div>

          {editEmp && (
            <p className="text-[11px] text-gray-400 -mt-1 mb-3">
              ต้องการแก้ที่อยู่ / บัญชีธนาคาร / ข้อมูลส่วนตัวเพิ่ม → ใช้
              <Link href={`/employees/${editEmp.id}`} className="text-[#1D9E75] hover:underline mx-1">หน้าข้อมูลเต็ม</Link>
              จัดกะ → ใช้
              <Link href="/shifts" className="text-[#1D9E75] hover:underline ml-1">หน้าจัดกะ</Link>
            </p>
          )}

          {!editEmp && (
            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-black/[0.06]">
              <div>
                <label className="label">รหัสผ่าน *</label>
                <input className="input" type="password" autoComplete="new-password" value={form.password}
                  onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                  placeholder="อย่างน้อย 6 ตัว" />
              </div>
              <div>
                <label className="label">ยืนยันรหัสผ่าน *</label>
                <input className="input" type="password" autoComplete="new-password" value={form.confirmPassword}
                  onChange={e => setForm(p => ({ ...p, confirmPassword: e.target.value }))}
                  placeholder="พิมพ์อีกครั้ง" />
              </div>
            </div>
          )}

          <div className="flex gap-2 mt-4">
            <button onClick={handleSubmit} disabled={loading} className="btn btn-primary">
              {loading ? 'กำลังบันทึก...' : editEmp ? 'บันทึกการแก้ไข' : 'สร้างบัญชี'}
            </button>
            <button onClick={resetForm} className="btn">ยกเลิก</button>
          </div>
        </div>
      )}

      {/* Filters bar */}
      <div className="card mb-4 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <IconSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            {/* type="search" + autoComplete=off + a non-email name so Chrome
                doesn't try to autofill it as a username when the inline
                reset-password row mounts elsewhere on the page. */}
            <input
              type="search"
              name="employee-list-search"
              autoComplete="off"
              className="input pl-9 py-2 text-sm"
              placeholder="ค้นหาชื่อ, อีเมล, รหัส…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select className="input py-2 text-sm w-auto min-w-[120px]" value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}>
            <option value="">ทุกสิทธิ์</option>
            {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <select className="input py-2 text-sm w-auto min-w-[120px]" value={deptFilter}
            onChange={e => setDeptFilter(e.target.value)}>
            <option value="">ทุกแผนก</option>
            {deptOptions.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select className="input py-2 text-sm w-auto min-w-[110px]" value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}>
            <option value="">ทุกสถานะ</option>
            <option value="active">ใช้งาน</option>
            <option value="inactive">ระงับ</option>
          </select>
          {hasFilter && (
            <button onClick={clearFilters} className="btn btn-ghost text-xs text-gray-500">
              <IconFilter size={13} /> ล้างตัวกรอง
            </button>
          )}
        </div>
      </div>

      {/* Employee list. Outer card uses overflow-visible so the kebab menu
          can escape its bounds; horizontal overflow is handled by letting
          the page itself scroll on small viewports (the table's only 6
          columns, fits comfortably on desktop). */}
      <div className="card p-0 overflow-visible">
        <div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/[0.06] bg-gray-50/60">
                <SortHeader label="รหัส"           col="employee_id"     sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} className="w-24" />
                <SortHeader label="ชื่อ"           col="name"            sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                <SortHeader label="แผนก/ตำแหน่ง"   col="department_name" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                <SortHeader label="สิทธิ์"         col="role"            sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                <SortHeader label="สถานะ"          col="is_active"       sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                <th className="text-right py-2.5 px-3 text-xs text-gray-500 font-medium w-12">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-10 text-gray-400">
                  {employees.length === 0 ? 'ยังไม่มีพนักงาน' : 'ไม่พบที่ตรงกับตัวกรอง'}
                </td></tr>
              ) : visible.map(emp => (
                <Fragment key={emp.id}>
                  <tr className="border-b border-black/[0.04] hover:bg-gray-50/60">
                    <td className="py-3 px-3 text-xs text-gray-500 font-mono">{emp.employee_id}</td>
                    <td className="py-3 px-3">
                      <Link href={`/employees/${emp.id}`}
                        className="flex items-center gap-3 group">
                        <EmployeeAvatar person={emp} size={32} />
                        <div className="min-w-0">
                          <div className="font-medium text-[#111110] group-hover:text-[#1D9E75] truncate">
                            {emp.first_name} {emp.last_name}
                          </div>
                          <div className="text-xs text-gray-500 truncate">{emp.email}</div>
                        </div>
                      </Link>
                    </td>
                    <td className="py-3 px-3 text-xs">
                      {emp.department_name || emp.position ? (
                        <>
                          <div className="text-[#111110]">{emp.department_name || <span className="text-gray-300">—</span>}</div>
                          <div className="text-gray-400">{emp.position || <span className="text-gray-300">—</span>}</div>
                        </>
                      ) : (
                        <span className="text-gray-400 italic">ยังไม่ระบุ</span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <span className={clsx('badge', ROLE_BADGE[emp.role] || 'badge-gray')}>
                        {ROLE_TH[emp.role] || emp.role}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span className={clsx('badge', emp.is_active ? 'badge-green' : 'badge-red')}>
                        {emp.is_active ? 'ใช้งาน' : 'ระงับ'}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right relative">
                      <button
                        onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === emp.id ? null : emp.id) }}
                        className="btn btn-ghost p-1.5 rounded-lg"
                        aria-label="เมนูจัดการ"
                      >
                        <IconDotsVertical size={15} />
                      </button>
                      {openMenuId === emp.id && (
                        <ActionMenu
                          emp={emp}
                          isHR={isHR}
                          isOwner={!!isOwner}
                          onView={() => setOpenMenuId(null)}
                          onEdit={() => { setOpenMenuId(null); handleEdit(emp) }}
                          onResetPw={() => { setOpenMenuId(null); openPwForm(emp.id) }}
                          onToggleActive={() => { setOpenMenuId(null); handleToggleActive(emp) }}
                        />
                      )}
                    </td>
                  </tr>
                  {showPwForm === emp.id && (
                    <tr className="bg-[#EEEDFE]/30 border-b border-black/[0.04]">
                      <td colSpan={6} className="px-3 py-3">
                        {/* Wrap in <form autoComplete="off"> + use
                            autoComplete="new-password" on the password
                            fields so Chrome doesn't try to autofill the
                            search bar at the top of the page with the
                            currently-logged-in user's saved credentials
                            (which would hijack the filter to just owner's
                            own row). The off-screen username hint also
                            tells Chrome who this form is for. */}
                        <form
                          autoComplete="off"
                          onSubmit={e => { e.preventDefault(); handleResetPassword(emp.id) }}
                          className="flex items-center gap-3 flex-wrap"
                        >
                          <input
                            type="text"
                            name="username"
                            autoComplete="username"
                            value={emp.email}
                            readOnly
                            tabIndex={-1}
                            aria-hidden="true"
                            style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
                          />
                          <span className="text-xs font-medium text-[#3C3489]">
                            รีเซ็ตรหัสผ่าน: {emp.first_name} {emp.last_name}
                          </span>
                          <div className="relative">
                            <input
                              type={pwForm.showPw ? 'text' : 'password'}
                              name="new-password"
                              autoComplete="new-password"
                              className="input py-1.5 text-xs pr-8 w-48"
                              placeholder="รหัสผ่านใหม่"
                              value={pwForm.newPassword}
                              onChange={e => setPwForm(p => ({ ...p, newPassword: e.target.value }))}
                            />
                            <button type="button" onClick={() => setPwForm(p => ({ ...p, showPw: !p.showPw }))}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400">
                              {pwForm.showPw ? <IconEyeOff size={13} /> : <IconEye size={13} />}
                            </button>
                          </div>
                          <input
                            type={pwForm.showPw ? 'text' : 'password'}
                            name="confirm-password"
                            autoComplete="new-password"
                            className="input py-1.5 text-xs w-48"
                            placeholder="ยืนยันรหัสผ่าน"
                            value={pwForm.confirmPassword}
                            onChange={e => setPwForm(p => ({ ...p, confirmPassword: e.target.value }))}
                          />
                          <button type="submit" className="btn btn-primary py-1.5 text-xs">
                            บันทึก
                          </button>
                          <button type="button" onClick={closePwForm} className="btn py-1.5 text-xs">
                            ยกเลิก
                          </button>
                        </form>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/* ===== Sortable header cell ===== */
function SortHeader({
  label, col, sortKey, sortDir, onToggle, className,
}: {
  label: string
  col: SortKey
  sortKey: SortKey
  sortDir: SortDir
  onToggle: (k: SortKey) => void
  className?: string
}) {
  const active = sortKey === col
  return (
    <th className={clsx('text-left py-2.5 px-3 text-xs text-gray-500 font-medium select-none', className)}>
      <button
        onClick={() => onToggle(col)}
        className={clsx(
          'inline-flex items-center gap-1 hover:text-[#111110] transition-colors',
          active && 'text-[#111110]'
        )}
      >
        {label}
        {active
          ? (sortDir === 'asc' ? <IconArrowUp size={11} /> : <IconArrowDown size={11} />)
          : <IconArrowsSort size={11} className="text-gray-300" />}
      </button>
    </th>
  )
}

/* ===== Kebab action menu ===== */
function ActionMenu({
  emp, isHR, isOwner, onView, onEdit, onResetPw, onToggleActive,
}: {
  emp: Employee
  isHR: boolean
  isOwner: boolean
  onView: () => void
  onEdit: () => void
  onResetPw: () => void
  onToggleActive: () => void
}) {
  return (
    <div
      className="absolute right-2 top-full mt-1 z-20 bg-white border border-black/[0.08] rounded-[10px] shadow-md py-1 min-w-[180px] text-left"
      onClick={e => e.stopPropagation()}
    >
      <Link
        href={`/employees/${emp.id}`}
        onClick={onView}
        className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
      >
        <IconUserCircle size={14} className="text-gray-400" />
        ดูข้อมูลเต็ม
      </Link>
      {isHR && (
        <button
          onClick={onEdit}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          <IconEdit size={14} className="text-gray-400" />
          แก้ไขด่วน
        </button>
      )}
      {isOwner && (
        <button
          onClick={onResetPw}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          <IconKey size={14} className="text-gray-400" />
          รีเซ็ตรหัสผ่าน
        </button>
      )}
      {isOwner && (
        <>
          <div className="border-t border-black/[0.06] my-1" />
          <button
            onClick={onToggleActive}
            className={clsx(
              'w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50',
              emp.is_active ? 'text-red-600' : 'text-[#085041]'
            )}
          >
            {emp.is_active
              ? <><IconPlayerPause size={14} /> ระงับบัญชี</>
              : <><IconPlayerPlay size={14} /> เปิดใช้งาน</>}
          </button>
        </>
      )}
    </div>
  )
}
