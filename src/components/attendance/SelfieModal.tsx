'use client'
// Selfie capture modal — drives webcam → snapshot → submit. Surfaces an
// off-site toggle inline so the same UI works for both:
//   - normal in-radius check-in: take selfie + submit
//   - off-site check-in: take selfie + tick off-site + reason → submit
//     for HR/owner approval
//
// Originally lived inline in src/app/(dashboard)/attendance/page.tsx;
// extracted here to keep that page from creeping past 1.7K lines and to
// make the modal reusable from other surfaces (mobile-only check-in
// flows, future kiosk mode, etc.).
import { useCallback, useEffect, useRef, useState } from 'react'
import { IconAlertTriangle, IconCheck, IconRefresh, IconX } from '@tabler/icons-react'

interface SelfieModalProps {
  onClose: () => void
  onSubmit: (data: { dataUrl: string; offsite: boolean; reason?: string }) => void
  busy: boolean
}

export default function SelfieModal({ onClose, onSubmit, busy }: SelfieModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [phase, setPhase] = useState<'starting' | 'live' | 'preview' | 'error'>('starting')
  const [errorMsg, setErrorMsg] = useState('')
  const [snapshot, setSnapshot] = useState<string | null>(null)
  // Off-site toggle + reason. When the checkbox is on, the submit button
  // changes to "ส่งคำขอ" and the API gets called with offsite=true. The
  // reason field is only required in that mode.
  const [offsite, setOffsite] = useState(false)
  const [reason, setReason] = useState('')

  const stopStream = () => {
    if (streamRef.current) {
      for (const t of streamRef.current.getTracks()) t.stop()
      streamRef.current = null
    }
  }

  const startCamera = useCallback(async () => {
    stopStream()
    setSnapshot(null)
    setPhase('starting')
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('อุปกรณ์นี้ไม่รองรับการใช้กล้อง')
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }
      setPhase('live')
    } catch (e: any) {
      const msg = e?.name === 'NotAllowedError'
        ? 'กล้องถูกปฏิเสธ — โปรดอนุญาตในการตั้งค่าเบราว์เซอร์แล้วเปิดใหม่'
        : e?.message || 'เปิดกล้องไม่สำเร็จ'
      setErrorMsg(msg)
      setPhase('error')
    }
  }, [])

  useEffect(() => {
    startCamera()
    return () => stopStream()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const snap = () => {
    const v = videoRef.current
    if (!v) return
    // Down-scale longest edge to 480 to keep the dataURL small.
    const srcW = v.videoWidth || 640
    const srcH = v.videoHeight || 480
    const scale = 480 / Math.max(srcW, srcH)
    const w = Math.round(srcW * scale)
    const h = Math.round(srcH * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(v, 0, 0, w, h)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.7)
    setSnapshot(dataUrl)
    setPhase('preview')
    stopStream()
  }

  const retake = () => { startCamera() }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-[14px] shadow-xl w-full max-w-md max-h-[92vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-black/[0.06]">
          <h2 className="text-base font-semibold text-[#111110]">
            {phase === 'preview' ? 'ตรวจสอบรูปก่อนเช็คอิน' : 'ถ่ายเซลฟี่เพื่อเช็คอิน'}
          </h2>
          <button onClick={onClose} className="btn btn-ghost p-1.5" aria-label="ปิด">
            <IconX size={16} />
          </button>
        </div>
        <div className="p-4">
          <div className="relative w-full rounded-[10px] overflow-hidden bg-black/90 aspect-[4/3] mb-3">
            {phase === 'live' && (
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                playsInline
                muted
              />
            )}
            {phase === 'preview' && snapshot && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={snapshot} alt="snapshot" className="w-full h-full object-cover" />
            )}
            {phase === 'starting' && (
              <div className="absolute inset-0 flex items-center justify-center text-white/70 text-sm">
                กำลังเปิดกล้อง…
              </div>
            )}
            {phase === 'error' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center text-white/90 text-sm">
                <IconAlertTriangle size={28} className="mb-2 text-amber-300" />
                <p>{errorMsg}</p>
              </div>
            )}
          </div>

          {phase === 'live' && (
            <button
              onClick={snap}
              className="btn btn-primary w-full justify-center py-3"
            >
              <IconCheck size={16} /> ถ่ายภาพ
            </button>
          )}
          {phase === 'preview' && (
            <>
              {/* Off-site toggle. If the employee is working outside the
                  office, they tick this; the submit changes to "ส่งคำขอ"
                  and HR/owner has to approve before it counts. The reason
                  field appears inline so they don't lose the snapshot. */}
              <label className="flex items-start gap-2 mb-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={offsite}
                  onChange={e => setOffsite(e.target.checked)}
                />
                <span className="text-[12px] text-gray-700 leading-snug">
                  ลงเวลานอกสถานที่ (ทำงานนอกออฟฟิศ)
                  <span className="block text-[11px] text-gray-400">
                    ต้องระบุเหตุผลและรอ HR/เจ้าของอนุมัติ
                  </span>
                </span>
              </label>
              {offsite && (
                <div className="mb-3">
                  <label className="label">เหตุผล *</label>
                  <textarea
                    className="input min-h-[60px] text-[13px]"
                    placeholder="เช่น ประชุมลูกค้าที่ไซต์, ลงพื้นที่จังหวัด..."
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    autoFocus
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button onClick={retake} disabled={busy} className="btn justify-center py-3">
                  <IconRefresh size={15} /> ถ่ายใหม่
                </button>
                <button
                  onClick={() => snapshot && onSubmit({
                    dataUrl: snapshot,
                    offsite,
                    reason: offsite ? reason.trim() : undefined,
                  })}
                  disabled={busy || (offsite && !reason.trim())}
                  className="btn btn-primary justify-center py-3 disabled:opacity-50"
                >
                  <IconCheck size={16} /> {busy ? 'กำลังส่ง…' : (offsite ? 'ส่งคำขอ' : 'เช็คอิน')}
                </button>
              </div>
            </>
          )}
          {phase === 'error' && (
            <button onClick={startCamera} className="btn w-full justify-center py-3">
              ลองใหม่
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
