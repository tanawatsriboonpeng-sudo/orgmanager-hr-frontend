'use client'
import { useEffect, useState } from 'react'
import { shiftConfigApi, ShiftConfig, FlexTier, ShiftConfigUpsert } from '@/lib/api'
import {
  IconClock, IconClockPlus, IconPlus, IconTrash, IconDeviceFloppy,
  IconAlertTriangle, IconCheck, IconX, IconCircleDashed
} from '@tabler/icons-react'
import clsx from 'clsx'

const DAY_LABELS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']

function timeToHHMM(t: string | undefined | null): string {
  if (!t) return ''
  // Backend returns "HH:MM:SS" — trim seconds for <input type=time>
  return t.length >= 5 ? t.slice(0, 5) : t
}

function NormalRulesCard({
  config,
  onChange,
  onSave,
  onDelete,
  saving,
}: {
  config: ShiftConfig
  onChange: (patch: Partial<ShiftConfig>) => void
  onSave: () => void
  onDelete?: () => void
  saving?: boolean
}) {
  const workStart = timeToHHMM(config.work_start)
  // Derived display: e.g. work_start 09:00 + grace 0 + warning 1 + late 10 + absent 20
  // → on time: ≤09:00, almost late: 09:01-09:09, late: 09:10-09:19, absent: ≥09:20
  const [wh, wm] = workStart.split(':').map(Number)
  const baseMin = (wh * 60) + wm
  const fmt = (totalMin: number) => `${String(Math.floor(totalMin / 60)).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`

  return (
    <div className="card mb-4">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <IconClock size={16} className="text-[#0C447C]" />
            <h3 className="text-sm font-semibold text-[#111110]">{config.name}</h3>
            <span className="badge badge-blue text-[10px]">กะปกติ</span>
          </div>
          {config.description && (
            <p className="text-xs text-gray-500 mt-1">{config.description}</p>
          )}
        </div>
        <div className="flex gap-1.5">
          {onDelete && (
            <button onClick={onDelete} className="btn text-xs text-red-500 border-red-200 hover:bg-red-50">
              <IconTrash size={13} />
            </button>
          )}
          <button onClick={onSave} disabled={saving} className="btn btn-primary text-xs">
            <IconDeviceFloppy size={13} /> {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div>
          <label className="label">โค้ด <span className="text-gray-400">(สำหรับเลือกในตาราง)</span></label>
          <input className="input font-mono" placeholder="WC001"
            value={config.code || ''}
            onChange={e => onChange({ code: e.target.value })} />
        </div>
        <div>
          <label className="label">ชื่อกะ</label>
          <input className="input" value={config.name}
            onChange={e => onChange({ name: e.target.value })} />
        </div>
        <div>
          <label className="label">คำอธิบาย</label>
          <input className="input" placeholder="เช่น จ-ศ"
            value={config.description || ''}
            onChange={e => onChange({ description: e.target.value })} />
        </div>
        <div>
          <label className="label">เริ่มงาน</label>
          <input type="time" className="input" value={timeToHHMM(config.work_start)}
            onChange={e => onChange({ work_start: e.target.value })} />
        </div>
        <div>
          <label className="label">เลิกงาน</label>
          <input type="time" className="input" value={timeToHHMM(config.work_end)}
            onChange={e => onChange({ work_end: e.target.value })} />
        </div>
      </div>

      <div className="bg-gray-50 rounded-[10px] p-3 mb-4">
        <div className="text-xs font-medium text-gray-700 mb-2">เกณฑ์การลงเวลา (นาทีหลังเวลาเริ่มงาน)</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="label">เริ่ม &quot;เกือบสาย&quot; ที่ (นาที)</label>
            <input type="number" min={0} className="input"
              value={config.late_warning_minutes ?? 1}
              onChange={e => onChange({ late_warning_minutes: parseInt(e.target.value) || 0 })} />
            <p className="text-[10px] text-gray-400 mt-1">หลัง {workStart} {config.late_warning_minutes || 1} นาที</p>
          </div>
          <div>
            <label className="label">เริ่ม &quot;สาย&quot; ที่ (นาที)</label>
            <input type="number" min={0} className="input"
              value={config.late_threshold_minutes ?? 10}
              onChange={e => onChange({ late_threshold_minutes: parseInt(e.target.value) || 0 })} />
            <p className="text-[10px] text-gray-400 mt-1">หลัง {workStart} {config.late_threshold_minutes || 10} นาที</p>
          </div>
          <div>
            <label className="label">เริ่ม &quot;ขาดงาน&quot; ที่ (นาที)</label>
            <input type="number" min={0} className="input"
              value={config.absent_threshold_minutes ?? 20}
              onChange={e => onChange({ absent_threshold_minutes: parseInt(e.target.value) || 0 })} />
            <p className="text-[10px] text-gray-400 mt-1">หลัง {workStart} {config.absent_threshold_minutes || 20} นาที</p>
          </div>
        </div>
      </div>

      {/* Live preview */}
      <div className="border-t border-black/[0.06] pt-3">
        <div className="text-xs font-medium text-gray-600 mb-2">ดูตัวอย่างผลลัพธ์</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Bucket icon={IconCheck} color="green" label="ตรงเวลา"
            range={`ก่อน ${workStart}`} />
          <Bucket icon={IconAlertTriangle} color="amber" label="เกือบสาย"
            range={`${fmt(baseMin + (config.late_warning_minutes || 1))} – ${fmt(baseMin + (config.late_threshold_minutes || 10) - 1)}`} />
          <Bucket icon={IconAlertTriangle} color="orange" label="สาย"
            range={`${fmt(baseMin + (config.late_threshold_minutes || 10))} – ${fmt(baseMin + (config.absent_threshold_minutes || 20) - 1)}`} />
          <Bucket icon={IconX} color="red" label="ขาดงาน"
            range={`ตั้งแต่ ${fmt(baseMin + (config.absent_threshold_minutes || 20))}`} />
        </div>
      </div>
    </div>
  )
}

function FlexRulesCard({
  config,
  onChange,
  onSave,
  onDelete,
  saving,
}: {
  config: ShiftConfig
  onChange: (patch: Partial<ShiftConfig>) => void
  onSave: () => void
  onDelete?: () => void
  saving?: boolean
}) {
  const tiers: FlexTier[] = Array.isArray(config.flex_tiers) ? config.flex_tiers : []

  const setTier = (idx: number, patch: Partial<FlexTier>) => {
    const next = tiers.map((t, i) => i === idx ? { ...t, ...patch } : t)
    onChange({ flex_tiers: next })
  }
  const addTier = () => {
    const next = [...tiers, { checkin_until: '10:05', checkout: '18:00' }]
    onChange({ flex_tiers: next })
  }
  const removeTier = (idx: number) => {
    onChange({ flex_tiers: tiers.filter((_, i) => i !== idx) })
  }

  // Work days display
  const toggleDay = (d: number) => {
    const days = config.work_days || []
    const next = days.includes(d) ? days.filter(x => x !== d) : [...days, d].sort((a,b) => a-b)
    onChange({ work_days: next })
  }

  return (
    <div className="card mb-4">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <IconClockPlus size={16} className="text-[#633806]" />
            <h3 className="text-sm font-semibold text-[#111110]">{config.name}</h3>
            <span className="badge badge-amber text-[10px]">กะยืดหยุ่น</span>
          </div>
          {config.description && (
            <p className="text-xs text-gray-500 mt-1">{config.description}</p>
          )}
        </div>
        <div className="flex gap-1.5">
          {onDelete && (
            <button onClick={onDelete} className="btn text-xs text-red-500 border-red-200 hover:bg-red-50">
              <IconTrash size={13} />
            </button>
          )}
          <button onClick={onSave} disabled={saving} className="btn btn-primary text-xs">
            <IconDeviceFloppy size={13} /> {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div>
          <label className="label">โค้ด <span className="text-gray-400">(สำหรับเลือกในตาราง)</span></label>
          <input className="input font-mono" placeholder="WC002"
            value={config.code || ''}
            onChange={e => onChange({ code: e.target.value })} />
        </div>
        <div>
          <label className="label">ชื่อกะ</label>
          <input className="input" value={config.name}
            onChange={e => onChange({ name: e.target.value })} />
        </div>
        <div>
          <label className="label">คำอธิบาย</label>
          <input className="input" placeholder="เช่น พุธ ศุกร์ เสาร์"
            value={config.description || ''}
            onChange={e => onChange({ description: e.target.value })} />
        </div>
      </div>

      <div className="mb-4">
        <label className="label">วันใช้กะนี้</label>
        <div className="flex gap-1.5 flex-wrap">
          {DAY_LABELS.map((label, idx) => {
            const dayCode = idx === 0 ? 7 : idx  // Sunday: stored as 7 or 0 depending on convention; use 7
            const active = (config.work_days || []).includes(dayCode === 7 ? 0 : dayCode)
              || (config.work_days || []).includes(dayCode)
            return (
              <button
                key={idx}
                type="button"
                onClick={() => toggleDay(dayCode === 7 ? 0 : dayCode)}
                className={clsx(
                  'w-9 h-9 rounded-[8px] text-xs border transition-all',
                  active
                    ? 'bg-[#1D9E75] text-white border-[#1D9E75]'
                    : 'bg-white text-gray-500 border-black/[0.1] hover:bg-gray-50'
                )}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="bg-gray-50 rounded-[10px] p-3 mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-medium text-gray-700">
            ช่วงเวลาเข้างาน → เวลาเลิกงาน ({tiers.length} ชั้น)
          </div>
          <button onClick={addTier} className="btn text-[11px] py-1">
            <IconPlus size={12} /> เพิ่มชั้น
          </button>
        </div>
        {tiers.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-3">ยังไม่มีชั้น — กดเพิ่มชั้นเพื่อเริ่มต้น</p>
        ) : (
          <div className="space-y-1.5">
            {tiers.map((t, i) => (
              <div key={i} className="flex items-center gap-2 bg-white rounded-[8px] p-2 border border-black/[0.04]">
                <span className="text-[11px] text-gray-400 w-6 text-center">{i + 1}</span>
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-gray-500">เข้างานก่อน</span>
                  <input
                    type="time"
                    className="input py-1 text-xs w-[100px]"
                    value={timeToHHMM(t.checkin_until)}
                    onChange={e => setTier(i, { checkin_until: e.target.value })}
                  />
                </div>
                <span className="text-gray-300">→</span>
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-gray-500">เลิกงาน</span>
                  <input
                    type="time"
                    className="input py-1 text-xs w-[100px]"
                    value={timeToHHMM(t.checkout)}
                    onChange={e => setTier(i, { checkout: e.target.value })}
                  />
                </div>
                <button onClick={() => removeTier(i)}
                  className="ml-auto p-1 rounded-[6px] text-red-400 hover:bg-red-50">
                  <IconTrash size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-gray-50 rounded-[10px] p-3">
        <div className="text-xs font-medium text-gray-700 mb-2">เกณฑ์สาย/ขาดงาน (นาทีหลังเวลาเข้างานสุดท้าย)</div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">สาย — หลังจากเวลาสุดท้ายไป (นาที)</label>
            <input type="number" min={0} className="input"
              value={config.late_threshold_minutes ?? 1}
              onChange={e => onChange({ late_threshold_minutes: parseInt(e.target.value) || 0 })} />
          </div>
          <div>
            <label className="label">ขาดงาน — หลังจากเวลาสุดท้ายไป (นาที)</label>
            <input type="number" min={0} className="input"
              value={config.absent_threshold_minutes ?? 15}
              onChange={e => onChange({ absent_threshold_minutes: parseInt(e.target.value) || 0 })} />
          </div>
        </div>
      </div>
    </div>
  )
}

function Bucket({
  icon: Icon, color, label, range,
}: { icon: any; color: 'green' | 'amber' | 'orange' | 'red'; label: string; range: string }) {
  const colors = {
    green:  { bg: '#E1F5EE', fg: '#085041' },
    amber:  { bg: '#FAEEDA', fg: '#633806' },
    orange: { bg: '#FFE5D1', fg: '#9C4400' },
    red:    { bg: '#FCEBEB', fg: '#791F1F' },
  }[color]
  return (
    <div className="rounded-[10px] p-2.5 border" style={{ background: colors.bg, borderColor: colors.bg }}>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={13} style={{ color: colors.fg }} />
        <span className="text-[11px] font-medium" style={{ color: colors.fg }}>{label}</span>
      </div>
      <div className="text-[10px] text-gray-600">{range}</div>
    </div>
  )
}

export default function ShiftRulesEditor({ isOwner }: { isOwner: boolean }) {
  const [configs, setConfigs] = useState<ShiftConfig[]>([])
  const [drafts, setDrafts] = useState<Record<string, ShiftConfig>>({})
  const [loading, setLoading] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [msg, setMsg] = useState({ text: '', ok: true })

  const load = async () => {
    setLoading(true)
    try {
      const res = await shiftConfigApi.list()
      const list: ShiftConfig[] = res.data.data || []
      setConfigs(list)
      const d: Record<string, ShiftConfig> = {}
      for (const c of list) d[c.id] = { ...c }
      setDrafts(d)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const updateDraft = (id: string, patch: Partial<ShiftConfig>) => {
    setDrafts(d => ({ ...d, [id]: { ...d[id], ...patch } }))
  }

  const saveOne = async (id: string) => {
    const cfg = drafts[id]
    if (!cfg) return
    setSavingId(id)
    setMsg({ text: '', ok: true })
    try {
      const payload: ShiftConfigUpsert = {
        name: cfg.name,
        code: cfg.code || undefined,
        description: cfg.description,
        workDays: cfg.work_days,
        checkinStart: timeToHHMM(cfg.checkin_start) || undefined,
        checkinEnd: timeToHHMM(cfg.checkin_end) || undefined,
        workStart: timeToHHMM(cfg.work_start) || undefined,
        workEnd: timeToHHMM(cfg.work_end) || undefined,
        graceMinutes: cfg.grace_minutes,
        lateWarningMinutes: cfg.late_warning_minutes,
        lateThresholdMinutes: cfg.late_threshold_minutes,
        absentThresholdMinutes: cfg.absent_threshold_minutes,
        flexTiers: cfg.flex_tiers,
      }
      await shiftConfigApi.update(id, payload)
      setMsg({ text: `บันทึก "${cfg.name}" แล้ว`, ok: true })
      load()
    } catch (e: any) {
      setMsg({ text: e.response?.data?.message || 'เกิดข้อผิดพลาด', ok: false })
    } finally { setSavingId(null) }
  }

  const createNew = async (shiftType: 'normal' | 'flexible') => {
    const isNormal = shiftType === 'normal'
    try {
      await shiftConfigApi.create({
        name: isNormal ? 'กะปกติ (ใหม่)' : 'กะยืดหยุ่น (ใหม่)',
        shiftType,
        workDays: isNormal ? [1,2,3,4,5] : [3,5,6],
        checkinStart: '08:30',
        checkinEnd: isNormal ? '09:30' : '10:30',
        workStart: '09:00',
        workEnd: '17:00',
        graceMinutes: 0,
        lateWarningMinutes: isNormal ? 1 : 0,
        lateThresholdMinutes: isNormal ? 10 : 1,
        absentThresholdMinutes: isNormal ? 20 : 15,
        flexTiers: isNormal ? [] : [
          { checkin_until: '07:05', checkout: '15:00' },
          { checkin_until: '08:05', checkout: '16:00' },
          { checkin_until: '09:05', checkout: '17:00' },
          { checkin_until: '10:05', checkout: '18:00' },
        ],
      })
      load()
    } catch (e: any) {
      setMsg({ text: e.response?.data?.message || 'เกิดข้อผิดพลาด', ok: false })
    }
  }

  const removeOne = async (id: string, name: string) => {
    if (!confirm(`ลบกะ "${name}"?`)) return
    try {
      await shiftConfigApi.delete(id)
      load()
    } catch (e: any) {
      alert(e.response?.data?.message || 'เกิดข้อผิดพลาด')
    }
  }

  const normals = configs.filter(c => c.shift_type === 'normal')
  const flexes = configs.filter(c => c.shift_type === 'flexible')

  if (loading && configs.length === 0) {
    return <div className="card text-center py-10 text-sm text-gray-400">กำลังโหลด...</div>
  }

  return (
    <div>
      {msg.text && (
        <div className={clsx(
          'flex items-center gap-2 p-2.5 rounded-[10px] text-xs mb-3',
          msg.ok ? 'bg-[#E1F5EE] text-[#085041]' : 'bg-red-50 text-red-600'
        )}>
          {msg.ok ? <IconCheck size={13} /> : <IconX size={13} />}
          {msg.text}
        </div>
      )}

      {/* Normal shifts */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-[#111110] flex items-center gap-2">
            <IconClock size={15} className="text-[#0C447C]" />
            กะปกติ ({normals.length})
          </h2>
          <button onClick={() => createNew('normal')} className="btn text-xs">
            <IconPlus size={13} /> เพิ่มกะปกติ
          </button>
        </div>
        {normals.length === 0 ? (
          <div className="card text-center py-8 text-sm text-gray-400">
            ยังไม่มีกะปกติ — กด &quot;เพิ่มกะปกติ&quot; เพื่อเริ่มต้น
          </div>
        ) : normals.map(c => (
          <NormalRulesCard
            key={c.id}
            config={drafts[c.id] || c}
            onChange={patch => updateDraft(c.id, patch)}
            onSave={() => saveOne(c.id)}
            onDelete={isOwner ? () => removeOne(c.id, c.name) : undefined}
            saving={savingId === c.id}
          />
        ))}
      </div>

      {/* Flex shifts */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-[#111110] flex items-center gap-2">
            <IconClockPlus size={15} className="text-[#633806]" />
            กะยืดหยุ่น ({flexes.length})
          </h2>
          <button onClick={() => createNew('flexible')} className="btn text-xs">
            <IconPlus size={13} /> เพิ่มกะยืดหยุ่น
          </button>
        </div>
        {flexes.length === 0 ? (
          <div className="card text-center py-8 text-sm text-gray-400">
            ยังไม่มีกะยืดหยุ่น — กด &quot;เพิ่มกะยืดหยุ่น&quot; เพื่อเริ่มต้น
          </div>
        ) : flexes.map(c => (
          <FlexRulesCard
            key={c.id}
            config={drafts[c.id] || c}
            onChange={patch => updateDraft(c.id, patch)}
            onSave={() => saveOne(c.id)}
            onDelete={isOwner ? () => removeOne(c.id, c.name) : undefined}
            saving={savingId === c.id}
          />
        ))}
      </div>
    </div>
  )
}
