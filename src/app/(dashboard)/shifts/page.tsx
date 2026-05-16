'use client'
import { useEffect, useMemo, useState } from 'react'
import { employeeApi, shiftConfigApi, ShiftConfig, WeeklyShiftsBulkItem, WeeklyShifts } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import {
  IconCalendarTime,
  IconCheck, IconX, IconDeviceFloppy, IconRefresh,
  IconSettings, IconCalendarStats, IconCalendarOff
} from '@tabler/icons-react'
import clsx from 'clsx'
import ShiftRulesEditor from '@/components/shifts/ShiftRulesEditor'
import WorkDaysEditor from '@/components/shifts/WorkDaysEditor'

interface Employee {
  id: string
  first_name: string
  last_name: string
  nickname?: string
  role: string
  department_name?: string
  is_active: boolean
  weekly_shifts?: WeeklyShifts
}

// A cell value is either 'dayoff' or a shift_configs.code such as "WC001".
type ShiftValue = string

const DAYOFF_META = { color: '#791F1F', bg: '#FCEBEB' }

function configMeta(code: string, configs: ShiftConfig[]) {
  if (code === 'dayoff' || !code) return DAYOFF_META
  const cfg = configs.find(c => c.code === code)
  if (!cfg) return { color: '#534AB7', bg: '#EEEDFE' }
  if (cfg.shift_type === 'flexible') return { color: '#633806', bg: '#FAEEDA' }
  return { color: '#0C447C', bg: '#E6F1FB' }
}

// Days ordered จันทร์→อาทิตย์ (Mon first, matches Thai work-week convention)
const WEEK_DAYS: { num: number; label: string; short: string }[] = [
  { num: 1, label: 'จันทร์', short: 'จ' },
  { num: 2, label: 'อังคาร', short: 'อ' },
  { num: 3, label: 'พุธ', short: 'พ' },
  { num: 4, label: 'พฤหัสบดี', short: 'พฤ' },
  { num: 5, label: 'ศุกร์', short: 'ศ' },
  { num: 6, label: 'เสาร์', short: 'ส' },
  { num: 0, label: 'อาทิตย์', short: 'อา' },
]

export default function ShiftsPage() {
  const { user } = useAuthStore()
  const isHR = user?.role === 'hr' || user?.role === 'owner'
  const isOwner = user?.role === 'owner'

  const [tab, setTab] = useState<'schedule' | 'rules' | 'workdays'>('schedule')

  if (!isHR) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="card text-center py-10">
          <IconCalendarTime size={28} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-500">หน้านี้สำหรับ HR/เจ้าของเท่านั้น</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-[#111110] flex items-center gap-2">
          <IconCalendarTime size={20} className="text-[#1D9E75]" />
          กะการทำงาน
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {tab === 'schedule' && 'กำหนดกะของพนักงานรายวัน — ค่าว่างจะใช้กะเริ่มต้นของพนักงานคนนั้น'}
          {tab === 'rules' && 'ตั้งค่ารายละเอียดของแต่ละกะ — เวลาเริ่ม/เลิก เกณฑ์สาย/ขาด'}
          {tab === 'workdays' && 'กำหนดวันทำงาน/วันหยุดประจำของแต่ละพนักงาน — รูปแบบรายสัปดาห์'}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-black/[0.06] overflow-x-auto">
        <TabButton active={tab === 'schedule'} onClick={() => setTab('schedule')} icon={IconCalendarStats}>
          ตารางรายสัปดาห์
        </TabButton>
        <TabButton active={tab === 'workdays'} onClick={() => setTab('workdays')} icon={IconCalendarOff}>
          วันทำงาน-วันหยุด
        </TabButton>
        <TabButton active={tab === 'rules'} onClick={() => setTab('rules')} icon={IconSettings}>
          ตั้งค่ากะ
        </TabButton>
      </div>

      {tab === 'rules' && <ShiftRulesEditor isOwner={isOwner} />}
      {tab === 'workdays' && <WorkDaysEditor />}
      {tab === 'schedule' && <ScheduleTab />}
    </div>
  )
}

function TabButton({
  active, onClick, icon: Icon, children,
}: { active: boolean; onClick: () => void; icon: any; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
        active
          ? 'border-[#1D9E75] text-[#085041]'
          : 'border-transparent text-gray-500 hover:text-gray-700'
      )}
    >
      <span className="inline-flex items-center gap-1.5">
        <Icon size={14} />
        {children}
      </span>
    </button>
  )
}

