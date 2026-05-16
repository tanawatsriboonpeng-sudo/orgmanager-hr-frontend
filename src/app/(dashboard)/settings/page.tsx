'use client'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { employeeApi } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import {
  IconUser, IconKey, IconMail, IconBuildingCommunity,
  IconBriefcase, IconShieldLock, IconChevronRight,
  IconCrown, IconUsers, IconPhoto, IconX, IconCheck,
  IconPhone, IconEdit, IconUserCircle
} from '@tabler/icons-react'
import clsx from 'clsx'

const ROLE_LABELS: Record<string, string> = {
  owner: 'เจ้าของกิจการ',
  hr: 'HR Admin',
  employee: 'พนักงาน',
}
const ROLE_ICONS: Record<string, any> = {
  owner: IconCrown,
  hr: IconUsers,
  employee: IconUser,
}
const ROLE_COLORS: Record<string, string> = {
  owner: '#534AB7',
  hr: '#1D9E75',
  employee: '#185FA5',
}

interface Profile {
  id: string
  first_name: string
  last_name: string
  nickname?: string
  phone?: string
  email: string
  position?: string
  department_name?: string
  avatar_url?: string | null
  role?: string
}

async function fileToResizedBase64(file: File, maxSize = 400, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('อ่านไฟล์ไม่ได้'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('โหลดรูปไม่ได้'))
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('canvas error'))
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

