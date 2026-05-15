'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import {
  IconBuilding, IconEye, IconEyeOff,
  IconCrown, IconUsers, IconUser,
  IconAlertCircle, IconFingerprint, IconArrowRight
} from '@tabler/icons-react'

type Role = 'owner' | 'hr' | 'employee'

const ROLES = [
  { key: 'owner' as Role, label: 'เจ้าของ', icon: IconCrown, color: '#534AB7', bg: '#EEEDFE', demo: 'owner@company.co.th' },
  { key: 'hr' as Role, label: 'HR Admin', icon: IconUsers, color: '#1D9E75', bg: '#E1F5EE', demo: 'hr@company.co.th' },
  { key: 'employee' as Role, label: 'พนักงาน', icon: IconUser, color: '#185FA5', bg: '#E6F1FB', demo: 'somchai@company.co.th' },
]

export default function LoginPage() {
  const [role, setRole] = useState<Role>('owner')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuthStore()
  const router = useRouter()

  const selectedRole = ROLES.find(r => r.key === role)!

  const handleLogin = async (e?: React.FormEvent, demoEmail?: string) => {
    e?.preventDefault()
    setError('')
    setLoading(true)
    try {
      const emailToUse = demoEmail || email
      await login(emailToUse, demoEmail ? '1234' : password, role)
      router.replace('/dashboard')
    } catch (err: any) {
      setError(err.response?.data?.message || 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setLoading(false)
    }
  }

  const fillDemo = () => {
    setEmail(selectedRole.demo)
    setPassword('1234')
  }

  return (
    <div className="min-h-screen bg-[#F7F7F5] flex">
      {/* Left panel - branding */}
      <div className="hidden lg:flex flex-col justify-between w-[420px] bg-[#0F6E56] p-10 text-white flex-shrink-0">
        <div>
          <div className="flex items-center gap-3 mb-16">
            <div className="w-9 h-9 bg-white/10 rounded-xl flex items-center justify-center">
              <IconBuilding size={20} />
            </div>
            <span className="font-semibold text-lg">OrgManager HR</span>
          </div>
          <h1 className="text-4xl font-semibold leading-tight mb-4">
            ระบบบริหาร<br />บุคคลครบวงจร
          </h1>
          <p className="text-white/70 text-sm leading-relaxed">
            จัดการพนักงาน เช็คอิน ลงเวลา การลา เงินเดือน
            โปรเจกต์ และการเงิน ในแอปเดียว
          </p>
        </div>

        <div className="space-y-3">
          {[
            '12 โมดูลครบในแอปเดียว',
            'เช็คอิน GPS รัศมี 60 เมตร',
            'สลิปเงินเดือนดิจิทัล',
            'Dashboard real-time',
          ].map((f) => (
            <div key={f} className="flex items-center gap-2.5 text-sm text-white/80">
              <div className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                <IconArrowRight size={10} />
              </div>
              {f}
            </div>
          ))}
        </div>
      </div>

      {/* Right panel - form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-[400px]">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-8 h-8 bg-[#1D9E75] rounded-xl flex items-center justify-center">
              <IconBuilding size={16} className="text-white" />
            </div>
            <span className="font-semibold text-[#111110]">OrgManager HR</span>
          </div>

          <h2 className="text-2xl font-semibold text-[#111110] mb-1">เข้าสู่ระบบ</h2>
          <p className="text-sm text-gray-500 mb-7">เลือกประเภทบัญชีและกรอกข้อมูล</p>

          {/* Role selector */}
          <div className="grid grid-cols-3 gap-2 mb-6 p-1.5 bg-gray-100 rounded-[12px]">
            {ROLES.map((r) => {
              const Icon = r.icon
              const isActive = role === r.key
              return (
                <button
                  key={r.key}
                  onClick={() => { setRole(r.key); setEmail(''); setError('') }}
                  className={`flex flex-col items-center gap-1.5 py-2.5 px-2 rounded-[9px] text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-white shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                  style={{ color: isActive ? r.color : undefined }}
                >
                  <Icon size={16} />
                  {r.label}
                </button>
              )
            })}
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-[10px] text-sm mb-4 animate-fade-in">
              <IconAlertCircle size={16} className="flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="label">อีเมล / รหัสพนักงาน</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={selectedRole.demo}
                className="input"
                required
              />
            </div>
            <div>
              <label className="label">รหัสผ่าน</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPw ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary w-full justify-center py-3 text-sm"
              style={{ background: selectedRole.color, borderColor: selectedRole.color }}
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : 'เข้าสู่ระบบ'}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400">หรือ</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* Biometric / Demo */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handleLogin(undefined, selectedRole.demo)}
              className="btn justify-center text-xs py-2.5 gap-1.5"
            >
              <IconFingerprint size={15} style={{ color: selectedRole.color }} />
              Face ID / Biometric
            </button>
            <button onClick={fillDemo} className="btn justify-center text-xs py-2.5 gap-1.5">
              <span style={{ color: selectedRole.color }}>ทดลองระบบ</span>
            </button>
          </div>

          <p className="text-center text-[11px] text-gray-400 mt-6">
            ทดลองใช้: รหัสผ่าน <code className="bg-gray-100 px-1 rounded">1234</code> ทุกบัญชี
          </p>
        </div>
      </div>
    </div>
  )
}
