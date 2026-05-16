import { NextResponse, type NextRequest } from 'next/server'

// Dashboard routes are user-specific and we keep iterating on the UI,
// so opt out of Vercel's edge HTML cache. JS bundles still get cached
// by content hash, only the shell HTML is forced to revalidate.
export function middleware(req: NextRequest) {
  const res = NextResponse.next()
  res.headers.set('Cache-Control', 'no-store, max-age=0')
  return res
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/attendance/:path*',
    '/leave/:path*',
    '/ot/:path*',
    '/shifts/:path*',
    '/payroll/:path*',
    '/kpi/:path*',
    '/projects/:path*',
    '/finance/:path*',
    '/announcements/:path*',
    '/employees/:path*',
    '/org-chart/:path*',
    '/settings/:path*',
  ],
}
