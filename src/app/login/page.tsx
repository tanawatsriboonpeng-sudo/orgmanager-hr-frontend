'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import {
  IconEye, IconEyeOff, IconCrown, IconUsers, IconUser,
  IconAlertCircle, IconBuilding, IconBrandLine,
  IconMail, IconLock,
} from '@tabler/icons-react'
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
      {/* ============================================================
          LEFT — minimal brand panel (desktop only). Just the logo
          and the headline; no feature list, no subtitle, no footer.
          The form on the right is the focus.
          ============================================================ */}
      <div className="hidden lg:flex flex-col justify-center w-[460px] p-10 text-white flex-shrink-0 relative overflow-hidden">
        {/* Layered background — base + a soft glow in each corner so
            the flat green has some quiet depth. */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#0F6E56] via-[#0F6E56] to-[#0A5340]" />
        <div className="absolute -top-32 -right-24 w-80 h-80 rounded-full bg-[#1D9E75]/30 blur-3xl" />
        <div className="absolute -bottom-24 -left-16 w-72 h-72 rounded-full bg-[#06C755]/15 blur-3xl" />

        <div className="relative">
          <div className="flex items-center gap-3 mb-10">
            <div className="w-10 h-10 bg-white/15 backdrop-blur-sm rounded-xl flex items-center justify-center shadow-sm">
              <IconBuilding size={20} />
            </div>
            <div>
              <div className="font-semibold text-lg leading-tight">สิริคอนส์</div>
              <div className="text-white/60 text-[11px]">HR System</div>
            </div>
          </div>
          <h1 className="text-[40px] font-semibold leading-[1.15] tracking-tight">
            ระบบบริหาร<br />
            <span className="text-white/90">บุคคลครบวงจร</span>
          </h1>
        </div>
      </div>

      {/* ============================================================
          RIGHT — sign-in form. Card has subtle shadow + border so it
          feels lifted; the form itself stays compact at 400px max
          width on desktop, full-width on mobile.
          ============================================================ */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-[400px]">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-8 h-8 bg-[#1D9E75] rounded-xl flex items-center justify-center">
              <IconBuilding size={16} className="text-white" />
            </div>
            <div>
              <div className="font-semibold text-[#111110] text-sm">สิริคอนส์</div>
              <div className="text-[10px] text-gray-400">HR System</div>
            </div>
          </div>

          <h2 className="text-2xl font-semibold text-[#111110] mb-1.5 tracking-tight">
            {linePairing ? 'ผูกบัญชี LINE' : 'ยินดีต้อนรับกลับมา 👋'}
          </h2>
          <p className="text-sm text-gray-500 mb-7">
            {linePairing
              ? 'กรอกอีเมล/รหัสผ่านของพนักงานเพื่อผูกบัญชี LINE ของคุณ'
              : 'เลือกประเภทบัญชีและกรอกข้อมูลเพื่อเข้าสู่ระบบ'}
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

          {/* Role segmented control. Active tab gets a white card +
              role-tint accent (top hairline bar + tinted icon). Quieter
              than the previous "whole tab colored" treatment so the
              brand-green submit button below is the loudest CTA. */}
          <div className={linePairing ? 'hidden' : 'grid grid-cols-3 gap-1 mb-6 p-1 bg-gray-100 rounded-[12px]'}>
            {ROLES.map(r => {
              const Icon = r.icon
              const isActive = role === r.key
              return (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => { setRole(r.key); setEmail(''); setError('') }}
                  className={`relative flex flex-col items-center gap-1 py-2.5 px-2 rounded-[10px] text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06)] text-[#111110]'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {isActive && (
                    <span
                      className="absolute left-3 right-3 top-1 h-0.5 rounded-full"
                      style={{ background: r.color }}
                    />
                  )}
                  <Icon size={16} style={{ color: isActive ? r.color : undefined }} />
                  {r.label}
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
              <div className="relative">
                <IconMail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="your@gmail.com"
                  className="input pl-9"
                  autoComplete="email"
                  required
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="label !mb-0">รหัสผ่าน</label>
                <Link href="/forgot-password" className="text-[11px] text-[#1D9E75] hover:underline">ลืมรหัสผ่าน?</Link>
              </div>
              <div className="relative">
                <IconLock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input pl-9 pr-10"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  aria-label={showPw ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                >
                  {showPw ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                </button>
              </div>
            </div>
            {/* Brand-green submit. Was role-tinted (purple for owner)
                which clashed with the rest of the app; the role
                accent now lives on the tab above and the icon next
                to the role name on this button, keeping consistent
                green for the actual primary action. */}
            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-[10px] text-sm font-semibold text-white transition-all shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
              style={{
                background: linePairing
                  ? '#06C755'
                  : 'linear-gradient(135deg, #1D9E75 0%, #0F6E56 100%)',
              }}
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : linePairing ? (
                <>
                  <IconBrandLine size={16} /> ผูกบัญชี LINE
                </>
              ) : (
                <>
                  <selectedRole.icon size={15} />
                  เข้าสู่ระบบในฐานะ{selectedRole.label}
                </>
              )}
            </button>
          </form>

          <div className="mt-8 text-center text-[11px] text-gray-400">
            พบปัญหาในการเข้าใช้งาน? ติดต่อ HR หรือเจ้าของระบบ
          </div>
        </div>
      </div>
    </div>
  )
}
