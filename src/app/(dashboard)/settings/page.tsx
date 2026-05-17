'use client'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'
import { employeeApi, orgApi, officeLocationApi, lineAuthApi, retentionApi, leaveApi, type OrgSettings, type OfficeLocation, type RetentionPolicy, type LeaveType } from '@/lib/api'

// Leaflet hits window on import, so load the map only on the client.
// The lazy chunk also keeps the initial /settings bundle slim.
const LocationPicker = dynamic(() => import('@/components/maps/LocationPicker'), {
  ssr: false,
  loading: () => <div className="h-[320px] rounded-md bg-gray-50 border border-black/[0.06] flex items-center justify-center text-xs text-gray-400">กำลังโหลดแผนที่…</div>,
})
import { useAuthStore } from '@/lib/store'
import {
  initLiff, isLiffConfigured, isInLiff, isLoggedInLine,
  lineLogin as triggerLineLogin, lineLogout as triggerLineLogout,
  getLineAccessToken,
} from '@/lib/liff'
import {
  IconUser, IconKey, IconMail, IconBuildingCommunity,
  IconBriefcase, IconShieldLock, IconChevronRight,
  IconCrown, IconUsers, IconPhoto, IconX, IconCheck,
  IconPhone, IconEdit, IconUserCircle, IconMapPin, IconPlus,
  IconTrash, IconCurrentLocation, IconBrandLine, IconDatabase, IconClock,
  IconBeach, IconFileText,
} from '@tabler/icons-react'
import clsx from 'clsx'
import { useToast } from '@/components/ui/Toast'

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
  line_user_id?: string | null
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

      {/* Company / Org Settings — owner only */}
      {role === 'owner' && <OrgSettingsCard />}

      {/* Office Locations — owner only */}
      {role === 'owner' && <OfficeLocationsCard />}

      {/* Leave types — HR + owner */}
      {/* Leave-type management moved to /leave page — kept under the
          team-quota table there so HR can add a column and see it
          appear in the table immediately. */}

      {/* Data retention — owner only */}
      {role === 'owner' && <DataRetentionCard />}

      {/* LINE account link — everyone */}
      <LineLinkCard
        linked={!!profile?.line_user_id}
        onChanged={load}
      />

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

