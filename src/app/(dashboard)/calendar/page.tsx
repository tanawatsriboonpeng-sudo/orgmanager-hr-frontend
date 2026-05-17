'use client'
// Unified calendar view — overlays three data sources on a single
// month grid so the team has one place to ask "what's happening?":
//   1. Holidays (red dot, name in cell) — managed in /settings
//   2. Calendar events (color-coded by type) — meetings / seminars /
//      company milestones; HR/owner can add via the "+" button on
//      any day cell
//   3. Approved leaves (compact "ชื่อ ลา" chip) — read-only here;
//      cancel/manage from /leave
//
// Layout choice: Sunday-first 7×N grid like Google Calendar TH locale,
// with a sticky header showing month + nav. Click any cell → side panel
// with full list of that day's items + the add-event CTA. Editing /
// deleting is in the side panel too, no full-screen modal.

import { useEffect, useMemo, useState } from 'react'
import { useAuthStore } from '@/lib/store'
import { eventApi, holidayApi, leaveApi, type CalendarEvent, type Holiday } from '@/lib/api'
import {
  IconChevronLeft, IconChevronRight, IconPlus, IconCalendarTime,
  IconX, IconEdit, IconTrash, IconClock, IconMapPin, IconUsers,
} from '@tabler/icons-react'
import dayjs, { type Dayjs } from 'dayjs'
import clsx from 'clsx'
import Link from 'next/link'
import { useToast } from '@/components/ui/Toast'
import EmptyState from '@/components/ui/EmptyState'

const DAY_HEADER = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']
const MONTH_TH = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]

