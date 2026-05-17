'use client'
import Sidebar from '@/components/layout/Sidebar'
import { useAuthStore } from '@/lib/store'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect } from 'react'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthStore()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace('/login')
  }, [isLoading, isAuthenticated])

  if (isLoading) return null

  return (
    <div className="lg:flex min-h-screen bg-[#F7F7F5]">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-x-hidden">
        {/* `key={pathname}` re-mounts main on route change so the
            entrance animation runs every time the user navigates —
            same trick as Next's stock template animations, no
            framer-motion dependency. */}
        <div key={pathname} className="animate-fade-in">
          {children}
        </div>
      </main>
    </div>
  )
}