function OrgSettingsCard() {
  const [data, setData] = useState<OrgSettings | null>(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    companyName: '', companyNameEn: '', companyAddress: '',
    companyPhone: '', companyEmail: '', companyTaxId: '',
  })
  const [busy, setBusy] = useState(false)
  const [localMsg, setLocalMsg] = useState({ text: '', ok: true })

  const load = async () => {
    try {
      const r = await orgApi.get()
      const d = r.data.data as OrgSettings
      setData(d)
      setForm({
        companyName: d?.company_name || '',
        companyNameEn: d?.company_name_en || '',
        companyAddress: d?.company_address || '',
        companyPhone: d?.company_phone || '',
        companyEmail: d?.company_email || '',
        companyTaxId: d?.company_tax_id || '',
      })
    } catch {}
  }
  useEffect(() => { load() }, [])

  const save = async () => {
    setBusy(true)
    setLocalMsg({ text: '', ok: true })
    try {
      await orgApi.update({
        companyName: form.companyName.trim() || undefined,
        companyNameEn: form.companyNameEn.trim() || undefined,
        companyAddress: form.companyAddress.trim() || undefined,
        companyPhone: form.companyPhone.trim() || undefined,
        companyEmail: form.companyEmail.trim() || undefined,
        companyTaxId: form.companyTaxId.trim() || undefined,
      })
      setLocalMsg({ text: 'บันทึกข้อมูลบริษัทแล้ว', ok: true })
      setEditing(false)
      load()
      setTimeout(() => setLocalMsg({ text: '', ok: true }), 3500)
    } catch (e: any) {
      setLocalMsg({ text: e.response?.data?.message || 'เกิดข้อผิดพลาด', ok: false })
    } finally { setBusy(false) }
  }

  return (
    <div className="card mb-5">
      <div className="flex items-start justify-between mb-3">
        <h2 className="text-sm font-semibold text-[#111110] flex items-center gap-2">
          <IconBuildingCommunity size={15} className="text-gray-400" />
          ข้อมูลบริษัท
        </h2>
        {!editing && (
          <button onClick={() => setEditing(true)} className="btn text-xs">
            <IconEdit size={13} /> แก้ไข
          </button>
        )}
      </div>

      {!editing ? (
        <div className="space-y-3">
          <InfoRow icon={IconBuildingCommunity} label="ชื่อบริษัท" value={data?.company_name || 'ยังไม่ระบุ'} />
          <InfoRow icon={IconBuildingCommunity} label="ชื่อ (อังกฤษ)" value={data?.company_name_en} />
          <InfoRow icon={IconPhone} label="โทรศัพท์" value={data?.company_phone} />
          <InfoRow icon={IconMail} label="อีเมล" value={data?.company_email} />
          <InfoRow icon={IconBriefcase} label="เลขประจำตัวผู้เสียภาษี" value={data?.company_tax_id} />
          {data?.company_address && (
            <div className="text-xs text-gray-500 mt-2 pt-2 border-t border-black/[0.05]">
              <div className="mb-1">ที่อยู่</div>
              <div className="text-[#111110] whitespace-pre-wrap text-sm">{data.company_address}</div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">ชื่อบริษัท (ไทย)</label>
              <input className="input" value={form.companyName}
                onChange={e => setForm(p => ({ ...p, companyName: e.target.value }))}
                placeholder="บริษัท ตัวอย่าง จำกัด" />
            </div>
            <div>
              <label className="label">ชื่อ (อังกฤษ)</label>
              <input className="input" value={form.companyNameEn}
                onChange={e => setForm(p => ({ ...p, companyNameEn: e.target.value }))}
                placeholder="Example Co., Ltd." />
            </div>
            <div>
              <label className="label">โทรศัพท์</label>
              <input className="input" value={form.companyPhone}
                onChange={e => setForm(p => ({ ...p, companyPhone: e.target.value }))}
                placeholder="02-XXX-XXXX" />
            </div>
            <div>
              <label className="label">อีเมล</label>
              <input className="input" type="email" value={form.companyEmail}
                onChange={e => setForm(p => ({ ...p, companyEmail: e.target.value }))}
                placeholder="contact@company.co.th" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">เลขประจำตัวผู้เสียภาษี</label>
              <input className="input" value={form.companyTaxId}
                onChange={e => setForm(p => ({ ...p, companyTaxId: e.target.value }))}
                placeholder="0-0000-00000-00-0" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">ที่อยู่</label>
              <textarea className="input min-h-[70px]" value={form.companyAddress}
                onChange={e => setForm(p => ({ ...p, companyAddress: e.target.value }))}
                placeholder="เลขที่ ถนน แขวง/ตำบล เขต/อำเภอ จังหวัด รหัสไปรษณีย์" />
            </div>
          </div>

          {localMsg.text && (
            <div className={clsx('flex items-center gap-2 p-2.5 rounded-[10px] text-xs',
              localMsg.ok ? 'bg-[#E1F5EE] text-[#085041]' : 'bg-red-50 text-red-600')}>
              {localMsg.ok ? <IconCheck size={13} /> : <IconX size={13} />}
              {localMsg.text}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button onClick={save} disabled={busy} className="btn btn-primary text-sm">
              {busy ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
            <button onClick={() => { setEditing(false); load() }} className="btn text-sm">
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      {!editing && localMsg.text && (
        <div className={clsx('flex items-center gap-2 p-2.5 rounded-[10px] text-xs mt-3',
          localMsg.ok ? 'bg-[#E1F5EE] text-[#085041]' : 'bg-red-50 text-red-600')}>
          {localMsg.ok ? <IconCheck size={13} /> : <IconX size={13} />}
          {localMsg.text}
        </div>
      )}
    </div>
  )
}

// ============================================================
// OFFICE LOCATIONS (owner-only)
// ============================================================
// Multi-location replacement for the single COMPANY_LAT/LNG env vars.
// Each row is a name + lat/lng + per-row radius (in meters). Edit /
// disable / delete from this card. The check-in API allows the entry
// if the user's GPS falls inside ANY active row's radius.

function OfficeLocationsCard() {
  const [rows, setRows] = useState<OfficeLocation[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const r = await officeLocationApi.list()
      setRows(r.data.data || [])
    } catch (e: any) {
      setMsg({ text: e?.response?.data?.message || 'โหลดที่ตั้งไม่สำเร็จ', ok: false })
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  // Auto-dismiss success/info banner after 4s; errors persist until
  // dismissed manually so the user can read them.
  useEffect(() => {
    if (!msg || !msg.ok) return
    const t = setTimeout(() => setMsg(null), 4000)
    return () => clearTimeout(t)
  }, [msg])

  const toast = useToast()
  const remove = async (loc: OfficeLocation) => {
    const ok = await toast.confirm(
      `พนักงานจะลงเวลาจากจุดนี้ไม่ได้ทันที`,
      { title: `ลบ "${loc.name}"?`, tone: 'danger', confirmText: 'ลบ' }
    )
    if (!ok) return
    try {
      await officeLocationApi.delete(loc.id)
      setMsg({ text: 'ลบแล้ว', ok: true })
      load()
    } catch (e: any) {
      setMsg({ text: e?.response?.data?.message || 'ลบไม่สำเร็จ', ok: false })
    }
  }

  const toggle = async (loc: OfficeLocation) => {
    try {
      await officeLocationApi.update(loc.id, { isActive: !loc.is_active })
      load()
    } catch (e: any) {
      setMsg({ text: e?.response?.data?.message || 'เปลี่ยนสถานะไม่สำเร็จ', ok: false })
    }
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-[#111110] flex items-center gap-2">
          <IconMapPin size={15} className="text-gray-400" />
          ที่ตั้งสำนักงาน (ลงเวลา)
        </h2>
        {editing !== 'new' && (
          <button
            onClick={() => setEditing('new')}
            className="btn btn-primary text-xs"
          >
            <IconPlus size={13} /> เพิ่มสถานที่
          </button>
        )}
      </div>

      <p className="text-xs text-gray-500 mb-3">
        พนักงานจะลงเวลาได้เมื่ออยู่ในรัศมีของอย่างน้อย 1 สถานที่ที่เปิดใช้งาน
      </p>

      {msg && (
        <div className={clsx(
          'mb-3 px-3 py-2 rounded-md text-xs flex items-center justify-between border',
          msg.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'
        )}>
          <span>{msg.text}</span>
          <button onClick={() => setMsg(null)} className="opacity-70 hover:opacity-100">ปิด</button>
        </div>
      )}

      {/* New-row form */}
      {editing === 'new' && (
        <OfficeLocationForm
          onCancel={() => setEditing(null)}
          onSaved={() => { setEditing(null); setMsg({ text: 'เพิ่มแล้ว', ok: true }); load() }}
          onError={(text) => setMsg({ text, ok: false })}
        />
      )}

      {loading ? (
        <p className="text-xs text-gray-500 mt-2">กำลังโหลด…</p>
      ) : rows.length === 0 && editing !== 'new' ? (
        <p className="text-xs text-gray-500 text-center py-4">
          ยังไม่มีสถานที่ — ระบบใช้ค่า env เริ่มต้น (สำนักงานหลัก)<br />
          เพิ่มสถานที่แรกเพื่อ override
        </p>
      ) : (
        <div className="space-y-2 mt-2">
          {rows.map(loc => (
            editing === loc.id ? (
              <OfficeLocationForm
                key={loc.id}
                initial={loc}
                onCancel={() => setEditing(null)}
                onSaved={() => { setEditing(null); setMsg({ text: 'บันทึกแล้ว', ok: true }); load() }}
                onError={(text) => setMsg({ text, ok: false })}
              />
            ) : (
              <div
                key={loc.id}
                className={clsx(
                  'flex items-center justify-between gap-3 px-3 py-2.5 rounded-md border',
                  loc.is_active ? 'border-black/[0.06] bg-white' : 'border-black/[0.04] bg-gray-50 opacity-60'
                )}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[#111110] truncate">{loc.name}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {Number(loc.lat).toFixed(6)}, {Number(loc.lng).toFixed(6)} · รัศมี {loc.radius_meters} ม.
                  </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => toggle(loc)}
                    className="text-[11px] px-2 py-1 rounded border border-black/[0.08] hover:bg-gray-50"
                  >
                    {loc.is_active ? 'ปิด' : 'เปิด'}
                  </button>
                  <button
                    onClick={() => setEditing(loc.id)}
                    className="p-1.5 rounded hover:bg-gray-100"
                    title="แก้ไข"
                  >
                    <IconEdit size={14} className="text-gray-500" />
                  </button>
                  <button
                    onClick={() => remove(loc)}
                    className="p-1.5 rounded hover:bg-red-50"
                    title="ลบ"
                  >
                    <IconTrash size={14} className="text-red-500" />
                  </button>
                </div>
              </div>
            )
          ))}
        </div>
      )}
    </div>
  )
}

function OfficeLocationForm({ initial, onCancel, onSaved, onError }: {
  initial?: OfficeLocation
  onCancel: () => void
  onSaved: () => void
  onError: (text: string) => void
}) {
  const [name, setName] = useState(initial?.name || '')
  const [lat, setLat] = useState<string>(initial ? String(initial.lat) : '')
  const [lng, setLng] = useState<string>(initial ? String(initial.lng) : '')
  const [radius, setRadius] = useState<number>(initial?.radius_meters ?? 60)
  const [saving, setSaving] = useState(false)
  const [geoBusy, setGeoBusy] = useState(false)

  const useCurrentLocation = () => {
    if (!('geolocation' in navigator)) {
      onError('เบราว์เซอร์นี้ไม่รองรับ GPS')
      return
    }
    setGeoBusy(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLat(pos.coords.latitude.toFixed(6))
        setLng(pos.coords.longitude.toFixed(6))
        setGeoBusy(false)
      },
      err => {
        setGeoBusy(false)
        onError(err.code === err.PERMISSION_DENIED
          ? 'ไม่ได้รับสิทธิ์ใช้ GPS — เปิดสิทธิ์ในเบราว์เซอร์ก่อน'
          : 'อ่าน GPS ไม่สำเร็จ')
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 }
    )
  }

  const submit = async () => {
    if (!name.trim()) { onError('กรุณาระบุชื่อสถานที่'); return }
    const latN = Number(lat), lngN = Number(lng)
    if (!Number.isFinite(latN) || latN < -90 || latN > 90) { onError('latitude ต้องอยู่ในช่วง -90 ถึง 90'); return }
    if (!Number.isFinite(lngN) || lngN < -180 || lngN > 180) { onError('longitude ต้องอยู่ในช่วง -180 ถึง 180'); return }
    if (!Number.isFinite(radius) || radius < 10 || radius > 5000) { onError('รัศมีต้องอยู่ในช่วง 10–5000 เมตร'); return }
    setSaving(true)
    try {
      const payload = { name: name.trim(), lat: latN, lng: lngN, radiusMeters: radius }
      if (initial) await officeLocationApi.update(initial.id, payload)
      else await officeLocationApi.create(payload)
      onSaved()
    } catch (e: any) {
      onError(e?.response?.data?.message || 'บันทึกไม่สำเร็จ')
    } finally { setSaving(false) }
  }

  return (
    <div className="rounded-md border border-[#1D9E75]/30 bg-green-50/20 p-3 space-y-3">
      <div>
        <label className="label">ชื่อสถานที่</label>
        <input
          className="input text-sm"
          placeholder="เช่น สำนักงานใหญ่ / สาขาเชียงใหม่"
          value={name}
          onChange={e => setName(e.target.value)}
        />
      </div>
      {/* Map preview — click to set pin. The lat/lng text boxes stay
          editable so users can paste coords from Google Maps, and the
          map follows whichever value is current. The green circle is
          the live radius from the slider so the user can see exactly
          what area their employees can check in from. */}
      <div>
        <p className="text-[11px] text-gray-500 mb-1">คลิกบนแผนที่เพื่อย้ายหมุด หรือกรอกพิกัดเอง</p>
        <LocationPicker
          lat={Number(lat) || (initial ? initial.lat : 13.7563)}
          lng={Number(lng) || (initial ? initial.lng : 100.5018)}
          radius={radius}
          onPick={(la, ln) => { setLat(la.toFixed(6)); setLng(ln.toFixed(6)) }}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">Latitude</label>
          <input
            className="input text-sm font-mono"
            placeholder="13.756331"
            value={lat}
            onChange={e => setLat(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Longitude</label>
          <input
            className="input text-sm font-mono"
            placeholder="100.501765"
            value={lng}
            onChange={e => setLng(e.target.value)}
          />
        </div>
      </div>
      <button
        type="button"
        onClick={useCurrentLocation}
        disabled={geoBusy}
        className="text-xs text-[#1D9E75] hover:underline flex items-center gap-1"
      >
        <IconCurrentLocation size={13} />
        {geoBusy ? 'กำลังอ่าน GPS…' : 'ใช้ตำแหน่งปัจจุบัน'}
      </button>
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="label !mb-0">รัศมี (เมตร)</label>
          <span className="text-sm font-mono text-[#1D9E75]">{radius} ม.</span>
        </div>
        <input
          type="range"
          min={10}
          max={2000}
          step={10}
          value={radius}
          onChange={e => setRadius(parseInt(e.target.value, 10))}
          className="w-full accent-[#1D9E75]"
        />
        <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
          <span>10 ม.</span><span>500</span><span>1000</span><span>2000 ม.</span>
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="btn text-sm">ยกเลิก</button>
        <button onClick={submit} disabled={saving} className="btn btn-primary text-sm">
          {saving ? 'กำลังบันทึก…' : initial ? 'บันทึก' : 'เพิ่ม'}
        </button>
      </div>
    </div>
  )
}

// ============================================================
// LINE ACCOUNT LINK
// ============================================================
// Lets a signed-in user attach (or detach) their LINE userId. Two paths
// to a token:
//   - Inside LIFF: we already have a LINE access token after init().
//   - Web browser: trigger liff.login() which redirects through the LINE
//     OAuth page and bounces back here; we then read the token on mount.
// Hidden entirely when NEXT_PUBLIC_LIFF_ID isn't configured so dev/test
// environments without a LIFF channel don't see broken buttons.

function LineLinkCard({ linked, onChanged }: { linked: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [liffReady, setLiffReady] = useState(false)
  const [inClient, setInClient] = useState(false)

  useEffect(() => {
    if (!isLiffConfigured()) return
    initLiff().then(({ ready, inClient }) => {
      setLiffReady(ready); setInClient(inClient)
    })
  }, [])

  // After liff.login() the page reloads here with a fresh LINE token.
  // If the user is already signed in via email and not yet linked, we
  // auto-bind so they don't have to click again.
  useEffect(() => {
    if (!liffReady || linked) return
    const token = getLineAccessToken()
    if (!token) return
    if (!isLoggedInLine()) return
    // Don't auto-link silently — the user may have hit liff.login() from
    // a context they don't remember. Wait for explicit click.
  }, [liffReady, linked])

  if (!isLiffConfigured()) return null

  const handleLink = async () => {
    setBusy(true); setMsg(null)
    try {
      if (!liffReady) {
        setMsg({ text: 'LIFF ยังไม่พร้อม', ok: false }); return
      }
      if (!isLoggedInLine()) {
        // Redirects to LINE OAuth then back to this exact URL. The next
        // render will have getLineAccessToken() available.
        triggerLineLogin(window.location.href)
        return
      }
      const token = getLineAccessToken()
      if (!token) {
        setMsg({ text: 'อ่าน LINE token ไม่สำเร็จ', ok: false }); return
      }
      await lineAuthApi.link(token)
      setMsg({ text: 'ผูกบัญชี LINE แล้ว', ok: true })
      onChanged()
    } catch (e: any) {
      setMsg({ text: e?.response?.data?.message || 'ผูกบัญชีไม่สำเร็จ', ok: false })
    } finally { setBusy(false) }
  }

  const toast = useToast()
  const handleUnlink = async () => {
    const ok = await toast.confirm(
      'หลังจากนี้จะเข้าสู่ระบบผ่าน LINE OA ไม่ได้จนกว่าจะผูกใหม่',
      { title: 'ยกเลิกการผูกบัญชี LINE?', tone: 'danger', confirmText: 'ยกเลิกการผูก' }
    )
    if (!ok) return
    setBusy(true); setMsg(null)
    try {
      await lineAuthApi.unlink()
      // Also clear the LIFF session — otherwise next auto-login from LIFF
      // will silently re-bind via the LINE_NOT_LINKED branch and confuse
      // the user.
      if (liffReady && !inClient) triggerLineLogout()
      setMsg({ text: 'ยกเลิกการผูกบัญชี LINE แล้ว', ok: true })
      onChanged()
    } catch (e: any) {
      setMsg({ text: e?.response?.data?.message || 'ยกเลิกไม่สำเร็จ', ok: false })
    } finally { setBusy(false) }
  }

  return (
    <div className="card mb-5">
      <h2 className="text-sm font-semibold text-[#111110] mb-3 flex items-center gap-2">
        <IconBrandLine size={15} className="text-[#06C755]" />
        บัญชี LINE
      </h2>

      <div className="flex items-start gap-3 p-3 rounded-[10px] border border-black/[0.05] bg-gray-50/60">
        <div className="w-9 h-9 rounded-full bg-[#06C755] text-white flex items-center justify-center flex-shrink-0">
          <IconBrandLine size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-[#111110]">
            {linked ? 'ผูกบัญชีแล้ว' : 'ยังไม่ผูกบัญชี'}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {linked
              ? 'เปิดแอปผ่าน LINE OA แล้วเข้าใช้งานได้เลย ไม่ต้องกรอกอีเมล/รหัสผ่าน'
              : 'ผูกเพื่อให้เปิดผ่าน LINE OA แล้วเข้าระบบอัตโนมัติ'}
          </div>
        </div>
        {linked ? (
          <button onClick={handleUnlink} disabled={busy} className="btn text-xs text-red-600 border-red-200 hover:bg-red-50">
            {busy ? '...' : 'ยกเลิก'}
          </button>
        ) : (
          <button onClick={handleLink} disabled={busy} className="btn btn-primary text-xs"
            style={{ background: '#06C755', borderColor: '#06C755' }}>
            {busy ? '...' : 'ผูกบัญชี'}
          </button>
        )}
      </div>

      {msg && (
        <div className={clsx(
          'mt-3 px-3 py-2 rounded-md text-xs flex items-center gap-2 border',
          msg.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'
        )}>
          {msg.ok ? <IconCheck size={13} /> : <IconX size={13} />}
          <span className="flex-1">{msg.text}</span>
          <button onClick={() => setMsg(null)} className="opacity-70 hover:opacity-100">ปิด</button>
        </div>
      )}
    </div>
  )
}

// ============================================================
// DATA RETENTION (owner-only)
// ============================================================
// Surfaces the org_settings retention_* columns + the JSONB summary the
// backend writes after each purge. The submit button only enables when
// the form has actually diverged from server state — keeps "บันทึก" from
// being a no-op the owner clicks repeatedly.

function DataRetentionCard() {
  const toast = useToast()
  const [policy, setPolicy] = useState<RetentionPolicy | null>(null)
  const [form, setForm] = useState({
    selfieDays: 180,
    attachmentDays: 365,
    notificationDays: 90,
    auditDays: 730,
    autoPurge: true,
  })
  const [busy, setBusy] = useState(false)
  const [purging, setPurging] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  const load = async () => {
    try {
      const r = await retentionApi.get()
      const p = r.data.data
      setPolicy(p)
      setForm({
        selfieDays: p.retention_selfie_days,
        attachmentDays: p.retention_attachment_days,
        notificationDays: p.retention_notification_days,
        auditDays: p.retention_audit_days,
        autoPurge: p.retention_auto_purge,
      })
    } catch (e: any) {
      setMsg({ text: e?.response?.data?.message || 'โหลดนโยบายไม่สำเร็จ', ok: false })
    }
  }
  useEffect(() => { load() }, [])

  const dirty = policy && (
    form.selfieDays !== policy.retention_selfie_days ||
    form.attachmentDays !== policy.retention_attachment_days ||
    form.notificationDays !== policy.retention_notification_days ||
    form.auditDays !== policy.retention_audit_days ||
    form.autoPurge !== policy.retention_auto_purge
  )

  const save = async () => {
    setBusy(true); setMsg(null)
    try {
      await retentionApi.update(form)
      setMsg({ text: 'บันทึกนโยบายแล้ว', ok: true })
      await load()
    } catch (e: any) {
      setMsg({ text: e?.response?.data?.message || 'บันทึกไม่สำเร็จ', ok: false })
    } finally { setBusy(false) }
  }

  const purgeNow = async () => {
    const ok = await toast.confirm(
      'รูปและไฟล์แนบที่เกินกำหนดจะถูกลบถาวร — ดำเนินการต่อ?',
      { title: 'ล้างข้อมูลเก่าทันที', tone: 'danger', confirmText: 'ล้างเลย' }
    )
    if (!ok) return
    setPurging(true); setMsg(null)
    try {
      const r = await retentionApi.purgeNow()
      const s = r.data.data
      const total = (s?.selfies_cleared || 0)
        + (s?.offsite_selfies_cleared || 0)
        + (s?.backdate_attachments_cleared || 0)
        + (s?.leave_documents_cleared || 0)
      setMsg({
        text: `ล้างแล้ว — รูป/ไฟล์ ${total}, แจ้งเตือน ${s?.notifications_deleted || 0}, audit ${s?.audit_logs_deleted || 0}`,
        ok: true,
      })
      await load()
    } catch (e: any) {
      setMsg({ text: e?.response?.data?.message || 'ล้างไม่สำเร็จ', ok: false })
    } finally { setPurging(false) }
  }

  const last = policy?.last_purge_summary
  const lastWhen = policy?.last_purge_at ? new Date(policy.last_purge_at) : null

  return (
    <div className="card mb-5">
      <h2 className="text-sm font-semibold text-[#111110] mb-1 flex items-center gap-2">
        <IconDatabase size={15} className="text-gray-400" />
        การลบข้อมูลเก่าอัตโนมัติ
      </h2>
      <p className="text-xs text-gray-500 mb-4">
        ลบเฉพาะรูป/ไฟล์แนบที่หมดอายุการเก็บ — บันทึกเวลาเข้า-ออก/การลา/KPI/เงินเดือนยังอยู่ครบ
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <RetentionField
          label="รูป selfie เช็คอิน / ลงนอกสถานที่"
          help="หลังเก็บนานเกินจำนวนวัน รูปจะถูกล้าง แต่บันทึกเวลายังอยู่"
          value={form.selfieDays}
          onChange={v => setForm(p => ({ ...p, selfieDays: v }))}
          min={7} max={3650} suggested="180"
        />
        <RetentionField
          label="ไฟล์แนบขอย้อนหลัง"
          help="หลักฐานในคำขอ backdate"
          value={form.attachmentDays}
          onChange={v => setForm(p => ({ ...p, attachmentDays: v }))}
          min={7} max={3650} suggested="365"
        />
        <RetentionField
          label="แจ้งเตือนในแอป"
          help="ลบแถวออกเลย (ข้อความเก่าไม่มีประโยชน์)"
          value={form.notificationDays}
          onChange={v => setForm(p => ({ ...p, notificationDays: v }))}
          min={1} max={3650} suggested="90"
        />
        <RetentionField
          label="Audit log"
          help="บันทึกการกระทำของ HR/owner"
          value={form.auditDays}
          onChange={v => setForm(p => ({ ...p, auditDays: v }))}
          min={30} max={3650} suggested="730"
        />
      </div>

      <label className="flex items-center gap-2 cursor-pointer text-sm mb-3">
        <input
          type="checkbox"
          checked={form.autoPurge}
          onChange={e => setForm(p => ({ ...p, autoPurge: e.target.checked }))}
          className="accent-[#1D9E75]"
        />
        <span>เปิดล้างอัตโนมัติทุกวัน</span>
        <span className="text-[11px] text-gray-400">(รันเงียบๆ ตอนมีคนเปิดแอปครั้งแรกของวัน)</span>
      </label>

      {msg && (
        <div className={clsx(
          'mb-3 px-3 py-2 rounded-md text-xs flex items-center gap-2 border',
          msg.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'
        )}>
          {msg.ok ? <IconCheck size={13} /> : <IconX size={13} />}
          <span className="flex-1">{msg.text}</span>
          <button onClick={() => setMsg(null)} className="opacity-70 hover:opacity-100">ปิด</button>
        </div>
      )}

      <div className="flex gap-2 mb-4">
        <button onClick={save} disabled={!dirty || busy} className="btn btn-primary text-sm">
          {busy ? 'กำลังบันทึก…' : 'บันทึกนโยบาย'}
        </button>
        <button onClick={purgeNow} disabled={purging} className="btn text-sm">
          <IconTrash size={13} /> {purging ? 'กำลังล้าง…' : 'ล้างทันที'}
        </button>
      </div>

      {/* Last purge summary */}
      <div className="border-t border-black/[0.05] pt-3 text-xs">
        <div className="flex items-center gap-2 text-gray-500 mb-1.5">
          <IconClock size={12} />
          <span>การล้างล่าสุด</span>
        </div>
        {lastWhen && last ? (
          <div className="space-y-1">
            <div className="text-[#111110]">
              {lastWhen.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}
            </div>
            <div className="text-gray-500 leading-relaxed">
              รูปเช็คอิน {last.selfies_cleared || 0} ·
              รูปลงนอกสถานที่ {last.offsite_selfies_cleared || 0} ·
              ไฟล์ขอย้อนหลัง {last.backdate_attachments_cleared || 0} ·
              หลักฐานการลา {last.leave_documents_cleared || 0} ·
              แจ้งเตือน {last.notifications_deleted || 0} ·
              audit {last.audit_logs_deleted || 0} ·
              token หมดอายุ {last.expired_refresh_tokens_deleted || 0}
            </div>
          </div>
        ) : (
          <p className="text-gray-400">ยังไม่เคยล้าง — กด "ล้างทันที" เพื่อเริ่ม</p>
        )}
      </div>
    </div>
  )
}

function RetentionField({ label, help, value, onChange, min, max, suggested }: {
  label: string; help?: string
  value: number; onChange: (v: number) => void
  min: number; max: number; suggested: string
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          className="input text-sm"
          value={value}
          min={min}
          max={max}
          onChange={e => onChange(parseInt(e.target.value, 10) || 0)}
        />
        <span className="text-xs text-gray-500 whitespace-nowrap">วัน</span>
      </div>
      {help && (
        <p className="text-[10px] text-gray-400 mt-1">
          {help} · แนะนำ {suggested} วัน
        </p>
      )}
    </div>
  )
}
