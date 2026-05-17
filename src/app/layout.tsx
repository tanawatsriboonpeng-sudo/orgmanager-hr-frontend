'use client'
import './globals.css'
import { useEffect, useState } from 'react'
import { useAuthStore } from '@/lib/store'
import { useRouter, usePathname } from 'next/navigation'
import {
  initLiff,
  isLiffConfigured,
  isInLiff,
  isLoggedInLine,
  lineLogin as triggerLineLogin,
  getLineAccessToken,
} from '@/lib/liff'
import { ToastProvider } from '@/components/ui/Toast'

const PUBLIC_PATHS = ['/login', '/forgot-password']

function AuthProvider({ children }: { children: React.ReactNode }) {
  const { fetchMe, loginWithLine, isAuthenticated, isLoading } = useAuthStore()
  const router = useRouter()
  const pathname = usePathname()
  const isPublic = PUBLIC_PATHS.includes(pathname)
  // Until LIFF has had a chance to attempt auto-login we shouldn't bounce
  // the user to /login — otherwise a LIFF entry flashes the email form
  // for a beat before silently authenticating.
  const [liffSettled, setLiffSettled] = useState(!isLiffConfigured())

  useEffect(() => { fetchMe() }, [])

  // LIFF auto-login. Three branches:
  //   - Not in LINE app (regular browser): nothing to do.
  //   - In LINE app, not yet LINE-logged-in: trigger the silent native
  //     handoff. LIFF reloads the page once a token is available.
  //   - In LINE app, have token, but no app session: hit /auth/line-login.
  //     If the LINE id is bound, we get a JWT and skip the login screen.
  //     If not, route to /login where the pairing form is shown with the
  //     LINE access token already in hand.
  useEffect(() => {
    if (!isLiffConfigured()) return
    let cancelled = false
    ;(async () => {
      const { ready, inClient } = await initLiff()
      if (cancelled) return
      if (!ready || !inClient) { setLiffSettled(true); return }
      if (!isLoggedInLine()) {
        triggerLineLogin()
        return
      }
      if (isAuthenticated) { setLiffSettled(true); return }
      const token = getLineAccessToken()
      if (!token) { setLiffSettled(true); return }
      try {
        const res = await loginWithLine(token)
        if (res.status === 'not-linked' && !isPublic) {
          // Park the LINE token so the login page's pairing form can use
          // it without re-running LIFF init.
          sessionStorage.setItem('pendingLineAccessToken', token)
          if (res.lineDisplayName) sessionStorage.setItem('pendingLineDisplayName', res.lineDisplayName)
          if (res.linePictureUrl) sessionStorage.setItem('pendingLinePictureUrl', res.linePictureUrl)
          router.replace('/login')
        }
      } catch (err) {
        console.warn('[liff] auto-login failed:', err)
      } finally {
        if (!cancelled) setLiffSettled(true)
      }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!isLoading && liffSettled && !isAuthenticated && !isPublic) {
      router.replace('/login')
    }
  }, [isLoading, liffSettled, isAuthenticated, isPublic])

  if ((isLoading || !liffSettled) && !isPublic) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F7F5]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-[#1D9E75] border-t-transparent animate-spin" />
          <p className="text-sm text-gray-500">
            {isInLiff() ? 'กำลังเข้าสู่ระบบผ่าน LINE...' : 'กำลังโหลด...'}
          </p>
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
        <ToastProvider>
          <AuthProvider>{children}</AuthProvider>
        </ToastProvider>
      </body>
    </html>
  )
}
