'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import { IconEye, IconEyeOff, IconCrown, IconUsers, IconUser, IconAlertCircle, IconBuilding, IconBrandLine } from '@tabler/icons-react'
import Link from 'next/link'

type Role = 'owner' | 'hr' | 'employee'
const ROLES = [
  { key: 'owner' as Role, label: 'เจ้าของ', icon: IconCrown, color: '#534AB7' },
  { key: 'hr' as Role, label: 'HR Admin', icon: IconUsers, color: '#1D9E75' },
  { key: 'employee' as Role, label: 'พนักงาน', icon: IconUser, color: '#185FA5' },
]

export default function LoginPage() {
  const [role, setRole] = useState<Role>('owner')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login, loginWithLine } = useAuthStore()
  const router = useRouter()
  const selectedRole = ROLES.find(r => r.key === role)!

  // When the layout's LIFF auto-login bounces here with status='not-linked',
  // it parks the LINE access token in sessionStorage. We pick it up to
  // render a "ผูกบัญชี LINE" banner and use it instead of plain /auth/login
  // — that single submit verifies email+password AND binds the LINE id.
  const [linePairing, setLinePairing] = useState<{
    token: string
    displayName?: string
    pictureUrl?: string
  } | null>(null)

  useEffect(() => {
    const token = sessionStorage.getItem('pendingLineAccessToken')
    if (!token) return
    setLinePairing({
      token,
      displayName: sessionStorage.getItem('pendingLineDisplayName') || undefined,
      pictureUrl: sessionStorage.getItem('pendingLinePictureUrl') || undefined,
    })
  }, [])

  const clearLinePairing = () => {
    sessionStorage.removeItem('pendingLineAccessToken')
    sessionStorage.removeItem('pendingLineDisplayName')
    sessionStorage.removeItem('pendingLinePictureUrl')
    setLinePairing(null)
  }

  const handleLogin = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setError(''); setLoading(true)
    try {
      if (linePairing) {
        const res = await loginWithLine(linePairing.token, { email, password })
        if (res.status !== 'ok') {
          setError('ผูกบัญชี LINE ไม่สำเร็จ — กรุณาลองใหม่')
          return
        }
        clearLinePairing()
      } else {
        await login(email, password)
      }
      router.replace('/dashboard')
    } catch (err: any) {
      setError(err.response?.data?.message || 'เข้าสู่ระบบไม่สำเร็จ')
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-[#F7F7F5] flex">
      <div className="hidden lg:flex flex-col justify-between w-[420px] bg-[#0F6E56] p-10 text-white flex-shrink-0">
        <div>
          <div className="flex items-center gap-3 mb-16">
            <div className="w-9 h-9 bg-white/10 rounded-xl flex items-center justify-center"><IconBuilding size={20} /></div>
            <div><div className="font-semibold text-lg">สิริคอนส์</div><div className="text-white/60 text-xs">HR System</div></div>
          </div>
          <h1 className="text-4xl font-semibold leading-tight mb-4">ระบบบริหาร<br />บุคคลครบวงจร</h1>
          <p className="text-white/70 text-sm leading-relaxed">บริษัท สิริคอนส์ คอนสตรัคชั่น จำกัด<br />จัดการพนักงาน เช็คอิน ลงเวลา การลา เงินเดือน</p>
        </div>
        <div className="space-y-3">
          {['12 โมดูลครบในแอปเดียว','เช็คอิน GPS รัศมี 60 เมตร','สลิปเงินเดือนดิจิทัล','Dashboard real-time'].map(f => (
            <div key={f} className="flex items-center gap-2.5 text-sm text-white/80">
              <div className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">›</div>{f}
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-[400px]">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-8 h-8 bg-[#1D9E75] rounded-xl flex items-center justify-center"><IconBuilding size={16} className="text-white" /></div>
            <div><div className="font-semibold text-[#111110] text-sm">สิริคอนส์</div><div className="text-[10px] text-gray-400">HR System</div></div>
          </div>

          <h2 className="text-2xl font-semibold text-[#111110] mb-1">
            {linePairing ? 'ผูกบัญชี LINE' : 'เข้าสู่ระบบ'}
          </h2>
          <p className="text-sm text-gray-500 mb-7">
            {linePairing
              ? 'กรอกอีเมล/รหัสผ่านของพนักงานเพื่อผูกบัญชี LINE ของคุณ'
              : 'เลือกประเภทบัญชีและกรอกข้อมูล'}
          </p>

          {linePairing && (
            <div className="mb-5 p-3 rounded-[12px] border border-[#06C755]/30 bg-[#06C755]/[0.06] flex items-center gap-3">
              {linePairing.pictureUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={linePairing.pictureUrl} alt="line"
                  className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-[#06C755] text-white flex items-center justify-center flex-shrink-0">
                  <IconBrandLine size={20} />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-xs text-gray-500">LINE ของคุณ</div>
                <div className="text-sm font-medium text-[#111110] truncate">
                  {linePairing.displayName || 'LINE user'}
                </div>
              </div>
              <button
                type="button"
                onClick={clearLinePairing}
                className="text-[11px] text-gray-500 hover:text-gray-700 underline"
              >
                ยกเลิก
              </button>
            </div>
          )}

          <div className={linePairing ? 'hidden' : 'grid grid-cols-3 gap-2 mb-6 p-1.5 bg-gray-100 rounded-[12px]'}>
            {ROLES.map(r => {
              const Icon = r.icon
              const isActive = role === r.key
              return (
                <button key={r.key} onClick={() => { setRole(r.key); setEmail(''); setError('') }}
                  className={`flex flex-col items-center gap-1.5 py-2.5 px-2 rounded-[9px] text-xs font-medium transition-all ${isActive ? 'bg-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                  style={{ color: isActive ? r.color : undefined }}>
                  <Icon size={16} />{r.label}
                </button>
              )
            })}
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-[10px] text-sm mb-4">
              <IconAlertCircle size={16} className="flex-shrink-0" />{error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="label">อีเมล</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@gmail.com" className="input" required />
            </div>
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="label !mb-0">รหัสผ่าน</label>
                <Link href="/forgot-password" className="text-[11px] text-[#1D9E75] hover:underline">ลืมรหัสผ่าน?</Link>
              </div>
              <div className="relative">
                <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" className="input pr-10" required />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                  {showPw ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading} className="btn btn-primary w-full justify-center py-3"
              style={{
                background: linePairing ? '#06C755' : selectedRole.color,
                borderColor: linePairing ? '#06C755' : selectedRole.color,
              }}>
              {loading
                ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : linePairing ? 'ผูกบัญชี LINE' : 'เข้าสู่ระบบ'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
