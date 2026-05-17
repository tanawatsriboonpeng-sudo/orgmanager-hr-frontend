'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import { useState, useEffect } from 'react'
import {
  IconLayoutDashboard, IconClock, IconCalendarOff,
  IconClockPlus, IconReceipt2, IconChartBar,
  IconClipboardList,
  IconSpeakerphone, IconHierarchy, IconHistory,
  IconBuilding, IconLogout, IconChevronRight,
  IconSettings, IconCrown, IconUsers, IconUser, IconKey,
  IconMenu2, IconX, IconCalendarTime, IconSparkles,
} from '@tabler/icons-react'
import clsx from 'clsx'
import EmployeeAvatar from '@/components/employees/EmployeeAvatar'
import NotificationBell from '@/components/notifications/NotificationBell'

// /cleaning is the shared-responsibility cleaning rota — visible to all
// roles because every employee can be assigned as inspector and everyone
// needs to see today's list.
const ROLE_MENUS = {
  owner: [
    // Owner ดูภาพรวม/อนุมัติ/จัดการเท่านั้น ไม่ลงเวลา ไม่ขอ OT ไม่มีกะ
    { href: '/dashboard', icon: IconLayoutDashboard, label: 'ภาพรวม' },
    { href: '/leave', icon: IconCalendarOff, label: 'การลา' },
    { href: '/shifts', icon: IconCalendarTime, label: 'จัดกะ' },
    { href: '/payroll', icon: IconReceipt2, label: 'เงินเดือน' },
    { href: '/kpi', icon: IconChartBar, label: 'KPI' },
    { href: '/projects', icon: IconClipboardList, label: 'โปรเจกต์' },
    { href: '/cleaning', icon: IconSparkles, label: 'ทำความสะอาด' },
    { href: '/announcements', icon: IconSpeakerphone, label: 'ประกาศ' },
    { href: '/employees', icon: IconUsers, label: 'พนักงาน' },
    { href: '/org-chart', icon: IconHierarchy, label: 'แผนผัง' },
    { href: '/audit-logs', icon: IconHistory, label: 'ประวัติการดำเนินการ' },
  ],
  hr: [
    { href: '/dashboard', icon: IconLayoutDashboard, label: 'ภาพรวม' },
    { href: '/attendance', icon: IconClock, label: 'ลงเวลา' },
    { href: '/leave', icon: IconCalendarOff, label: 'การลา' },
    { href: '/ot', icon: IconClockPlus, label: 'OT' },
    { href: '/shifts', icon: IconCalendarTime, label: 'จัดกะ' },
    { href: '/payroll', icon: IconReceipt2, label: 'เงินเดือน' },
    { href: '/kpi', icon: IconChartBar, label: 'KPI' },
    { href: '/employees', icon: IconUsers, label: 'พนักงาน' },
    { href: '/projects', icon: IconClipboardList, label: 'โปรเจกต์' },
    { href: '/cleaning', icon: IconSparkles, label: 'ทำความสะอาด' },
    { href: '/announcements', icon: IconSpeakerphone, label: 'ประกาศ' },
  ],
  employee: [
    { href: '/dashboard', icon: IconLayoutDashboard, label: 'หน้าหลัก' },
    { href: '/attendance', icon: IconClock, label: 'ลงเวลา' },
    { href: '/leave', icon: IconCalendarOff, label: 'การลา' },
    { href: '/ot', icon: IconClockPlus, label: 'OT' },
    { href: '/payroll', icon: IconReceipt2, label: 'สลิป' },
    { href: '/projects', icon: IconClipboardList, label: 'โปรเจกต์' },
    { href: '/cleaning', icon: IconSparkles, label: 'ทำความสะอาด' },
    { href: '/announcements', icon: IconSpeakerphone, label: 'ประกาศ' },
  ],
}

