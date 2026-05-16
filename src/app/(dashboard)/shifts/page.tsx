'use client'
import { useEffect, useMemo, useState } from 'react'
import { employeeApi, shiftApi, shiftConfigApi, ShiftAssignment, ShiftBulkItem, ShiftConfig } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import dayjs from 'dayjs'
import {
  IconCalendarTime, IconChevronLeft, IconChevronRight,
  IconCheck, IconX, IconDeviceFloppy, IconRefresh,
  IconSettings, IconCalendarStats
} from '@tabler/icons-react'
import clsx from 'clsx'
import ShiftRulesEditor from '@/components/shifts/ShiftRulesEditor'

interface Employee {
  id: string
  first_name: string
  last_name: string
  nickname?: string
  role: string
  shift_type?: string
  department_name?: string
  is_active: boolean
}

// A cell value is either the special 'default' (clear override),
// 'dayoff' (explicit day off), or a shift_configs.code such as "WC001".
type ShiftValue = string

const DAYOFF_META = { label: 'วันหยุด', short: '—', color: '#791F1F', bg: '#FCEBEB' }
// Legacy fallback styling for old enum values still in the DB
const LEGACY_META: Record<string, { label: string; short: string; color: string; bg: string }> = {
  normal:   { label: 'กะปกติ', short: 'ป', color: '#0C447C', bg: '#E6F1FB' },
  flexible: { label: 'ยืดหยุ่น', short: 'ย', color: '#633806', bg: '#FAEEDA' },
  dayoff:   DAYOFF_META,
}

function configMeta(code: string, configs: ShiftConfig[]) {
  if (code === 'dayoff') return DAYOFF_META
  if (LEGACY_META[code]) return LEGACY_META[code]
  // It's a config code → look up by code or fallback to type-based color
  const cfg = configs.find(c => c.code === code)
  if (!cfg) return { label: code, short: code.slice(0, 4), color: '#534AB7', bg: '#EEEDFE' }
  if (cfg.shift_type === 'flexible') return { label: cfg.code || cfg.name, short: cfg.code || cfg.name.slice(0,4), color: '#633806', bg: '#FAEEDA' }
  return { label: cfg.code || cfg.name, short: cfg.code || cfg.name.slice(0,4), color: '#0C447C', bg: '#E6F1FB' }
}

const DAY_TH = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']

function weekDates(anchor: dayjs.Dayjs): dayjs.Dayjs[] {
  const monday = anchor.day() === 0 ? anchor.subtract(6, 'day') : anchor.subtract(anchor.day() - 1, 'day')
  return Array.from({ length: 7 }, (_, i) => monday.add(i, 'day'))
}

