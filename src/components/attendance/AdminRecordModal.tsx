'use client'
// HR/owner "ลงเวลาให้พนักงาน" modal — writes an attendance_logs row
// directly without an approval round-trip. Audit-logged on the backend
// so the trail records who did it. Extracted from the attendance page
// for the same de-bloat reason as SelfieModal/BackdateRequestModal.
import { useEffect, useState } from 'react'
import { IconX } from '@tabler/icons-react'
import dayjs from 'dayjs'
import { attendanceApi, employeeApi } from '@/lib/api'

interface AdminRecordModalProps {
  onClose: () => void
  onSubmitted: (msg: string) => void
  onError: (m: string) => void
}

export default function AdminRecordModal({ onClose, onSubmitted, onError }: AdminRecordModalProps) {
  const today = dayjs().format('YYYY-MM-DD')
  const [employees, setEmployees] = useState<any[]>([])
  const [employeeId, setEmployeeId] = useState('')
  const [date, setDate] = useState(today)
  const [checkInTime, setCheckInTime] = useState('09:00')
  const [checkOutTime, setCheckOutTime] = useState('17:00')
  const [includeIn, setIncludeIn] = useState(true)
  const [includeOut, setIncludeOut] = useState(true)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    employeeApi.list()
      .then(r => {
        const list = (r.data.data || []).filter((e: any) => e.role !== 'owner')
        setEmployees(list)
        if (list[0]) setEmployeeId(list[0].id)
      })
      .catch(() => {})
  }, [])

  const submit = async () => {
    if (!employeeId) { onError('กรุณาเลือกพนักงาน'); return }
    if (!includeIn && !includeOut) { onError('ต้องเลือกอย่างน้อยเข้าหรือออก 1 อย่าง'); return }
    if (includeIn && includeOut && checkOutTime <= checkInTime) {
      onError('เวลาออกต้องอยู่หลังเวลาเข้า'); return
    }
    setBusy(true)
    try {
      const r = await attendanceApi.adminRecord({
        employeeId,
        date,
        checkInTime:  includeIn  ? checkInTime  : undefined,
        checkOutTime: includeOut ? checkOutTime : undefined,
        note: note.trim() || undefined,
      })
      onSubmitted(r.data.message || 'ลงเวลาให้พนักงานแล้ว')
    } catch (e: any) {
      onError(e.response?.data?.message || 'ลงเวลาไม่สำเร็จ')
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-[14px] shadow-xl w-full max-w-md max-h-[92vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-black/[0.06]">
          <h2 className="text-base font-semibold text-[#111110]">ลงเวลาให้พนักงาน</h2>
          <button onClick={onClose} className="btn btn-ghost p-1.5" aria-label="ปิด">
            <IconX size={16} />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="label">พนักงาน</label>
            <select className="input" value={employeeId} onChange={e => setEmployeeId(e.target.value)}>
              {employees.length === 0 && <option value="">— ไม่มีพนักงาน —</option>}
              {employees.map((e: any) => (
                <option key={e.id} value={e.id}>
                  {e.first_name} {e.last_name}
                  {e.nickname ? ` (${e.nickname})` : ''}
                  {e.employee_id ? ` · ${e.employee_id}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">วันที่</label>
            <input
              type="date"
              className="input"
              max={today}
              value={date}
              onChange={e => setDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <div className="grid grid-cols-[auto_1fr] items-end gap-3">
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input type="checkbox" checked={includeIn} onChange={e => setIncludeIn(e.target.checked)} />
                <span className="text-[12px] text-gray-700">เวลาเข้า</span>
              </label>
              <input
                type="time"
                className="input disabled:opacity-50"
                value={checkInTime}
                disabled={!includeIn}
                onChange={e => setCheckInTime(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-[auto_1fr] items-end gap-3">
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input type="checkbox" checked={includeOut} onChange={e => setIncludeOut(e.target.checked)} />
                <span className="text-[12px] text-gray-700">เวลาออก</span>
              </label>
              <input
                type="time"
                className="input disabled:opacity-50"
                value={checkOutTime}
                disabled={!includeOut}
                onChange={e => setCheckOutTime(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="label">หมายเหตุ (ไม่บังคับ)</label>
            <textarea
              className="input min-h-[50px] text-[13px]"
              placeholder="เช่น มาตรงเวลาแต่ระบบขัดข้อง, ออกประชุมต่างสาขา..."
              value={note}
              onChange={e => setNote(e.target.value)}
            />
          </div>
          {/* Subtle warning that this writes directly without an
              approval round-trip; the audit log records who did it. */}
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-[8px] p-2">
            หมายเหตุ: การลงเวลานี้จะเขียนทับ row เดิม (ถ้ามี) ทันทีและบันทึกใน audit log ว่าคุณเป็นผู้ดำเนินการ
          </p>
        </div>
        <div className="flex gap-2 justify-end p-4 border-t border-black/[0.06]">
          <button onClick={onClose} className="btn text-sm">ยกเลิก</button>
          <button onClick={submit} disabled={busy || !employeeId} className="btn btn-primary text-sm">
            {busy ? 'กำลังบันทึก…' : 'ลงเวลา'}
          </button>
        </div>
      </div>
    </div>
  )
}
