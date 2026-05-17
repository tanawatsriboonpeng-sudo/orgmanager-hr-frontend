'use client'
// Backdate request modal — employee fills in: date (no future),
// request type (check-in only / check-out only / both), the relevant
// time(s), reason, and an optional evidence image. Submits to
// POST /attendance/backdate-request; HR/owner approves later from the
// daily-summary card.
//
// Extracted from src/app/(dashboard)/attendance/page.tsx to keep that
// file from drifting past 1.7K lines.
import { useState } from 'react'
import { IconPhoto, IconX } from '@tabler/icons-react'
import dayjs from 'dayjs'
import clsx from 'clsx'
import { attendanceApi } from '@/lib/api'

interface BackdateRequestModalProps {
  onClose: () => void
  onSubmitted: () => void
  onError: (m: string) => void
  // Pre-fill the date field. Used when the modal is opened from the
  // "ยื่นย้อนหลังพร้อมหลักฐาน" CTA on a rejected off-site row so the
  // employee doesn't have to retype the date.
  initialDate?: string
}

export default function BackdateRequestModal({
  onClose, onSubmitted, onError, initialDate,
}: BackdateRequestModalProps) {
  const today = dayjs().format('YYYY-MM-DD')
  const [date, setDate] = useState(initialDate || today)
  const [requestType, setRequestType] = useState<'check_in' | 'check_out' | 'both'>('both')
  const [checkInTime, setCheckInTime] = useState('09:00')
  const [checkOutTime, setCheckOutTime] = useState('17:00')
  const [reason, setReason] = useState('')
  // Optional evidence image (receipt, meeting screenshot, etc.). Stored
  // as a JPEG dataURL after a client-side resize to keep the payload
  // tiny — backend caps at ~1.5MB.
  const [attachment, setAttachment] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const needsIn  = requestType === 'check_in'  || requestType === 'both'
  const needsOut = requestType === 'check_out' || requestType === 'both'

  // Read the user's chosen file, draw it into a canvas down-scaled so
  // the longest edge is 1024px, then encode as JPEG at 0.7 quality.
  // Same approach as the selfie capture, just from a file picker
  // instead of getUserMedia.
  const onFile = (file: File | null | undefined) => {
    if (!file) return
    if (!/^image\//.test(file.type)) { onError('โปรดเลือกไฟล์รูปภาพ'); return }
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const maxEdge = 1024
        const scale = Math.min(1, maxEdge / Math.max(img.width, img.height))
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.drawImage(img, 0, 0, w, h)
        setAttachment(canvas.toDataURL('image/jpeg', 0.7))
      }
      img.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  }

  const submit = async () => {
    if (!reason.trim()) { onError('กรุณาระบุเหตุผล'); return }
    if (needsIn && !checkInTime) { onError('กรุณาระบุเวลาเข้างาน'); return }
    if (needsOut && !checkOutTime) { onError('กรุณาระบุเวลาออกงาน'); return }
    if (needsIn && needsOut && checkOutTime <= checkInTime) {
      onError('เวลาออกต้องอยู่หลังเวลาเข้า')
      return
    }
    setBusy(true)
    try {
      await attendanceApi.submitBackdate({
        date, requestType,
        checkInTime:  needsIn  ? checkInTime  : undefined,
        checkOutTime: needsOut ? checkOutTime : undefined,
        reason: reason.trim(),
        attachment: attachment || undefined,
      })
      onSubmitted()
    } catch (e: any) {
      onError(e.response?.data?.message || 'ส่งคำขอไม่สำเร็จ')
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-[14px] shadow-xl w-full max-w-md max-h-[92vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-black/[0.06]">
          <h2 className="text-base font-semibold text-[#111110]">ขอลงเวลาย้อนหลัง</h2>
          <button onClick={onClose} className="btn btn-ghost p-1.5" aria-label="ปิด">
            <IconX size={16} />
          </button>
        </div>
        <div className="p-4 space-y-3">
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
          <div>
            <label className="label">ประเภทคำขอ</label>
            <div className="grid grid-cols-3 gap-1.5">
              {([
                ['both', 'เข้า+ออก'],
                ['check_in', 'เข้างาน'],
                ['check_out', 'ออกงาน'],
              ] as const).map(([val, txt]) => (
                <button
                  key={val}
                  onClick={() => setRequestType(val)}
                  className={clsx(
                    'btn text-xs justify-center py-2',
                    requestType === val && 'btn-primary'
                  )}
                >
                  {txt}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {needsIn && (
              <div>
                <label className="label">เวลาเข้างาน</label>
                <input type="time" className="input" value={checkInTime} onChange={e => setCheckInTime(e.target.value)} />
              </div>
            )}
            {needsOut && (
              <div>
                <label className="label">เวลาออกงาน</label>
                <input type="time" className="input" value={checkOutTime} onChange={e => setCheckOutTime(e.target.value)} />
              </div>
            )}
          </div>
          <div>
            <label className="label">เหตุผล *</label>
            <textarea
              className="input min-h-[70px] text-[13px]"
              placeholder="เช่น ลืมตอกบัตร, เครื่องเสีย, ออกประชุมก่อนปิดงาน..."
              value={reason}
              onChange={e => setReason(e.target.value)}
            />
          </div>
          <div>
            <label className="label">รูปหลักฐาน (ไม่บังคับ)</label>
            {attachment ? (
              <div className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={attachment} alt="หลักฐาน" className="w-16 h-16 rounded-[8px] object-cover border border-black/[0.05]" />
                <button
                  onClick={() => setAttachment(null)}
                  className="btn text-xs text-red-500 border-red-200"
                >
                  ลบรูป
                </button>
              </div>
            ) : (
              <label className="btn text-xs cursor-pointer inline-flex items-center gap-1.5">
                <IconPhoto size={14} />
                เลือกรูป / ถ่ายรูป
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={e => onFile(e.target.files?.[0])}
                />
              </label>
            )}
            <p className="text-[10px] text-gray-400 mt-1">เช่น ใบเสร็จ, ภาพห้องประชุม, screenshot นัด</p>
          </div>
        </div>
        <div className="flex gap-2 justify-end p-4 border-t border-black/[0.06]">
          <button onClick={onClose} className="btn text-sm">ยกเลิก</button>
          <button onClick={submit} disabled={busy || !reason.trim()} className="btn btn-primary text-sm">
            {busy ? 'กำลังส่ง…' : 'ส่งคำขอ'}
          </button>
        </div>
      </div>
    </div>
  )
}