const ROLE_ICONS = { owner: IconCrown, hr: IconUsers, employee: IconUser }
const ROLE_LABELS = { owner: 'เจ้าของ', hr: 'HR Admin', employee: 'พนักงาน' }
const ROLE_COLORS = { owner: '#534AB7', hr: '#1D9E75', employee: '#185FA5' }

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout } = useAuthStore()
  const [open, setOpen] = useState(false)
  const role = (user?.role || 'employee') as 'owner' | 'hr' | 'employee'
  const menus = ROLE_MENUS[role]
  const RoleIcon = ROLE_ICONS[role]

  // ปิด sidebar อัตโนมัติเมื่อเปลี่ยนหน้า (มือถือ)
  useEffect(() => { setOpen(false) }, [pathname])

  const handleLogout = async () => {
    await logout()
    router.replace('/login')
  }

  return (
    <>
      {/* Mobile top bar - แสดงเฉพาะมือถือ */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-white border-b border-black/[0.06] flex items-center justify-between px-4 z-40">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-[#1D9E75] rounded-lg flex items-center justify-center">
            <IconBuilding size={15} className="text-white" />
          </div>
          <div className="text-[13px] font-semibold text-[#111110]">สิริคอนส์ HR</div>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100"
          aria-label="เปิดเมนู"
        >
          <IconMenu2 size={22} className="text-gray-700" />
        </button>
      </div>

      {/* Spacer ดันเนื้อหาลงให้พ้น top bar บนมือถือ */}
      <div className="lg:hidden h-14 flex-shrink-0" />

      {/* Overlay มืดๆ ตอนเปิดเมนูบนมือถือ */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 bg-black/40 z-40"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={clsx(
          'w-[260px] lg:w-[220px] flex-shrink-0 flex flex-col bg-white border-r border-black/[0.06]',
          'fixed lg:static top-0 left-0 h-screen lg:h-auto lg:min-h-screen z-50',
          'transition-transform duration-300 ease-in-out',
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Logo + ปุ่มปิด (มือถือ) */}
        <div className="flex items-center justify-between gap-2.5 px-4 py-4 border-b border-black/[0.06]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-[#1D9E75] rounded-lg flex items-center justify-center">
              <IconBuilding size={15} className="text-white" />
            </div>
            <div>
              <div className="text-[12px] font-semibold text-[#111110] leading-tight">สิริคอนส์</div>
              <div className="text-[10px] text-gray-400">HR System</div>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100"
            aria-label="ปิดเมนู"
          >
            <IconX size={18} className="text-gray-500" />
          </button>
        </div>

        {/* User chip + notification bell. Bell sits on the right edge
            of the chip so it's reachable from every dashboard page
            without taking up its own slot in the nav rail. */}
        <div className="mx-3 mt-3 mb-1 p-2.5 rounded-[10px] bg-gray-50 flex items-center gap-2.5">
          <EmployeeAvatar person={user as any} size={28} />
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-medium text-[#111110] truncate">
              {user?.fullName || user?.firstName || '—'}
            </div>
            <div className="flex items-center gap-1 text-[10px] text-gray-400">
              <RoleIcon size={10} style={{ color: ROLE_COLORS[role] }} />
              {ROLE_LABELS[role]}
            </div>
          </div>
          <NotificationBell />
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 py-2 overflow-y-auto">
          {menus.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  'flex items-center gap-2.5 px-3 py-2 rounded-[9px] text-sm mb-0.5 group transition-all',
                  isActive
                    ? 'bg-[#E1F5EE] text-[#085041] font-medium'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                )}
              >
                <Icon
                  size={16}
                  className="flex-shrink-0"
                  style={{ color: isActive ? '#1D9E75' : undefined }}
                />
                <span className="flex-1">{item.label}</span>
                {isActive && <IconChevronRight size={12} className="text-[#1D9E75]" />}
              </Link>
            )
          })}
        </nav>

        {/* Bottom actions */}
        <div className="px-2 pb-3 space-y-0.5 border-t border-black/[0.06] pt-2 mt-1">
          <Link href="/settings/change-password" className="flex items-center gap-2.5 px-3 py-2 rounded-[9px] text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-all">
            <IconKey size={16} />
            เปลี่ยนรหัสผ่าน
          </Link>
          <Link href="/settings" className="flex items-center gap-2.5 px-3 py-2 rounded-[9px] text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-all">
            <IconSettings size={16} />
            ตั้งค่า
          </Link>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-[9px] text-sm text-red-500 hover:bg-red-50 transition-all"
          >
            <IconLogout size={16} />
            ออกจากระบบ
          </button>
        </div>
      </aside>
    </>
  )
}
