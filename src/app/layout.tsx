'use client'
import type { Metadata } from 'next'
import './globals.css'
import { useEffect } from 'react'
import { useAuthStore } from '@/lib/store'
import { useRouter, usePathname } from 'next/navigation'

function AuthProvider({ children }: { children: React.ReactNode }) {
  const { fetchMe, isAuthenticated, isLoading } = useAuthStore()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => { fetchMe() }, [])

  useEffect(() => {
    if (!isLoading && !isAuthenticated && pathname !== '/login') {
      router.replace('/login')
    }
  }, [isLoading, isAuthenticated, pathname])

  if (isLoading && pathname !== '/login') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F7F5]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-[#1D9E75] border-t-transparent animate-spin" />
          <p className="text-sm text-gray-500">กำลังโหลด...</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <head>
        <title>OrgManager HR</title>
        <meta name="description" content="ระบบบริหารจัดการบุคคลครบวงจร" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@300;400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
