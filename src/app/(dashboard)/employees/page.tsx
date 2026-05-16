'use client'
import { useEffect, useState } from 'react'
import { useAuthStore } from '@/lib/store'
import { employeeApi } from '@/lib/api'
import api from '@/lib/api'
import {
  IconUserPlus, IconEdit, IconTrash, IconKey,
  IconCheck, IconX, IconEye, IconEyeOff, IconSearch,
  IconUserCircle
} from '@tabler/icons-react'
import clsx from 'clsx'
import Link from 'next/link'

const ROLES = [
  { value: 'owner', label: 'เจ้าของ' },
  { value: 'hr', label: 'HR Admin' },
  { value: 'employee', label: 'พนักงาน' },
]

const DEPARTMENTS = ['IT', 'HR', 'Finance', 'Operations', 'Marketing', 'ทั่วไป']
const SHIFTS = [
  { value: 'normal', label: 'กะปกติ (09:00-17:00)' },
  { value: 'flexible', label: 'Flexible Time' },
]

interface Employee {
  id: string
  user_id: string
  employee_id: string
  first_name: string
  last_name: string
  email: string
  role: string
  position: string
  department_name: string
  shift_type: string
  base_salary: number
  is_active: boolean
  account_active: boolean
  last_login_at: string
}

export default function EmployeesPage() {
  const { user } = useAuthStore()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editEmp, setEditEmp] = useState<Employee | null>(null)
  const [showPwForm, setShowPwForm] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState({ text: '', ok: true })

  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '',
    employeeId: '', position: '', department: 'IT',
    role: 'employee', shiftType: 'normal',
    baseSalary: '', password: '', confirmPassword: '',
  })

  const [pwForm, setPwForm] = useState({
    newPassword: '', confirmPassword: '', showPw: false
  })

  const isOwner = user?.role === 'owner'
  const isHR = user?.role === 'hr' || user?.role === 'owner'

  const load = async () => {
    try {
      const res = await employeeApi.list()
      setEmployees(res.data.data || [])
    } catch {}
  }

  useEffect(() => { load() }, [])

  const filtered = employees.filter(e =>
    `${e.first_name} ${e.last_name} ${e.email} ${e.employee_id}`
      .toLowerCase().includes(search.toLowerCase())
  )

  const resetForm = () => {
    setForm({ firstName: '', lastName: '', email: '', employeeId: '',
      position: '', department: 'IT', role: 'employee', shiftType: 'normal',
      baseSalary: '', password: '', confirmPassword: '' })
    setEditEmp(null)
    setShowForm(false)
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
          position: form.position, department: form.department,
          shiftType: form.shiftType, baseSalary: parseFloat(form.baseSalary) || 0,
          role: form.role,
        })
        setMsg({ text: 'อัปเดตข้อมูลพนักงานแล้ว', ok: true })
      } else {
        await api.post('/employees/create', {
          firstName: form.firstName, lastName: form.lastName,
          email: form.email, employeeId: form.employeeId,
          position: form.position, department: form.department,
          role: form.role, shiftType: form.shiftType,
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
      position: emp.position || '', department: emp.department_name || 'IT',
      role: emp.role, shiftType: emp.shift_type || 'normal',
      baseSalary: String(emp.base_salary || ''), password: '', confirmPassword: '',
    })
    setShowForm(true)
  }

  const handleToggleActive = async (emp: Employee) => {
    try {
      await api.patch(`/employees/${emp.id}/toggle-active`)
      load()
    } catch {}
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
      setShowPwForm(null)
      setPwForm({ newPassword: '', confirmPassword: '', showPw: false })
    } catch (e: any) {
      setMsg({ text: e.response?.data?.message || 'เกิดข้อผิดพลาด', ok: false })
    }
  }

  const ROLE_BADGE: Record<string, string> = {
    owner: 'badge-purple', hr: 'badge-green', employee: 'badge-blue'
  }
  const ROLE_TH: Record<string, string> = {
    owner: 'เจ้าของ', hr: 'HR', employee: 'พนักงาน'
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#111110]">จัดการพนักงาน</h1>
          <p className="text-sm text-gray-500 mt-0.5">บริษัท สิริคอนส์ คอนสตรัคชั่น จำกัด · {employees.length} คน</p>
        </div>
        {isHR && (
          <button onClick={() => { resetForm(); setShowForm(true) }} className="btn btn-primary">
            <IconUserPlus size={16} /> เพิ่มพนักงาน
          </button>
        )}
      </div>

      {/* Message */}
      {msg.text && (
        <div className={clsx('flex items-center gap-2 p-3 rounded-[10px] text-sm mb-4 animate-fade-in',
          msg.ok ? 'bg-[#E1F5EE] text-[#085041]' : 'bg-red-50 text-red-600')}>
          {msg.ok ? <IconCheck size={15} /> : <IconX size={15} />}
          {msg.text}
          <button onClick={() => setMsg({ text: '', ok: true })} className="ml-auto">
            <IconX size={13} />
          </button>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="card mb-6 animate-slide-up">
          <h2 className="text-sm font-semibold mb-4">
            {editEmp ? `แก้ไขข้อมูล — ${editEmp.first_name} ${editEmp.last_name}` : 'เพิ่มพนักงานใหม่'}
          </h2>
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
            <div>
              <label className="label">อีเมล *</label>
              <input className="input" type="email" value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                placeholder="email@company.co.th" disabled={!!editEmp} />
            </div>
            <div>
              <label className="label">รหัสพนักงาน *</label>
              <input className="input" value={form.employeeId}
                onChange={e => setForm(p => ({ ...p, employeeId: e.target.value }))}
                placeholder="EMP-001" disabled={!!editEmp} />
            </div>
            <div>
              <label className="label">ตำแหน่ง</label>
              <input className="input" value={form.position}
                onChange={e => setForm(p => ({ ...p, position: e.target.value }))}
                placeholder="เช่น Developer, บัญชี" />
            </div>
            <div>
              <label className="label">แผนก</label>
              <select className="input" value={form.department}
                onChange={e => setForm(p => ({ ...p, department: e.target.value }))}>
                {DEPARTMENTS.map(d => <option key={d}>{d}</option>)}
              </select>
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
              <label className="label">กะทำงาน</label>
              <select className="input" value={form.shiftType}
                onChange={e => setForm(p => ({ ...p, shiftType: e.target.value }))}>
                {SHIFTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">เงินเดือนฐาน (บาท)</label>
              <input className="input" type="number" value={form.baseSalary}
                onChange={e => setForm(p => ({ ...p, baseSalary: e.target.value }))}
                placeholder="0" />
            </div>
          </div>

          {/* Password fields (new employee only) */}
          {!editEmp && (
            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-black/[0.06]">
              <div>
                <label className="label">รหัสผ่าน *</label>
                <input className="input" type="password" value={form.password}
                  onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                  placeholder="อย่างน้อย 6 ตัว" />
              </div>
              <div>
                <label className="label">ยืนยันรหัสผ่าน *</label>
                <input className="input" type="password" value={form.confirmPassword}
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

      {/* Search */}
      <div className="relative mb-4">
        <IconSearch size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input className="input pl-9" placeholder="ค้นหาชื่อ, อีเมล, รหัสพนักงาน..."
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Employee list */}
      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/[0.06]">
                {['รหัส','ชื่อ-นามสกุล','อีเมล','แผนก/ตำแหน่ง','สิทธิ์','สถานะ','จัดการ'].map(h => (
                  <th key={h} className="text-left py-2.5 px-3 text-xs text-gray-500 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400">ไม่พบข้อมูล</td></tr>
              ) : filtered.map(emp => (
                <>
                <tr key={emp.id} className="border-b border-black/[0.04] hover:bg-gray-50/60">
                  <td className="py-2.5 px-3 text-xs text-gray-500">{emp.employee_id}</td>
                  <td className="py-2.5 px-3">
                    <Link href={`/employees/${emp.id}`}
                      className="font-medium text-[#111110] hover:text-[#1D9E75] hover:underline">
                      {emp.first_name} {emp.last_name}
                    </Link>
                  </td>
                  <td className="py-2.5 px-3 text-xs text-gray-500">{emp.email}</td>
                  <td className="py-2.5 px-3 text-xs">
                    <div>{emp.department_name || '—'}</div>
                    <div className="text-gray-400">{emp.position || '—'}</div>
                  </td>
                  <td className="py-2.5 px-3">
                    <span className={clsx('badge', ROLE_BADGE[emp.role] || 'badge-gray')}>
                      {ROLE_TH[emp.role] || emp.role}
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    <span className={clsx('badge', emp.is_active ? 'badge-green' : 'badge-red')}>
                      {emp.is_active ? 'ใช้งาน' : 'ระงับ'}
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="flex gap-1.5">
                      <Link href={`/employees/${emp.id}`}
                        className="btn btn-ghost p-1.5 rounded-lg" title="ดูข้อมูลเต็ม">
                        <IconUserCircle size={14} />
                      </Link>
                      {isHR && (
                        <button onClick={() => handleEdit(emp)}
                          className="btn btn-ghost p-1.5 rounded-lg" title="แก้ไขด่วน">
                          <IconEdit size={14} />
                        </button>
                      )}
                      {isOwner && (
                        <button onClick={() => setShowPwForm(showPwForm === emp.id ? null : emp.id)}
                          className="btn btn-ghost p-1.5 rounded-lg" title="รีเซ็ตรหัสผ่าน">
                          <IconKey size={14} />
                        </button>
                      )}
                      {isOwner && (
                        <button onClick={() => handleToggleActive(emp)}
                          className={clsx('btn p-1.5 rounded-lg text-xs', emp.is_active ? 'text-red-500 hover:bg-red-50' : 'text-green-600 hover:bg-green-50')}
                          title={emp.is_active ? 'ระงับบัญชี' : 'เปิดใช้งาน'}>
                          {emp.is_active ? <IconX size={14} /> : <IconCheck size={14} />}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                {/* Reset password inline form */}
                {showPwForm === emp.id && (
                  <tr key={`pw-${emp.id}`} className="bg-[#EEEDFE]/30">
                    <td colSpan={7} className="px-3 py-3">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-xs font-medium text-[#3C3489]">
                          รีเซ็ตรหัสผ่าน: {emp.first_name}
                        </span>
                        <div className="relative">
                          <input
                            type={pwForm.showPw ? 'text' : 'password'}
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
                          className="input py-1.5 text-xs w-48"
                          placeholder="ยืนยันรหัสผ่าน"
                          value={pwForm.confirmPassword}
                          onChange={e => setPwForm(p => ({ ...p, confirmPassword: e.target.value }))}
                        />
                        <button onClick={() => handleResetPassword(emp.id)} className="btn btn-primary py-1.5 text-xs">
                          บันทึก
                        </button>
                        <button onClick={() => setShowPwForm(null)} className="btn py-1.5 text-xs">
                          ยกเลิก
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
