'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import api from '@/lib/api'
import { IconMail, IconShieldCheck, IconLock, IconArrowLeft, IconCheck, IconX, IconEye, IconEyeOff } from '@tabler/icons-react'
import Link from 'next/link'

type Step = 'email' | 'otp' | 'newpassword' | 'success'

export default function ForgotPasswordPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [countdown, setCountdown] = useState(0)

  const startCountdown = () => {
    setCountdown(60)
    const timer = setInterval(() => {
      setCountdown(prev => { if (prev <= 1) { clearInterval(timer); return 0 } return prev - 1 })
    }, 1000)
  }

  const handleSendOTP = async () => {
    if (!email) { setError('กรุณากรอกอีเมล'); return }
    setLoading(true); setError('')
    try {
      await api.post('/auth/forgot-password', { email })
      setStep('otp'); startCountdown()
    } catch (e: any) {
      setError(e.response?.data?.message || 'เกิดข้อผิดพลาด')
    } finally { setLoading(false) }
  }

  const handleVerifyOTP = async () => {
    if (otp.length !== 6) { setError('กรุณากรอก OTP 6 หลัก'); return }
    setLoading(true); setError('')
    try {
      const res = await api.post('/auth/verify-otp', { email, otp })
      setResetToken(res.data.data.resetToken); setStep('newpassword')
    } catch (e: any) {
      setError(e.response?.data?.message || 'OTP ไม่ถูกต้อง')
    } finally { setLoading(false) }
  }

  const handleResetPassword = async () => {
    if (newPassword !== confirmPassword) { setError('รหัสผ่านไม่ตรงกัน'); return }
    if (newPassword.length < 6) { setError('รหัสผ่านต้องมีอย่างน้อย 6 ตัว'); return }
    setLoading(true); setError('')
    try {
      await api.post('/auth/reset-password', { email, resetToken, newPassword })
      setStep('success')
    } catch (e: any) {
      setError(e.response?.data?.message || 'เกิดข้อผิดพลาด')
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-[#F7F7F5] flex items-center justify-center p-4">
      <div className="w-full max-w-[400px]">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-8 h-8 bg-[#1D9E75] rounded-xl flex items-center justify-center">
            <span className="text-white text-xs font-bold">SC</span>
          </div>
          <div>
            <div className="text-sm font-semibold text-[#111110]">สิริคอนส์</div>
            <div className="text-[10px] text-gray-400">HR System</div>
          </div>
        </div>

        <div className="card">
          {step === 'email' && (
            <>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-9 h-9 bg-[#E1F5EE] rounded-xl flex items-center justify-center">
                  <IconMail size={18} className="text-[#1D9E75]" />
                </div>
                <div>
                  <div className="text-sm font-semibold">ลืมรหัสผ่าน?</div>
                  <div className="text-xs text-gray-500">กรอก Gmail เพื่อรับ OTP</div>
                </div>
              </div>
              {error && <div className="flex items-center gap-2 p-2.5 bg-red-50 text-red-600 text-xs rounded-[8px] mb-3"><IconX size={13}/>{error}</div>}
              <div className="mb-4">
                <label className="label">Gmail ที่ลงทะเบียนไว้</label>
                <input type="email" className="input" value={email}
                  onChange={e => setEmail(e.target.value)} placeholder="your@gmail.com"
                  onKeyDown={e => e.key==='Enter' && handleSendOTP()} />
              </div>
              <button onClick={handleSendOTP} disabled={loading} className="btn btn-primary w-full justify-center py-2.5">
                {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : 'ส่ง OTP ไปที่อีเมล'}
              </button>
            </>
          )}

          {step === 'otp' && (
            <>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-9 h-9 bg-[#EEEDFE] rounded-xl flex items-center justify-center">
                  <IconShieldCheck size={18} className="text-[#534AB7]" />
                </div>
                <div>
                  <div className="text-sm font-semibold">กรอก OTP</div>
                  <div className="text-xs text-gray-500">ส่งไปที่ <strong>{email}</strong></div>
                </div>
              </div>
              {error && <div className="flex items-center gap-2 p-2.5 bg-red-50 text-red-600 text-xs rounded-[8px] mb-3"><IconX size={13}/>{error}</div>}
              <div className="mb-4">
                <label className="label">รหัส OTP 6 หลัก</label>
                <input type="text" className="input text-center text-2xl font-bold tracking-[8px]"
                  value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g,'').slice(0,6))}
                  placeholder="000000" maxLength={6}
                  onKeyDown={e => e.key==='Enter' && handleVerifyOTP()} />
                <div className="text-xs text-gray-400 mt-1.5">หมดอายุใน 10 นาที</div>
              </div>
              <button onClick={handleVerifyOTP} disabled={loading||otp.length!==6} className="btn btn-primary w-full justify-center py-2.5 mb-2">
                {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : 'ยืนยัน OTP'}
              </button>
              <button onClick={() => { if(countdown===0) handleSendOTP() }} disabled={countdown>0} className="btn w-full justify-center text-xs py-2">
                {countdown>0 ? `ขอ OTP ใหม่ได้ใน ${countdown} วินาที` : 'ขอ OTP ใหม่'}
              </button>
            </>
          )}

          {step === 'newpassword' && (
            <>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-9 h-9 bg-[#E1F5EE] rounded-xl flex items-center justify-center">
                  <IconLock size={18} className="text-[#1D9E75]" />
                </div>
                <div>
                  <div className="text-sm font-semibold">ตั้งรหัสผ่านใหม่</div>
                  <div className="text-xs text-gray-500">อย่างน้อย 6 ตัวอักษร</div>
                </div>
              </div>
              {error && <div className="flex items-center gap-2 p-2.5 bg-red-50 text-red-600 text-xs rounded-[8px] mb-3"><IconX size={13}/>{error}</div>}
              <div className="space-y-3 mb-4">
                <div>
                  <label className="label">รหัสผ่านใหม่</label>
                  <div className="relative">
                    <input type={showPw?'text':'password'} className="input pr-10"
                      value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="อย่างน้อย 6 ตัว" />
                    <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                      {showPw ? <IconEyeOff size={16}/> : <IconEye size={16}/>}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="label">ยืนยันรหัสผ่านใหม่</label>
                  <input type={showPw?'text':'password'} className="input"
                    value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="พิมพ์อีกครั้ง"
                    onKeyDown={e => e.key==='Enter' && handleResetPassword()} />
                </div>
              </div>
              <button onClick={handleResetPassword} disabled={loading} className="btn btn-primary w-full justify-center py-2.5">
                {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : 'บันทึกรหัสผ่านใหม่'}
              </button>
            </>
          )}

          {step === 'success' && (
            <div className="text-center py-4">
              <div className="w-14 h-14 bg-[#E1F5EE] rounded-full flex items-center justify-center mx-auto mb-4">
                <IconCheck size={28} className="text-[#1D9E75]" />
              </div>
              <h3 className="text-base font-semibold mb-1">เปลี่ยนรหัสผ่านสำเร็จ!</h3>
              <p className="text-sm text-gray-500 mb-5">กรุณา Login ด้วยรหัสผ่านใหม่</p>
              <button onClick={() => router.replace('/login')} className="btn btn-primary w-full justify-center py-2.5">
                ไป Login
              </button>
            </div>
          )}
        </div>

        <div className="text-center mt-4">
          <Link href="/login" className="text-xs text-gray-500 hover:text-[#1D9E75] flex items-center justify-center gap-1">
            <IconArrowLeft size={13}/> กลับหน้า Login
          </Link>
        </div>
      </div>
    </div>
  )
}