const EVENT_TYPE_LABEL: Record<string, string> = {
  meeting: 'ประชุม',
  seminar: 'สัมมนา',
  company: 'กิจกรรมบริษัท',
  birthday: 'วันเกิด',
  other: 'อื่นๆ',
}
// Color palette → Tailwind class fragments. Center the visual hierarchy
// on holidays (red) so they stand out even if HR forgot to set a color.
const EVENT_COLOR: Record<string, { dot: string; chip: string }> = {
  green:  { dot: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  amber:  { dot: 'bg-amber-500',   chip: 'bg-amber-50 text-amber-700 border-amber-200' },
  red:    { dot: 'bg-red-500',     chip: 'bg-red-50 text-red-700 border-red-200' },
  purple: { dot: 'bg-violet-500',  chip: 'bg-violet-50 text-violet-700 border-violet-200' },
  blue:   { dot: 'bg-blue-500',    chip: 'bg-blue-50 text-blue-700 border-blue-200' },
  gray:   { dot: 'bg-gray-400',    chip: 'bg-gray-50 text-gray-700 border-gray-200' },
}
const colorOf = (e: CalendarEvent) => EVENT_COLOR[e.color || 'blue'] || EVENT_COLOR.blue

// Build a 6×7 grid of dates that always starts on a Sunday and covers
// the requested month — same shape Google Calendar / Outlook use, so
// "previous/next month tail cells" feel familiar.
function buildMonthGrid(year: number, monthIdx: number): Dayjs[] {
  const first = dayjs(new Date(year, monthIdx, 1))
  const gridStart = first.subtract(first.day(), 'day') // back up to Sunday
  return Array.from({ length: 42 }, (_, i) => gridStart.add(i, 'day'))
}

export default function CalendarPage() {
  const { user } = useAuthStore()
  const role = user?.role
  const canManage = role === 'hr' || role === 'owner'
  const toast = useToast()

  const today = dayjs()
  const [year, setYear]   = useState(today.year())
  const [month, setMonth] = useState(today.month()) // 0..11
  const [events,   setEvents]   = useState<CalendarEvent[]>([])
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [leaves,   setLeaves]   = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [editing, setEditing] = useState<CalendarEvent | 'new' | null>(null)

  const grid = useMemo(() => buildMonthGrid(year, month), [year, month])
  const monthStart = grid[0].format('YYYY-MM-DD')
  const monthEnd   = grid[grid.length - 1].format('YYYY-MM-DD')

  // Load everything in parallel for the current grid window. Holidays
  // are scoped by year (the simple API filter) so we may pull a few
  // outside the grid — harmless; we filter again at render time.
  const load = async () => {
    setLoading(true)
    try {
      const [evRes, hRes, lRes] = await Promise.allSettled([
        eventApi.list({ from: monthStart, to: monthEnd }),
        holidayApi.list(year),
        // Approved leaves overlap the visible window. Plain employees
        // see only their own (backend's /leave/my-history already
        // does that filter); HR/owner see the org-wide list.
        canManage
          ? leaveApi.allRequests({ status: 'approved', limit: 500 })
          : leaveApi.myHistory(),
      ])
      if (evRes.status === 'fulfilled') setEvents(evRes.value.data.data || [])
      if (hRes.status === 'fulfilled') setHolidays(hRes.value.data.data || [])
      if (lRes.status === 'fulfilled') {
        const rows: any[] = (lRes.value as any).data?.data?.records
                          || (lRes.value as any).data?.data
                          || []
        setLeaves(rows.filter(r => r.status === 'approved'))
      }
    } finally { setLoading(false) }
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [year, month, canManage])

  const goMonth = (delta: number) => {
    const next = dayjs(new Date(year, month + delta, 1))
    setYear(next.year())
    setMonth(next.month())
  }
  const goToday = () => {
    setYear(today.year())
    setMonth(today.month())
    setSelectedDate(today.format('YYYY-MM-DD'))
  }

  // Pre-index data by date so cell render is O(1) per day. Events that
  // span multiple days appear on each day in their range.
  const dayIndex = useMemo(() => {
    const idx: Record<string, { events: CalendarEvent[]; holidays: Holiday[]; leaves: any[] }> = {}
    for (const d of grid) {
      idx[d.format('YYYY-MM-DD')] = { events: [], holidays: [], leaves: [] }
    }
    for (const e of events) {
      let cur = dayjs(e.start_date)
      const end = dayjs(e.end_date || e.start_date)
      while (!cur.isAfter(end)) {
        const k = cur.format('YYYY-MM-DD')
        if (idx[k]) idx[k].events.push(e)
        cur = cur.add(1, 'day')
      }
    }
    for (const h of holidays) {
      const k = dayjs(h.date).format('YYYY-MM-DD')
      if (idx[k]) idx[k].holidays.push(h)
    }
    for (const lv of leaves) {
      let cur = dayjs(lv.start_date)
      const end = dayjs(lv.end_date)
      while (!cur.isAfter(end)) {
        const dow = cur.day()
        if (dow !== 0 && dow !== 6) {
          const k = cur.format('YYYY-MM-DD')
          if (idx[k]) idx[k].leaves.push(lv)
        }
        cur = cur.add(1, 'day')
      }
    }
    return idx
  }, [grid, events, holidays, leaves])

  const dayPanel = selectedDate ? dayIndex[selectedDate] : null

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#111110]">ปฏิทินบริษัท</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            กิจกรรม · วันหยุด · การลา ในที่เดียวกัน
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => goMonth(-1)} className="btn text-sm" title="เดือนที่แล้ว">
            <IconChevronLeft size={14} />
          </button>
          <button onClick={goToday} className="btn text-sm">วันนี้</button>
          <button onClick={() => goMonth(1)} className="btn text-sm" title="เดือนถัดไป">
            <IconChevronRight size={14} />
          </button>
          <h2 className="text-base font-semibold text-[#111110] ml-2 tabular-nums">
            {MONTH_TH[month]} {year + 543}
          </h2>
          {canManage && (
            <button
              onClick={() => {
                setSelectedDate(selectedDate || today.format('YYYY-MM-DD'))
                setEditing('new')
              }}
              className="btn btn-primary text-sm ml-auto"
            >
              <IconPlus size={14} /> เพิ่มกิจกรรม
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
        {/* Calendar grid */}
        <div className="card p-0 overflow-hidden">
          {/* Weekday header */}
          <div className="grid grid-cols-7 border-b border-black/[0.06] bg-gray-50/50">
            {DAY_HEADER.map((d, i) => (
              <div
                key={d}
                className={clsx(
                  'text-[11px] font-medium text-center py-2',
                  i === 0 || i === 6 ? 'text-red-500' : 'text-gray-500'
                )}
              >
                {d}
              </div>
            ))}
          </div>

          {/* 6×7 day cells */}
          <div className="grid grid-cols-7">
            {grid.map((d, i) => {
              const k = d.format('YYYY-MM-DD')
              const cell = dayIndex[k]
              const isOtherMonth = d.month() !== month
              const isToday = k === today.format('YYYY-MM-DD')
              const isSelected = k === selectedDate
              const isWeekend = d.day() === 0 || d.day() === 6
              const hasHoliday = cell?.holidays.length > 0
              return (
                <button
                  key={i}
                  onClick={() => setSelectedDate(k)}
                  className={clsx(
                    'relative min-h-[88px] border-b border-r border-black/[0.04] p-1.5 text-left transition-colors',
                    isOtherMonth && 'bg-gray-50/40',
                    isSelected && 'ring-2 ring-[#1D9E75] ring-inset z-10',
                    !isSelected && 'hover:bg-gray-50',
                    hasHoliday && !isOtherMonth && 'bg-red-50/30',
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={clsx(
                      'text-[12px] tabular-nums inline-flex items-center justify-center w-6 h-6 rounded-full',
                      isToday && 'bg-[#1D9E75] text-white font-semibold',
                      !isToday && isOtherMonth && 'text-gray-300',
                      !isToday && !isOtherMonth && isWeekend && 'text-red-500',
                      !isToday && !isOtherMonth && !isWeekend && 'text-[#111110]',
                    )}>
                      {d.date()}
                    </span>
                    {hasHoliday && (
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                    )}
                  </div>
                  {/* Holiday names — at most one shown, truncated */}
                  {cell?.holidays[0] && (
                    <div className="text-[10px] text-red-600 font-medium truncate mb-0.5">
                      ★ {cell.holidays[0].name}
                    </div>
                  )}
                  {/* Events — show up to 2 then "+N more" */}
                  {cell?.events.slice(0, 2).map(e => {
                    const c = colorOf(e)
                    return (
                      <div
                        key={e.id}
                        className={clsx('text-[10px] truncate rounded px-1 py-0.5 mb-0.5 border', c.chip)}
                        title={e.title}
                      >
                        {e.start_time && (
                          <span className="opacity-70 mr-1">{String(e.start_time).slice(0, 5)}</span>
                        )}
                        {e.title}
                      </div>
                    )
                  })}
                  {cell && cell.events.length > 2 && (
                    <div className="text-[10px] text-gray-400">+{cell.events.length - 2} อื่นๆ</div>
                  )}
                  {/* Leave indicator — names compact */}
                  {cell && cell.leaves.length > 0 && (
                    <div className="text-[10px] text-violet-700 mt-0.5 truncate">
                      ลา {cell.leaves.length} คน
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Day side panel */}
        <DayPanel
          date={selectedDate}
          cell={dayPanel}
          loading={loading}
          canManage={canManage}
          onAddEvent={() => setEditing('new')}
          onEditEvent={ev => setEditing(ev)}
          onDeleteEvent={async (ev) => {
            const ok = await toast.confirm(
              `"${ev.title}"`,
              { title: 'ลบกิจกรรมนี้?', tone: 'danger', confirmText: 'ลบ' }
            )
            if (!ok) return
            try {
              await eventApi.delete(ev.id)
              toast.success('ลบแล้ว')
              load()
            } catch (e: any) {
              toast.error(e?.response?.data?.message || 'ลบไม่สำเร็จ')
            }
          }}
        />
      </div>

      {/* Event editor modal */}
      {editing && selectedDate && (
        <EventEditorModal
          initial={editing === 'new' ? null : editing}
          defaultDate={selectedDate}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            toast.success(editing === 'new' ? 'เพิ่มแล้ว' : 'บันทึกแล้ว')
            load()
          }}
          onError={(m) => toast.error(m)}
        />
      )}
    </div>
  )
}

// ---------- Day panel ----------

function DayPanel({
  date, cell, loading, canManage, onAddEvent, onEditEvent, onDeleteEvent,
}: {
  date: string | null
  cell: { events: CalendarEvent[]; holidays: Holiday[]; leaves: any[] } | null
  loading: boolean
  canManage: boolean
  onAddEvent: () => void
  onEditEvent: (e: CalendarEvent) => void
  onDeleteEvent: (e: CalendarEvent) => void
}) {
  if (!date) {
    return (
      <div className="card">
        <EmptyState
          icon={IconCalendarTime}
          title="เลือกวันที่ใดก็ได้"
          description="คลิกช่องวันในปฏิทินเพื่อดูรายละเอียดของวันนั้น"
          size="compact"
          tone="gray"
        />
      </div>
    )
  }
  const d = dayjs(date)
  return (
    <div className="card">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-xs text-gray-500">{['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'][d.day()]}</div>
          <div className="text-lg font-semibold text-[#111110]">{d.date()} {MONTH_TH[d.month()]} {d.year() + 543}</div>
        </div>
        {canManage && (
          <button onClick={onAddEvent} className="btn btn-primary text-xs">
            <IconPlus size={13} /> เพิ่ม
          </button>
        )}
      </div>

      {loading && !cell ? (
        <p className="text-xs text-gray-400 py-4 text-center">กำลังโหลด…</p>
      ) : (
        <div className="space-y-3">
          {cell?.holidays.map(h => (
            <div key={h.id} className="p-2.5 rounded-md border border-red-200 bg-red-50/50">
              <div className="flex items-center gap-2 text-xs font-medium text-red-700">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                วันหยุด
              </div>
              <div className="text-sm font-medium text-[#111110] mt-1">{h.name}</div>
              <div className="text-[10px] text-gray-500 mt-0.5">
                {h.type === 'religious' ? 'วันสำคัญทางศาสนา' : h.type === 'company' ? 'วันหยุดบริษัท' : 'วันหยุดราชการ'}
              </div>
            </div>
          ))}

          {cell?.events.map(e => {
            const c = EVENT_COLOR[e.color || 'blue'] || EVENT_COLOR.blue
            return (
              <div key={e.id} className={clsx('p-2.5 rounded-md border', c.chip)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium mb-1">
                      <span className={clsx('w-2 h-2 rounded-full', c.dot)} />
                      {EVENT_TYPE_LABEL[e.event_type] || e.event_type}
                    </div>
                    <div className="text-sm font-medium text-[#111110]">{e.title}</div>
                    {(e.start_time || e.end_time) && (
                      <div className="flex items-center gap-1 text-[11px] text-gray-600 mt-1">
                        <IconClock size={11} />
                        {e.start_time ? String(e.start_time).slice(0, 5) : ''}
                        {e.end_time ? ` – ${String(e.end_time).slice(0, 5)}` : ''}
                      </div>
                    )}
                    {e.location && (
                      <div className="flex items-center gap-1 text-[11px] text-gray-600 mt-0.5">
                        <IconMapPin size={11} /> {e.location}
                      </div>
                    )}
                    {e.description && (
                      <p className="text-[11px] text-gray-600 mt-1 whitespace-pre-wrap">{e.description}</p>
                    )}
                  </div>
                  {canManage && (
                    <div className="flex flex-col gap-1 flex-shrink-0">
                      <button onClick={() => onEditEvent(e)} className="p-1 rounded hover:bg-white/60" title="แก้ไข">
                        <IconEdit size={13} className="text-gray-600" />
                      </button>
                      <button onClick={() => onDeleteEvent(e)} className="p-1 rounded hover:bg-red-100" title="ลบ">
                        <IconTrash size={13} className="text-red-500" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {cell && cell.leaves.length > 0 && (
            <div className="p-2.5 rounded-md border border-violet-200 bg-violet-50/40">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-violet-700 mb-1.5">
                <IconUsers size={11} />
                ลางาน ({cell.leaves.length} คน)
              </div>
              <ul className="space-y-0.5 text-[12px] text-[#111110]">
                {cell.leaves.map((lv: any) => (
                  <li key={lv.id} className="flex items-center justify-between">
                    <span>{lv.first_name} {lv.last_name}</span>
                    <Link href="/leave" className="text-[10px] text-violet-700 hover:underline">
                      {lv.leave_type_name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {cell && cell.events.length === 0 && cell.holidays.length === 0 && cell.leaves.length === 0 && (
            <p className="text-xs text-gray-400 py-4 text-center">ไม่มีรายการในวันนี้</p>
          )}
        </div>
      )}
    </div>
  )
}

// ---------- Event editor modal ----------

const COLOR_CHOICES: Array<{ value: string; label: string; class: string }> = [
  { value: 'blue',   label: 'ฟ้า',   class: 'bg-blue-500' },
  { value: 'green',  label: 'เขียว', class: 'bg-emerald-500' },
  { value: 'amber',  label: 'เหลือง', class: 'bg-amber-500' },
  { value: 'red',    label: 'แดง',   class: 'bg-red-500' },
  { value: 'purple', label: 'ม่วง',  class: 'bg-violet-500' },
  { value: 'gray',   label: 'เทา',   class: 'bg-gray-400' },
]

function EventEditorModal({ initial, defaultDate, onClose, onSaved, onError }: {
  initial: CalendarEvent | null
  defaultDate: string
  onClose: () => void
  onSaved: () => void
  onError: (m: string) => void
}) {
  const [form, setForm] = useState({
    title:       initial?.title || '',
    description: initial?.description || '',
    eventType:   initial?.event_type || 'meeting',
    startDate:   initial?.start_date || defaultDate,
    endDate:     initial?.end_date || '',
    startTime:   initial?.start_time ? String(initial.start_time).slice(0, 5) : '',
    endTime:     initial?.end_time   ? String(initial.end_time).slice(0, 5) : '',
    location:    initial?.location || '',
    color:       initial?.color || 'blue',
    visibility:  (initial?.visibility || 'all') as 'all' | 'department' | 'specific',
  })
  const [saving, setSaving] = useState(false)
  const isEdit = !!initial

  const submit = async () => {
    if (!form.title.trim()) { onError('กรุณาระบุหัวข้อ'); return }
    if (!form.startDate) { onError('กรุณาเลือกวันเริ่ม'); return }
    setSaving(true)
    try {
      const body = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        eventType: form.eventType,
        startDate: form.startDate,
        endDate: form.endDate || undefined,
        startTime: form.startTime || undefined,
        endTime: form.endTime || undefined,
        location: form.location.trim() || undefined,
        color: form.color,
        visibility: form.visibility,
      }
      if (isEdit) await eventApi.update(initial!.id, body)
      else        await eventApi.create(body)
      onSaved()
    } catch (e: any) {
      onError(e?.response?.data?.message || 'บันทึกไม่สำเร็จ')
    } finally { setSaving(false) }
  }

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 animate-fade-in">
      <div
        onClick={e => e.stopPropagation()}
        className="modal-panel w-full max-w-md max-h-[92vh] overflow-y-auto animate-scale-in"
      >
        <div className="px-5 py-4 border-b border-black/[0.06] flex items-center justify-between">
          <h3 className="text-base font-semibold text-[#111110]">
            {isEdit ? 'แก้ไขกิจกรรม' : 'เพิ่มกิจกรรม'}
          </h3>
          <button onClick={onClose}><IconX size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="label">หัวข้อ *</label>
            <input
              className="input"
              placeholder="เช่น ประชุมทีม"
              value={form.title}
              onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              autoFocus
            />
          </div>
          <div>
            <label className="label">ประเภท</label>
            <select
              className="input"
              value={form.eventType}
              onChange={e => setForm(p => ({ ...p, eventType: e.target.value }))}
            >
              {Object.entries(EVENT_TYPE_LABEL).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">วันเริ่ม *</label>
              <input
                type="date"
                className="input"
                value={form.startDate}
                onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))}
              />
            </div>
            <div>
              <label className="label">วันสิ้นสุด (ไม่จำเป็น)</label>
              <input
                type="date"
                className="input"
                min={form.startDate}
                value={form.endDate}
                onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))}
              />
            </div>
            <div>
              <label className="label">เวลาเริ่ม (ทั้งวัน — ปล่อยว่าง)</label>
              <input
                type="time"
                className="input"
                value={form.startTime}
                onChange={e => setForm(p => ({ ...p, startTime: e.target.value }))}
              />
            </div>
            <div>
              <label className="label">เวลาสิ้นสุด</label>
              <input
                type="time"
                className="input"
                value={form.endTime}
                onChange={e => setForm(p => ({ ...p, endTime: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <label className="label">สถานที่</label>
            <input
              className="input"
              placeholder="เช่น ห้องประชุม 1, Zoom, ลูกค้า X"
              value={form.location}
              onChange={e => setForm(p => ({ ...p, location: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">รายละเอียด</label>
            <textarea
              className="input min-h-[60px] text-[13px]"
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">สี</label>
            <div className="flex gap-1.5 flex-wrap">
              {COLOR_CHOICES.map(c => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setForm(p => ({ ...p, color: c.value }))}
                  className={clsx(
                    'w-7 h-7 rounded-full transition-transform',
                    c.class,
                    form.color === c.value && 'ring-2 ring-offset-2 ring-gray-400 scale-110'
                  )}
                  title={c.label}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-black/[0.06] flex justify-end gap-2">
          <button onClick={onClose} className="btn text-sm">ยกเลิก</button>
          <button onClick={submit} disabled={saving} className="btn btn-primary text-sm">
            {saving ? 'กำลังบันทึก…' : (isEdit ? 'บันทึก' : 'เพิ่ม')}
          </button>
        </div>
      </div>
    </div>
  )
}