export default function SettingsPage() {
  const { user } = useAuthStore()
  const role = (user?.role || 'employee') as 'owner' | 'hr' | 'employee'
  const RoleIcon = ROLE_ICONS[role]

  const [profile, setProfile] = useState<Profile | null>(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ nickname: '', phone: '', avatarUrl: '' })
  const [msg, setMsg] = useState({ text: '', ok: true })
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = async () => {
    try {
      const res = await employeeApi.me()
      const p = res.data.data as Profile
      setProfile(p)
      setForm({
        nickname: p.nickname || '',
        phone: p.phone || '',
        avatarUrl: p.avatar_url || '',
      })
    } catch {}
  }

  useEffect(() => { load() }, [])

  const handleAvatarPick = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      setMsg({ text: 'ไฟล์ใหญ่เกิน 5MB', ok: false }); return
    }
    try {
      const dataUrl = await fileToResizedBase64(file)
      setForm(p => ({ ...p, avatarUrl: dataUrl }))
      setMsg({ text: '', ok: true })
    } catch (e: any) {
      setMsg({ text: e.message || 'แปลงรูปไม่ได้', ok: false })
    }
  }

  const save = async () => {
    setSaving(true)
    setMsg({ text: '', ok: true })
    try {
      await employeeApi.updateMe({
        nickname: form.nickname.trim() || undefined,
        phone: form.phone.trim() || undefined,
        avatarUrl: form.avatarUrl !== (profile?.avatar_url || '') ? form.avatarUrl : undefined,
      })
      setMsg({ text: 'อัปเดตเรียบร้อย', ok: true })
      setEditing(false)
      load()
    } catch (e: any) {
      setMsg({ text: e.response?.data?.message || 'เกิดข้อผิดพลาด', ok: false })
    } finally { setSaving(false) }
  }

  const displayName = profile
    ? `${profile.first_name} ${profile.last_name}`
    : (user?.fullName || `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || '—')
  const avatarUrl = profile?.avatar_url || form.avatarUrl
  const initial = profile?.first_name?.charAt(0) || user?.firstName?.charAt(0) || '?'

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[#111110]">ตั้งค่า</h1>
        <p className="text-sm text-gray-500 mt-0.5">ข้อมูลบัญชีและการตั้งค่าทั่วไป</p>
      </div>

      {/* Profile Card */}
      <div className="card mb-5">
        <div className="flex items-start gap-4">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt={displayName} className="w-14 h-14 rounded-full object-cover flex-shrink-0" />
          ) : (
            <div className="w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-semibold flex-shrink-0"
              style={{ background: ROLE_COLORS[role] }}>
              {initial}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-[#111110]">
              {displayName}
              {profile?.nickname && <span className="text-gray-400 font-normal ml-1">({profile.nickname})</span>}
            </h2>
            <div className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-md text-xs font-medium"
              style={{ background: ROLE_COLORS[role] + '15', color: ROLE_COLORS[role] }}>
              <RoleIcon size={12} />
              {ROLE_LABELS[role]}
            </div>
          </div>
          {!editing && (
            <button onClick={() => setEditing(true)} className="btn text-xs">
              <IconEdit size={13} /> แก้ไข
            </button>
          )}
        </div>

        <div className="mt-5 pt-5 border-t border-black/[0.06] space-y-3">
          <InfoRow icon={IconMail} label="อีเมล" value={profile?.email || user?.email} />
          <InfoRow icon={IconPhone} label="เบอร์โทร" value={profile?.phone} />
          <InfoRow icon={IconBuildingCommunity} label="แผนก" value={profile?.department_name} />
          <InfoRow icon={IconBriefcase} label="ตำแหน่ง" value={profile?.position} />
        </div>

        {/* Edit form */}
        {editing && (
          <div className="mt-5 pt-5 border-t border-black/[0.06]">
            <h3 className="text-sm font-semibold mb-3">แก้ไขข้อมูลส่วนตัว</h3>

            <div className="flex items-center gap-3 mb-4 pb-4 border-b border-black/[0.06]">
              {form.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.avatarUrl} alt="avatar" className="w-16 h-16 rounded-full object-cover flex-shrink-0" />
              ) : (
                <div className="w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl font-semibold flex-shrink-0"
                  style={{ background: ROLE_COLORS[role] }}>
                  {initial}
                </div>
              )}
              <div className="flex-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => e.target.files?.[0] && handleAvatarPick(e.target.files[0])}
                />
                <button type="button" onClick={() => fileInputRef.current?.click()} className="btn text-xs">
                  <IconPhoto size={13} /> เปลี่ยนรูป
                </button>
                {form.avatarUrl && (
                  <button
                    type="button"
                    onClick={() => setForm(p => ({ ...p, avatarUrl: '' }))}
                    className="btn text-xs ml-1.5 text-red-500 border-red-200 hover:bg-red-50"
                  >
                    <IconX size={13} /> เอาออก
                  </button>
                )}
                <p className="text-[10px] text-gray-400 mt-1">รูปจะถูกย่อเป็น 400px อัตโนมัติ</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">ชื่อเล่น</label>
                <input className="input" placeholder="—" value={form.nickname}
                  onChange={e => setForm(p => ({ ...p, nickname: e.target.value }))} />
              </div>
              <div>
                <label className="label">เบอร์โทร</label>
                <input className="input" placeholder="08X-XXX-XXXX" value={form.phone}
                  onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
              </div>
            </div>

            <p className="text-[11px] text-gray-400 mt-2">
              ข้อมูลอื่น (ชื่อ-นามสกุล / ตำแหน่ง / แผนก / สิทธิ์) ติดต่อ HR หรือเจ้าของเพื่อขอแก้ไข
            </p>

            {msg.text && (
              <div className={clsx('flex items-center gap-2 p-2.5 rounded-[10px] text-xs mt-3',
                msg.ok ? 'bg-[#E1F5EE] text-[#085041]' : 'bg-red-50 text-red-600')}>
                {msg.ok ? <IconCheck size={13} /> : <IconX size={13} />}
                {msg.text}
              </div>
            )}

            <div className="flex gap-2 mt-4">
              <button onClick={save} disabled={saving} className="btn btn-primary text-sm">
                {saving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
              <button onClick={() => {
                setEditing(false)
                setForm({
                  nickname: profile?.nickname || '',
                  phone: profile?.phone || '',
                  avatarUrl: profile?.avatar_url || '',
                })
                setMsg({ text: '', ok: true })
              }} className="btn text-sm">
                ยกเลิก
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Full profile link */}
      <Link
        href="/employees/me"
        className="card mb-5 flex items-center gap-3 hover:border-[#1D9E75]/40 transition-all group"
      >
        <div className="w-10 h-10 rounded-[10px] bg-[#E6F1FB] text-[#0C447C] flex items-center justify-center flex-shrink-0">
          <IconUserCircle size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-[#111110]">แก้ไขข้อมูลเต็มรูปแบบ</div>
          <div className="text-xs text-gray-500">ที่อยู่, เพศ, สัญชาติ, บัตรประชาชน, บัญชีธนาคาร, และอื่นๆ</div>
        </div>
        <IconChevronRight size={16} className="text-gray-300 group-hover:text-gray-500" />
      </Link>

      {/* Security Section */}
      <div className="card">
        <h2 className="text-sm font-semibold text-[#111110] mb-3 flex items-center gap-2">
          <IconShieldLock size={15} className="text-gray-400" />
          ความปลอดภัย
        </h2>
        <div className="space-y-1">
          <Link href="/settings/change-password"
            className="flex items-center gap-3 px-3 py-3 rounded-[10px] hover:bg-gray-50 transition-colors group">
            <div className="w-8 h-8 rounded-[8px] bg-[#E1F5EE] text-[#085041] flex items-center justify-center flex-shrink-0">
              <IconKey size={15} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-[#111110]">เปลี่ยนรหัสผ่าน</div>
              <div className="text-xs text-gray-500">อัปเดตรหัสผ่านของบัญชี</div>
            </div>
            <IconChevronRight size={14} className="text-gray-300 group-hover:text-gray-500" />
          </Link>
        </div>
      </div>

      <div className="mt-5 text-center text-xs text-gray-400">
        OrgManager HR System v1.0
      </div>
    </div>
  )
}

function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div className="flex items-center gap-3">
      <Icon size={15} className="text-gray-400 flex-shrink-0" />
      <div className="flex-1 min-w-0 flex items-center justify-between gap-3">
        <span className="text-xs text-gray-500">{label}</span>
        <span className="text-sm text-[#111110] truncate">{value}</span>
      </div>
    </div>
  )
}