function ScheduleTab() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [configs, setConfigs] = useState<ShiftConfig[]>([])
  // pending[empId][dayNum] = new value for that cell.
  const [pending, setPending] = useState<Record<string, WeeklyShifts>>({})
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState({ text: '', ok: true })

  const load = async () => {
    setLoading(true)
    try {
      const [eRes, cRes] = await Promise.allSettled([
        employeeApi.list(),
        shiftConfigApi.list(),
      ])
      if (eRes.status === 'fulfilled') {
        const all: Employee[] = eRes.value.data.data || []
        setEmployees(all.filter(e => e.role !== 'owner' && e.is_active !== false))
      }
      if (cRes.status === 'fulfilled') {
        setConfigs((cRes.value.data.data || []).filter((c: ShiftConfig) => c.is_active !== false))
      }
      setPending({})
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  // Default value if nothing is set: 'dayoff'
  const cellValue = (emp: Employee, dayNum: number): ShiftValue => {
    const key = String(dayNum)
    if (pending[emp.id] && pending[emp.id][key] !== undefined) return pending[emp.id][key]
    const saved = emp.weekly_shifts || {}
    return saved[key] || 'dayoff'
  }

  const setCell = (emp: Employee, dayNum: number, value: ShiftValue) => {
    setPending(prev => {
      const empWeek = { ...(prev[emp.id] || {}) }
      empWeek[String(dayNum)] = value
      return { ...prev, [emp.id]: empWeek }
    })
  }

  const totalChanges = useMemo(() => {
    let n = 0
    for (const w of Object.values(pending)) n += Object.keys(w).length
    return n
  }, [pending])

  const save = async () => {
    if (totalChanges === 0) return
    setLoading(true)
    setMsg({ text: '', ok: true })
    try {
      const items: WeeklyShiftsBulkItem[] = Object.entries(pending).map(([empId, week]) => {
        // Merge with existing saved schedule so we don't drop other days
        const emp = employees.find(e => e.id === empId)
        const saved = emp?.weekly_shifts || {}
        return { employeeId: empId, weeklyShifts: { ...saved, ...week } }
      })
      await employeeApi.bulkUpdateWeeklyShifts(items)
      setMsg({ text: `บันทึก ${items.length} คนแล้ว`, ok: true })
      load()
    } catch (e: any) {
      setMsg({ text: e.response?.data?.message || 'เกิดข้อผิดพลาด', ok: false })
    } finally { setLoading(false) }
  }

  const discardChanges = () => {
    setPending({})
    setMsg({ text: '', ok: true })
  }

  return (
    <>
      <div className="text-xs text-gray-500 mb-2">
        รูปแบบกะรายสัปดาห์ — ใช้ทุกสัปดาห์เหมือนกัน
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

      {/* Legend */}
      <div className="flex items-center gap-3 mb-3 text-xs text-gray-500 flex-wrap">
        <span className="text-gray-400">คำอธิบาย:</span>
        {configs.length === 0 && (
          <span className="text-amber-600 inline-flex items-center gap-1.5">
            ⚠ ยังไม่มีกะใน &quot;ตั้งค่ากะ&quot; — สร้างกะก่อนเพื่อเลือก
          </span>
        )}
        {configs.map(c => {
          const m = configMeta(c.code || '', configs)
          return (
            <span key={c.id} className="inline-flex items-center gap-1.5">
              <span
                className="inline-flex items-center justify-center min-w-[24px] h-5 px-1 rounded text-[10px] font-medium"
                style={{ background: m.bg, color: m.color }}
              >
                {c.code || c.name.slice(0, 4)}
              </span>
              <span className="text-gray-500">{c.name}</span>
            </span>
          )
        })}
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-medium"
            style={{ background: DAYOFF_META.bg, color: DAYOFF_META.color }}>—</span>
          วันหยุด
        </span>
      </div>

      {/* Grid */}
      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-black/[0.06]">
              <th className="sticky left-0 bg-gray-50 text-left px-3 py-2.5 text-xs font-medium text-gray-500 min-w-[220px]">
                พนักงาน
              </th>
              {WEEK_DAYS.map(d => {
                const isWeekend = d.num === 0 || d.num === 6
                return (
                  <th key={d.num} className={clsx(
                    'text-center px-2 py-2.5 text-xs font-medium min-w-[110px]',
                    isWeekend ? 'text-gray-400' : 'text-gray-600'
                  )}>
                    {d.label}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {employees.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-10 text-sm text-gray-400">
                  {loading ? 'กำลังโหลด...' : 'ยังไม่มีพนักงาน (หรือมีแต่เจ้าของเท่านั้น)'}
                </td>
              </tr>
            ) : employees.map(emp => {
              const empPending = pending[emp.id] || {}
              const hasPending = Object.keys(empPending).length > 0
              return (
                <tr key={emp.id} className={clsx(
                  'border-b border-black/[0.04] hover:bg-gray-50/40',
                  hasPending && 'bg-[#FFFBEA]/40'
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
                  {WEEK_DAYS.map(d => {
                    const value = cellValue(emp, d.num)
                    const isPending = empPending[String(d.num)] !== undefined
                    const isWeekend = d.num === 0 || d.num === 6
                    const m = configMeta(value, configs)
                    return (
                      <td key={d.num} className={clsx('px-2 py-2 text-center align-middle',
                        isWeekend ? 'bg-gray-50/30' : '')}>
                        <select
                          value={value}
                          onChange={e => setCell(emp, d.num, e.target.value)}
                          className={clsx(
                            'w-full text-[11px] px-1.5 py-1 rounded-md border transition-all cursor-pointer font-medium',
                            isPending ? 'border-[#1D9E75] ring-1 ring-[#1D9E75]/30' : 'border-black/[0.08]'
                          )}
                          style={{ background: m.bg, color: m.color }}
                        >
                          {configs.map(c => (
                            <option key={c.id} value={c.code || ''} disabled={!c.code}>
                              {c.code} — {c.name}
                            </option>
                          ))}
                          <option value="dayoff">— วันหยุด</option>
                        </select>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Save bar */}
      {totalChanges > 0 && (
        <div className="sticky bottom-4 mt-4 flex justify-end">
          <div className="card flex items-center gap-3 shadow-md">
            <span className="text-sm text-gray-600">
              มีการเปลี่ยนแปลง {totalChanges} ช่อง · {Object.keys(pending).length} คน
            </span>
            <button onClick={discardChanges} className="btn text-xs">
              <IconRefresh size={13} /> ยกเลิก
            </button>
            <button onClick={save} disabled={loading} className="btn btn-primary text-xs">
              <IconDeviceFloppy size={13} /> {loading ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
