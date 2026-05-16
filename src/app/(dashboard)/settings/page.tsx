'use client'
import Link from 'next/link'
import { useAuthStore } from '@/lib/store'
import {
  IconUser, IconKey, IconMail, IconBuildingCommunity,
  IconBriefcase, IconShieldLock, IconChevronRight,
  IconCrown, IconUsers
} from '@tabler/icons-react'

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

export default function SettingsPage() {
  const { user } = useAuthStore()
  const role = (user?.role || 'employee') as 'owner' | 'hr' | 'employee'
  const RoleIcon = ROLE_ICONS[role]

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[#111110]">ตั้งค่า</h1>
        <p className="text-sm text-gray-500 mt-0.5">ข้อมูลบัญชีและการตั้งค่าทั่วไป</p>
      </div>

      {/* Profile Card */}
      <div className="card mb-5">
        <div className="flex items-start gap-4">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-semibold flex-shrink-0"
            style={{ background: ROLE_COLORS[role] }}
          >
            {user?.firstName?.charAt(0) || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-[#111110]">
              {user?.fullName || `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || '—'}
            </h2>
            <div className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-md text-xs font-medium"
              style={{ background: ROLE_COLORS[role] + '15', color: ROLE_COLORS[role] }}
            >
              <RoleIcon size={12} />
              {ROLE_LABELS[role]}
            </div>
          </div>
        </div>

        <div className="mt-5 pt-5 border-t border-black/[0.06] space-y-3">
          <InfoRow icon={IconMail} label="อีเมล" value={user?.email} />
          {user?.department && <InfoRow icon={IconBuildingCommunity} label="แผนก" value={user.department} />}
          {user?.position && <InfoRow icon={IconBriefcase} label="ตำแหน่ง" value={user.position} />}
        </div>
      </div>

      {/* Security Section */}
      <div className="card">
        <h2 className="text-sm font-semibold text-[#111110] mb-3 flex items-center gap-2">
          <IconShieldLock size={15} className="text-gray-400" />
          ความปลอดภัย
        </h2>
        <div className="space-y-1">
          <Link
            href="/settings/change-password"
            className="flex items-center gap-3 px-3 py-3 rounded-[10px] hover:bg-gray-50 transition-colors group"
          >
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

      {/* About */}
      <div className="mt-5 text-center text-xs text-gray-400">
        OrgManager HR System v1.0
      </div>
    </div>
  )
}

function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value?: string }) {
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
