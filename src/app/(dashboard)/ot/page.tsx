'use client'
import { useEffect, useState } from 'react'
import { otApi } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { IconPlus, IconCheck, IconX, IconClockPlus, IconCrown } from '@tabler/icons-react'
import dayjs from 'dayjs'
import clsx from 'clsx'

const STATUS_BADGE: Record<string, string> = {
  pending: 'badge-amber', approved: 'badge-green', rejected: 'badge-red', cancelled: 'badge-gray',
}
const STATUS_TH: Record<string, string> = {
  pending: 'รออนุมัติ', approved: 'อนุมัติแล้ว', rejected: 'ปฏิเสธ', cancelled: 'ยกเลิก',
}

function calcHours(start: string, end: string): number {
  if (!start || !end) return 0
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const mins = (eh * 60 + em) - (sh * 60 + sm)
  return mins > 0 ? +(mins / 60).toFixed(1) : 0
}

export default function OTPage() {
  const { user } = useAuthStore()
  const [pending, setPending] = useState<any[]>([])
  const [form, setForm] = useState({
    date: dayjs().format('YYYY-MM-DD'),
    startTime: '18:00',
    endTime: '20:00',
    reason: '',
  })
  const [showForm, setShowForm] = useState(false)
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const isHR = user?.role === 'hr' || user?.role === 'owner'
  const isOwner = user?.role === 'owner'

  const load = async () => {
    if (!isHR) return
    const res = await otApi.pending().catch(() => null)
    if (res) setPending(res.data.data || [])
  }

  useEffect(() => { load() }, [isHR])

  const submit = async () => {
    if (!form.date || !form.startTime || !form.endTime || !form.reason) {
      setMsg('กรุณากรอกข้อมูลให้ครบ'); return
    }
    if (calcHours(form.startTime, form.endTime) <= 0) {
      setMsg('เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม'); return
    }
    setLoading(true); setMsg('')
    try {
      await otApi.create(form)
      setMsg('ยื่นคำขอ OT แล้ว รออนุมัติ')
      setShowForm(false)
      setForm({ date: dayjs().format('YYYY-MM-DD'), startTime: '18:00', endTime: '20:00', reason: '' })
      load()
    } catch (e: any) {
      setMsg(e.response?.data?.message || 'เกิดข้อผิดพลาด')
    } finally { setLoading(false) }
  }

  const approve = async (id: string, action: 'approved' | 'rejected') => {
    await otApi.approve(id, action).catch(() => {})
    load()
  }

  const hours = calcHours(form.startTime, form.endTime)

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#111110]">OT — ล่วงเวลา</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isOwner ? 'อนุมัติคำขอ OT' : 'ยื่นคำขอทำงานล่วงเวลา'}
          </p>
        </div>
        {!isOwner && (
          <button onClick={() => setShowForm(!showForm)} className="btn btn-primary text-sm">
            <IconPlus size={15} /> ยื่นคำขอ OT
          </button>
        )}
      </div>

      {isOwner && (
        <div className="card text-center py-8 mb-5">
          <IconCrown size={26} className="mx-auto text-[#534AB7] mb-2" />
          <p className="text-sm text-[#111110] font-medium">เจ้าของไม่ต้องขอ OT</p>
          <p className="text-xs text-gray-500 mt-1">รายการ OT รออนุมัติแสดงด้านล่าง</p>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="card mb-5 animate-slide-up">
          <h2 className="text-sm font-semibold mb-4">ยื่นคำขอ OT ใหม่</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="label">วันที่</label>
              <input
                type="date"
                className="input"
                value={form.date}
                onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
              />
            </div>
            <div>
              <label className="label">เวลาเริ่ม</label>
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
            <div className="sm:col-span-2">
              <label className="label">เหตุผล</label>
              <input
                className="input"
                placeholder="ระบุเหตุผล เช่น ปิดงบสิ้นเดือน"
                value={form.reason}
                onChange={e => setForm(p => ({ ...p, reason: e.target.value }))}
              />
            </div>
          </div>

          {hours > 0 && (
            <div className="mt-3 px-3 py-2 bg-[#E1F5EE] text-[#085041] text-xs rounded-[10px] inline-flex items-center gap-1.5">
              <IconClockPlus size={13} />
              รวมเวลาทำงาน {hours} ชั่วโมง
            </div>
          )}

          {msg && (
            <p className={clsx('text-xs mt-3', msg.includes('แล้ว') ? 'text-[#085041]' : 'text-red-600')}>
              {msg}
            </p>
          )}
          <div className="flex gap-2 mt-4">
            <button onClick={submit} disabled={loading} className="btn btn-primary text-sm">
              {loading ? 'กำลังส่ง...' : 'ส่งคำขอ'}
            </button>
            <button onClick={() => setShowForm(false)} className="btn text-sm">ยกเลิก</button>
          </div>
        </div>
      )}

      {/* Pending list (HR/Owner only) */}
      {isHR && (
        <div className="card">
          <h2 className="text-sm font-semibold mb-3">OT รออนุมัติ ({pending.length})</h2>
          {pending.length === 0 ? (
            <p className="text-xs text-gray-400 py-6 text-center">ไม่มีคำขอ OT รออนุมัติ</p>
          ) : (
            pending.map((r: any) => (
              <div key={r.id} className="flex items-center gap-3 py-2.5 border-b border-black/[0.05] last:border-0">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-[#111110]">
                    {r.first_name} {r.last_name}
                  </div>
                  <div className="text-xs text-gray-500">
                    {dayjs(r.date).format('D MMM YYYY')} · {r.start_time}–{r.end_time}
                    {r.hours && <> · {r.hours} ชม.</>}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">{r.reason}</div>
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => approve(r.id, 'rejected')}
                    className="btn text-xs px-2.5 py-1.5 text-red-500 border-red-200 hover:bg-red-50"
                  >
                    <IconX size={13} />
                  </button>
                  <button
                    onClick={() => approve(r.id, 'approved')}
                    className="btn btn-primary text-xs px-2.5 py-1.5"
                  >
                    <IconCheck size={13} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {!isHR && !showForm && (
        <div className="card text-center py-10 text-sm text-gray-500">
          กดปุ่ม &quot;ยื่นคำขอ OT&quot; ด้านบนเพื่อยื่นคำขอใหม่
        </div>
      )}
    </div>
  )
}