export default function ShiftsPage() {
  const { user } = useAuthStore()
  const isHR = user?.role === 'hr' || user?.role === 'owner'
  const isOwner = user?.role === 'owner'

  const [tab, setTab] = useState<'schedule' | 'rules'>('schedule')

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
          {tab === 'schedule'
            ? 'กำหนดกะของพนักงานรายวัน — ค่าว่างจะใช้กะเริ่มต้นของพนักงานคนนั้น'
            : 'ตั้งค่ารายละเอียดของแต่ละกะ — เวลาเริ่ม/เลิก เกณฑ์สาย/ขาด'}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-black/[0.06]">
        <TabButton active={tab === 'schedule'} onClick={() => setTab('schedule')} icon={IconCalendarStats}>
          ตารางรายสัปดาห์
        </TabButton>
        <TabButton active={tab === 'rules'} onClick={() => setTab('rules')} icon={IconSettings}>
          ตั้งค่ากะ
        </TabButton>
      </div>

      {tab === 'rules' ? (
        <ShiftRulesEditor isOwner={isOwner} />
      ) : (
        <ScheduleTab />
      )}
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
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([])
  const [pending, setPending] = useState<Record<string, ShiftValue>>({})
  const [anchor, setAnchor] = useState(dayjs())
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState({ text: '', ok: true })

  const week = useMemo(() => weekDates(anchor), [anchor])
  const startDate = week[0].format('YYYY-MM-DD')
  const endDate = week[6].format('YYYY-MM-DD')

  const assignedMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const a of assignments) m[`${a.employee_id}_${a.date}`] = a.shift_type
    return m
  }, [assignments])

  const load = async () => {
    setLoading(true)
    try {
      const [eRes, sRes, cRes] = await Promise.allSettled([
        employeeApi.list(),
        shiftApi.list(startDate, endDate),
        shiftConfigApi.list(),
      ])
      if (eRes.status === 'fulfilled') {
        const all: Employee[] = eRes.value.data.data || []
        setEmployees(all.filter(e => e.role !== 'owner' && e.is_active !== false))
      }
      if (sRes.status === 'fulfilled') setAssignments(sRes.value.data.data || [])
      if (cRes.status === 'fulfilled') {
        setConfigs((cRes.value.data.data || []).filter((c: ShiftConfig) => c.is_active !== false))
      }
      setPending({})
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [startDate, endDate])

  const cellValue = (empId: string, date: string): ShiftValue => {
    const key = `${empId}_${date}`
    if (pending[key] !== undefined) return pending[key]
    const assigned = assignedMap[key]
    if (assigned) return assigned as ShiftValue
    return 'default'
  }

  const setCell = (empId: string, date: string, value: ShiftValue) => {
    setPending(p => ({ ...p, [`${empId}_${date}`]: value }))
  }

  const hasChanges = Object.keys(pending).length > 0

  const save = async () => {
    if (!hasChanges) return
    setLoading(true)
    setMsg({ text: '', ok: true })
    try {
      const items: ShiftBulkItem[] = Object.entries(pending).map(([key, value]) => {
        const [employeeId, date] = key.split('_')
        return { employeeId, date, shiftType: value }
      })
      await shiftApi.bulkUpsert(items)
      setMsg({ text: `บันทึก ${items.length} รายการแล้ว`, ok: true })
      setPending({})
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
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="text-sm text-gray-600">
          สัปดาห์ {week[0].format('D MMM')} – {week[6].format('D MMM YYYY')}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setAnchor(a => a.subtract(7, 'day'))} className="btn text-xs px-2 py-2">
            <IconChevronLeft size={14} />
          </button>
          <button onClick={() => setAnchor(dayjs())} className="btn text-xs">วันนี้</button>
          <button onClick={() => setAnchor(a => a.add(7, 'day'))} className="btn text-xs px-2 py-2">
            <IconChevronRight size={14} />
          </button>
        </div>
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
            ⚠ ยังไม่มีกะใน &quot;ตั้งค่ากะ&quot; — สร้างกะก่อนเพื่อใช้งาน
          </span>
        )}
        {configs.map(c => {
          const m = configMeta(c.code || '', configs)
          return (
            <span key={c.id} className="inline-flex items-center gap-1.5">
              <span
                className="inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded text-[10px] font-medium"
                style={{ background: m.bg, color: m.color }}
              >
                {c.code || c.name.slice(0,4)}
              </span>
              <span className="text-gray-500">{c.name}</span>
            </span>
          )
        })}
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-medium" style={{ background: DAYOFF_META.bg, color: DAYOFF_META.color }}>—</span>
          วันหยุด
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-medium bg-gray-100 text-gray-400">·</span>
          ใช้ค่าเริ่มต้น
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
              {week.map((d, i) => {
                const isToday = d.isSame(dayjs(), 'day')
                const isWeekend = d.day() === 0 || d.day() === 6
                return (
                  <th key={i} className={clsx(
                    'text-center px-2 py-2.5 text-xs font-medium min-w-[80px]',
                    isToday ? 'text-[#1D9E75] bg-[#E1F5EE]/40' : isWeekend ? 'text-gray-400' : 'text-gray-600'
                  )}>
                    <div>{DAY_TH[d.day()]}</div>
                    <div className="text-[11px] font-normal">{d.format('D/M')}</div>
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
            ) : employees.map(emp => (
              <tr key={emp.id} className="border-b border-black/[0.04] hover:bg-gray-50/40">
                <td className="sticky left-0 bg-white px-3 py-2 min-w-[220px]">
                  <div className="text-sm font-medium text-[#111110]">
                    {emp.first_name} {emp.last_name}
                    {emp.nickname && <span className="text-gray-400 font-normal ml-1">({emp.nickname})</span>}
                  </div>
                  <div className="text-[11px] text-gray-400">
                    {emp.department_name || '—'} · ค่าเริ่มต้น: {emp.shift_type || 'normal'}
                  </div>
                </td>
                {week.map((d, i) => {
                  const dateStr = d.format('YYYY-MM-DD')
                  const value = cellValue(emp.id, dateStr)
                  const isPending = pending[`${emp.id}_${dateStr}`] !== undefined
                  const isWeekend = d.day() === 0 || d.day() === 6
                  const m = value !== 'default' ? configMeta(value, configs) : null
                  return (
                    <td key={i} className={clsx('px-2 py-2 text-center align-middle',
                      isWeekend ? 'bg-gray-50/30' : '')}>
                      <select
                        value={value}
                        onChange={e => setCell(emp.id, dateStr, e.target.value as ShiftValue)}
                        className={clsx(
                          'w-full text-[11px] px-1.5 py-1 rounded-md border transition-all cursor-pointer',
                          isPending ? 'border-[#1D9E75] ring-1 ring-[#1D9E75]/30' : 'border-black/[0.08]',
                          value === 'default' ? 'bg-gray-50 text-gray-500' : 'text-[#111110]'
                        )}
                        style={m ? { background: m.bg, color: m.color } : undefined}
                      >
                        <option value="default">· ค่าเริ่มต้น</option>
                        {configs.map(c => (
                          <option key={c.id} value={c.code || ''} disabled={!c.code}>
                            {c.code || c.name} — {c.name}
                          </option>
                        ))}
                        <option value="dayoff">— วันหยุด</option>
                      </select>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Save bar */}
      {hasChanges && (
        <div className="sticky bottom-4 mt-4 flex justify-end">
          <div className="card flex items-center gap-3 shadow-md">
            <span className="text-sm text-gray-600">
              มีการเปลี่ยนแปลง {Object.keys(pending).length} ช่อง
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
