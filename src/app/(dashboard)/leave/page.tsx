'use client'
import { useEffect, useState } from 'react'
import { leaveApi } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { IconPlus, IconCheck, IconX } from '@tabler/icons-react'
import dayjs from 'dayjs'
import clsx from 'clsx'

const STATUS_BADGE: Record<string, string> = {
  pending: 'badge-amber', approved: 'badge-green', rejected: 'badge-red', cancelled: 'badge-gray',
}
const STATUS_TH: Record<string, string> = {
  pending: 'รออนุมัติ', approved: 'อนุมัติแล้ว', rejected: 'ปฏิเสธ', cancelled: 'ยกเลิก',
}

export default function LeavePage() {
  const { user } = useAuthStore()
  const [types, setTypes] = useState<any[]>([])
  const [quota, setQuota] = useState<any[]>([])
  const [history, setHistory] = useState<any[]>([])
  const [pending, setPending] = useState<any[]>([])
  const [form, setForm] = useState({ leaveTypeId: '', startDate: '', endDate: '', reason: '' })
  const [showForm, setShowForm] = useState(false)
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const isHR = user?.role === 'hr'

  const load = async () => {
    const [typesRes, quotaRes, histRes] = await Promise.allSettled([
      leaveApi.types(), leaveApi.myQuota(), leaveApi.myHistory(),
    ])
    if (typesRes.status === 'fulfilled') setTypes(typesRes.value.data.data || [])
    if (quotaRes.status === 'fulfilled') setQuota(quotaRes.value.data.data || [])
    if (histRes.status === 'fulfilled') setHistory(histRes.value.data.data || [])
    if (isHR) {
      const pendRes = await leaveApi.pending().catch(() => null)
      if (pendRes) setPending(pendRes.data.data || [])
    }
  }

  useEffect(() => { load() }, [])

  const submit = async () => {
    if (!form.leaveTypeId || !form.startDate || !form.endDate || !form.reason) {
      setMsg('กรุณากรอกข้อมูลให้ครบ'); return
    }
    setLoading(true); setMsg('')
    try {
      await leaveApi.create(form)
      setMsg('ยื่นคำขอลาแล้ว รออนุมัติ')
      setShowForm(false)
      setForm({ leaveTypeId: '', startDate: '', endDate: '', reason: '' })
      load()
    } catch (e: any) {
      setMsg(e.response?.data?.message || 'เกิดข้อผิดพลาด')
    } finally { setLoading(false) }
  }

  const approve = async (id: string, action: 'approved' | 'rejected') => {
    await leaveApi.approve(id, action).catch(() => {})
    load()
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#111110]">การลา</h1>
          <p className="text-sm text-gray-500 mt-0.5">จัดการคำขอลาและโควตา</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn btn-primary text-sm">
          <IconPlus size={15} /> ยื่นคำขอลา
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="card mb-5 animate-slide-up">
          <h2 className="text-sm font-semibold mb-4">ยื่นคำขอลาใหม่</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">ประเภทการลา</label>
              <select className="input" value={form.leaveTypeId} onChange={e => setForm(p => ({ ...p, leaveTypeId: e.target.value }))}>
                <option value="">เลือกประเภท</option>
                {types.map(t => <option key={t.id} value={t.id}>{t.name} ({quota.find(q => q.leave_type_id === t.id)?.remaining_days ?? '?'} วันคงเหลือ)</option>)}
              </select>
            </div>
            <div>
              <label className="label">วันเริ่มลา</label>
              <input type="date" className="input" value={form.startDate} onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))} />
            </div>
            <div>
              <label className="label">วันสิ้นสุด</label>
              <input type="date" className="input" value={form.endDate} onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))} />
            </div>
            <div>
              <label className="label">เหตุผล</label>
              <input className="input" placeholder="ระบุเหตุผล" value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} />
            </div>
          </div>
          {msg && <p className={clsx('text-xs mt-3', msg.includes('แล้ว') ? 'text-[#085041]' : 'text-red-600')}>{msg}</p>}
          <div className="flex gap-2 mt-4">
            <button onClick={submit} disabled={loading} className="btn btn-primary text-sm">
              {loading ? 'กำลังส่ง...' : 'ส่งคำขอ'}
            </button>
            <button onClick={() => setShowForm(false)} className="btn text-sm">ยกเลิก</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Quota */}
        <div className="card">
          <h2 className="text-sm font-semibold mb-3">วันลาคงเหลือปีนี้</h2>
          {quota.length === 0
            ? <p className="text-xs text-gray-400">ยังไม่มีข้อมูลโควตา</p>
            : quota.map((q: any) => {
                const pct = Math.round(q.used_days / q.total_days * 100)
                return (
                  <div key={q.id} className="mb-3 last:mb-0">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-700">{q.leave_type_name}</span>
                      <span className="font-medium">{q.remaining_days}/{q.total_days} วัน</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct > 80 ? '#E24B4A' : '#1D9E75' }} />
                    </div>
                  </div>
                )
              })}
        </div>

        {/* Pending (HR) */}
        {isHR && (
          <div className="card lg:col-span-2">
            <h2 className="text-sm font-semibold mb-3">รออนุมัติ ({pending.length})</h2>
            {pending.length === 0
              ? <p className="text-xs text-gray-400 py-4 text-center">ไม่มีคำขอรออนุมัติ</p>
              : pending.map((r: any) => (
                  <div key={r.id} className="flex items-center gap-3 py-2.5 border-b border-black/[0.05] last:border-0">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-[#111110]">{r.first_name} {r.last_name}</div>
                      <div className="text-xs text-gray-500">{r.leave_type_name} · {dayjs(r.start_date).format('D MMM')}–{dayjs(r.end_date).format('D MMM')} ({r.days_count} วัน)</div>
                      <div className="text-xs text-gray-400 mt-0.5">{r.reason}</div>
                    </div>
                    <div className="flex gap-1.5">
                      <button onClick={() => approve(r.id, 'rejected')} className="btn text-xs px-2.5 py-1.5 text-red-500 border-red-200 hover:bg-red-50">
                        <IconX size={13} />
                      </button>
                      <button onClick={() => approve(r.id, 'approved')} className="btn btn-primary text-xs px-2.5 py-1.5">
                        <IconCheck size={13} />
                      </button>
                    </div>
                  </div>
                ))}
          </div>
        )}

        {/* History */}
        <div className={clsx('card', !isHR && 'lg:col-span-2')}>
          <h2 className="text-sm font-semibold mb-3">ประวัติการลา</h2>
          {history.length === 0
            ? <p className="text-xs text-gray-400 py-4 text-center">ยังไม่มีประวัติ</p>
            : history.map((r: any) => (
                <div key={r.id} className="flex items-center gap-3 py-2.5 border-b border-black/[0.05] last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-[#111110]">{r.leave_type_name}</div>
                    <div className="text-xs text-gray-500">{dayjs(r.start_date).format('D MMM')}–{dayjs(r.end_date).format('D MMM YY')} · {r.days_count} วัน</div>
                  </div>
                  <span className={clsx('badge', STATUS_BADGE[r.status] || 'badge-gray')}>
                    {STATUS_TH[r.status] || r.status}
                  </span>
                </div>
              ))}
        </div>
      </div>
    </div>
  )
}
