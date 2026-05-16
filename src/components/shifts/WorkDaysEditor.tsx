'use client'
import { useEffect, useMemo, useState } from 'react'
import { employeeApi, WorkDaysBulkItem } from '@/lib/api'
import {
  IconCalendarOff, IconCheck, IconX,
  IconDeviceFloppy, IconRefresh
} from '@tabler/icons-react'
import clsx from 'clsx'

interface Employee {
  id: string
  first_name: string
  last_name: string
  nickname?: string
  role: string
  department_name?: string
  is_active: boolean
  work_days?: number[]
}

// JS Date.getDay(): 0=Sun, 1=Mon, ..., 6=Sat
const DAYS: { num: number; label: string; short: string }[] = [
  { num: 1, label: 'จันทร์', short: 'จ' },
  { num: 2, label: 'อังคาร', short: 'อ' },
  { num: 3, label: 'พุธ', short: 'พ' },
  { num: 4, label: 'พฤหัสบดี', short: 'พฤ' },
  { num: 5, label: 'ศุกร์', short: 'ศ' },
  { num: 6, label: 'เสาร์', short: 'ส' },
  { num: 0, label: 'อาทิตย์', short: 'อา' },
]

export default function WorkDaysEditor() {
  const [employees, setEmployees] = useState<Employee[]>([])
  // pending[empId] = next work_days for that employee (number[])
  const [pending, setPending] = useState<Record<string, number[]>>({})
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState({ text: '', ok: true })

  const load = async () => {
    setLoading(true)
    try {
      const res = await employeeApi.list()
      const all: Employee[] = res.data.data || []
      // Owners don't have work days
      setEmployees(all.filter(e => e.role !== 'owner' && e.is_active !== false))
      setPending({})
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const getDays = (emp: Employee): number[] => {
    if (pending[emp.id]) return pending[emp.id]
    return Array.isArray(emp.work_days) ? emp.work_days : [1, 2, 3, 4, 5]
  }

  const isWorkDay = (emp: Employee, dayNum: number): boolean => {
    return getDays(emp).includes(dayNum)
  }

  const toggle = (emp: Employee, dayNum: number) => {
    const current = getDays(emp)
    const original = Array.isArray(emp.work_days) ? emp.work_days : [1, 2, 3, 4, 5]
    const next = current.includes(dayNum)
      ? current.filter(d => d !== dayNum)
      : [...current, dayNum].sort((a, b) => a - b)
    // If next matches original exactly, remove from pending
    setPending(p => {
      const updated = { ...p }
      const sameAsOriginal =
        next.length === original.length &&
        next.every((v, i) => v === [...original].sort((a, b) => a - b)[i])
      if (sameAsOriginal) {
        delete updated[emp.id]
      } else {
        updated[emp.id] = next
      }
      return updated
    })
  }

  const setPreset = (emp: Employee, preset: 'mon-fri' | 'mon-sat' | 'all' | 'none') => {
    const map = {
      'mon-fri': [1, 2, 3, 4, 5],
      'mon-sat': [1, 2, 3, 4, 5, 6],
      'all':     [0, 1, 2, 3, 4, 5, 6],
      'none':    [],
    }
    setPending(p => ({ ...p, [emp.id]: map[preset] }))
  }

  const hasChanges = Object.keys(pending).length > 0

  const save = async () => {
    if (!hasChanges) return
    setLoading(true)
    setMsg({ text: '', ok: true })
    try {
      const items: WorkDaysBulkItem[] = Object.entries(pending).map(([employeeId, workDays]) => ({
        employeeId,
        workDays,
      }))
      await employeeApi.bulkUpdateWorkDays(items)
      setMsg({ text: `บันทึก ${items.length} คนแล้ว`, ok: true })
      load()
    } catch (e: any) {
      setMsg({ text: e.response?.data?.message || 'เกิดข้อผิดพลาด', ok: false })
    } finally { setLoading(false) }
  }

  const discard = () => {
    setPending({})
    setMsg({ text: '', ok: true })
  }

  return (
    <div>
      <div className="text-xs text-gray-500 mb-3 flex items-center gap-3 flex-wrap">
        <span className="text-gray-400">คำอธิบาย:</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-5 h-5 rounded inline-flex items-center justify-center bg-[#E1F5EE]">
            <IconCheck size={12} className="text-[#085041]" />
          </span>
          วันทำงาน
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-5 h-5 rounded inline-flex items-center justify-center bg-[#FCEBEB]">
            <IconCalendarOff size={11} className="text-[#791F1F]" />
          </span>
          วันหยุดพนักงาน
        </span>
        <span className="text-gray-400">— กดที่ช่องเพื่อสลับ</span>
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

      {/* Grid */}
      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-black/[0.06]">
              <th className="sticky left-0 bg-gray-50 text-left px-3 py-2.5 text-xs font-medium text-gray-500 min-w-[220px]">
                พนักงาน
              </th>
              {DAYS.map(d => {
                const isWeekend = d.num === 0 || d.num === 6
                return (
                  <th key={d.num}
                    className={clsx('text-center px-2 py-2.5 text-xs font-medium min-w-[90px]',
                      isWeekend ? 'text-gray-400' : 'text-gray-600')}
                  >
                    {d.label}
                  </th>
                )
              })}
              <th className="px-3 py-2.5 text-xs font-medium text-gray-500 min-w-[180px]">รูปแบบ</th>
            </tr>
          </thead>
          <tbody>
            {employees.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-10 text-sm text-gray-400">
                  {loading ? 'กำลังโหลด...' : 'ยังไม่มีพนักงาน'}
                </td>
              </tr>
            ) : employees.map(emp => {
              const isPending = pending[emp.id] !== undefined
              return (
                <tr key={emp.id} className={clsx(
                  'border-b border-black/[0.04] hover:bg-gray-50/40',
                  isPending && 'bg-[#FFFBEA]/40'
                )}>
                  <td className="sticky left-0 bg-white px-3 py-2 min-w-[220px]">
                    <div className="text-sm font-medium text-[#111110]">
                      {emp.first_name} {emp.last_name}
                      {emp.nickname && <span className="text-gray-400 font-normal ml-1">({emp.nickname})</span>}
                    </div>
                    <div className="text-[11px] text-gray-400">
                      {emp.department_name || '—'}
                    </div>
                  </td>
                  {DAYS.map(d => {
                    const isWork = isWorkDay(emp, d.num)
                    return (
                      <td key={d.num} className="px-2 py-2 text-center align-middle">
                        <button
                          onClick={() => toggle(emp, d.num)}
                          className={clsx(
                            'inline-flex flex-col items-center justify-center gap-0.5 w-full px-2 py-1.5 rounded-md text-[10px] font-medium transition-all',
                            isWork
                              ? 'bg-[#E1F5EE] text-[#085041] hover:bg-[#D5EFE6]'
                              : 'bg-[#FCEBEB] text-[#791F1F] hover:bg-[#F8DDDD]'
                          )}
                          title={isWork ? 'วันทำงาน — กดเพื่อเปลี่ยนเป็นหยุด' : 'วันหยุดพนักงาน — กดเพื่อเปลี่ยนเป็นทำงาน'}
                        >
                          {isWork ? <IconCheck size={11} /> : <IconCalendarOff size={11} />}
                          {isWork ? 'วันทำงาน' : 'วันหยุด'}
                        </button>
                      </td>
                    )
                  })}
                  <td className="px-2 py-2">
                    <div className="flex flex-wrap gap-1">
                      <button onClick={() => setPreset(emp, 'mon-fri')}
                        className="text-[10px] px-1.5 py-0.5 rounded border border-black/[0.08] text-gray-600 hover:bg-gray-50">
                        จ-ศ
                      </button>
                      <button onClick={() => setPreset(emp, 'mon-sat')}
                        className="text-[10px] px-1.5 py-0.5 rounded border border-black/[0.08] text-gray-600 hover:bg-gray-50">
                        จ-ส
                      </button>
                      <button onClick={() => setPreset(emp, 'all')}
                        className="text-[10px] px-1.5 py-0.5 rounded border border-black/[0.08] text-gray-600 hover:bg-gray-50">
                        ทุกวัน
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Save bar */}
      {hasChanges && (
        <div className="sticky bottom-4 mt-4 flex justify-end">
          <div className="card flex items-center gap-3 shadow-md">
            <span className="text-sm text-gray-600">
              มีการเปลี่ยนแปลง {Object.keys(pending).length} คน
            </span>
            <button onClick={discard} className="btn text-xs">
              <IconRefresh size={13} /> ยกเลิก
            </button>
            <button onClick={save} disabled={loading} className="btn btn-primary text-xs">
              <IconDeviceFloppy size={13} /> {loading ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
