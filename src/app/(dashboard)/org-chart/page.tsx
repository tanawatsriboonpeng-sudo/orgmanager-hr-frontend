'use client'
import { useEffect, useMemo, useState } from 'react'
import { employeeApi } from '@/lib/api'
import {
  IconCrown, IconUsers, IconUser, IconHierarchy,
  IconBuilding, IconBriefcase, IconCircleOff
} from '@tabler/icons-react'
import clsx from 'clsx'

interface Employee {
  id: string
  employee_id: string
  first_name: string
  last_name: string
  email: string
  role: 'owner' | 'hr' | 'employee' | string
  position: string
  department_name: string
  is_active: boolean
}

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
const ROLE_BG: Record<string, string> = {
  owner: '#EEEDFE',
  hr: '#E1F5EE',
  employee: '#E6F1FB',
}
const ROLE_ORDER: Record<string, number> = { owner: 0, hr: 1, employee: 2 }

function PersonCard({ emp, large = false }: { emp: Employee; large?: boolean }) {
  const color = ROLE_COLOR[emp.role] || '#6B6A66'
  const bg = ROLE_BG[emp.role] || '#F7F7F5'
  const initials = `${emp.first_name?.charAt(0) || ''}${emp.last_name?.charAt(0) || ''}`.toUpperCase()
  return (
    <div className={clsx(
      'flex items-center gap-3 p-3 rounded-[12px] border transition-all',
      emp.is_active === false
        ? 'bg-gray-50 border-black/[0.04] opacity-60'
        : 'bg-white border-black/[0.06] hover:shadow-sm',
      large && 'p-4'
    )}>
      <div
        className={clsx(
          'rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0',
          large ? 'w-12 h-12 text-base' : 'w-9 h-9 text-xs'
        )}
        style={{ background: color }}
      >
        {initials || '?'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className={clsx('font-medium text-[#111110] truncate', large ? 'text-base' : 'text-sm')}>
            {emp.first_name} {emp.last_name}
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
      </div>
    </div>
  )
}

export default function OrgChartPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [showInactive, setShowInactive] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await employeeApi.list()
      setEmployees(res.data.data || [])
    } catch {
      setEmployees([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const visible = useMemo(
    () => employees.filter(e => showInactive || e.is_active !== false),
    [employees, showInactive]
  )

  const owners = useMemo(() => visible.filter(e => e.role === 'owner'), [visible])
  const others = useMemo(() => visible.filter(e => e.role !== 'owner'), [visible])

  // Group non-owners by department
  const byDept = useMemo(() => {
    const groups: Record<string, Employee[]> = {}
    for (const emp of others) {
      const dept = emp.department_name || 'ทั่วไป'
      if (!groups[dept]) groups[dept] = []
      groups[dept].push(emp)
    }
    // Sort each department: HR first, then employees, by last name
    Object.values(groups).forEach(list =>
      list.sort((a, b) => {
        const ra = ROLE_ORDER[a.role] ?? 99
        const rb = ROLE_ORDER[b.role] ?? 99
        if (ra !== rb) return ra - rb
        return (a.first_name || '').localeCompare(b.first_name || '', 'th')
      })
    )
    // Sorted by HR-count desc, then dept name
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
            พนักงานทั้งหมด {totalActive} คน
            {totalInactive > 0 && <> · ระงับ {totalInactive} คน</>}
          </p>
        </div>
        {totalInactive > 0 && (
          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={e => setShowInactive(e.target.checked)}
              className="rounded"
            />
            แสดงพนักงานที่ระงับ
          </label>
        )}
      </div>

      {loading ? (
        <div className="card text-center py-10 text-sm text-gray-400">กำลังโหลด...</div>
      ) : visible.length === 0 ? (
        <div className="card text-center py-10">
          <IconUsers size={28} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-400">ยังไม่มีพนักงาน</p>
        </div>
      ) : (
        <>
          {/* Owners — top tier */}
          {owners.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <IconCrown size={15} className="text-[#534AB7]" />
                <h2 className="text-sm font-semibold text-[#111110]">ผู้บริหาร</h2>
                <span className="text-xs text-gray-400">({owners.length})</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {owners.map(emp => (
                  <div
                    key={emp.id}
                    className="rounded-[14px] border-2 p-1"
                    style={{ borderColor: '#EEEDFE', background: 'linear-gradient(135deg, #EEEDFE 0%, #FFFFFF 60%)' }}
                  >
                    <PersonCard emp={emp} large />
                  </div>
                ))}
              </div>

              {/* Connector line */}
              {byDept.length > 0 && (
                <div className="flex justify-center my-4">
                  <div className="w-px h-8 bg-gradient-to-b from-[#534AB7]/30 to-[#1D9E75]/30" />
                </div>
              )}
            </div>
          )}

          {/* Departments */}
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

                    {/* HR section */}
                    {hrs.length > 0 && (
                      <div className="mb-3">
                        <div className="text-[11px] font-medium text-gray-500 mb-1.5 px-1 flex items-center gap-1">
                          <IconUsers size={11} />
                          HR
                        </div>
                        <div className="space-y-1.5">
                          {hrs.map(emp => <PersonCard key={emp.id} emp={emp} />)}
                        </div>
                      </div>
                    )}

                    {/* Employees section */}
                    {emps.length > 0 && (
                      <div>
                        {hrs.length > 0 && (
                          <div className="text-[11px] font-medium text-gray-500 mb-1.5 px-1 flex items-center gap-1">
                            <IconBriefcase size={11} />
                            พนักงาน
                          </div>
                        )}
                        <div className="space-y-1.5">
                          {emps.map(emp => <PersonCard key={emp.id} emp={emp} />)}
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
    </div>
  )
}
