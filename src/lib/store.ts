import { create } from 'zustand'
import Cookies from 'js-cookie'
import { authApi, lineAuthApi } from '@/lib/api'

interface User {
  id: string
  email: string
  role: 'owner' | 'hr' | 'employee'
  employeeId: string
  firstName?: string
  lastName?: string
  first_name?: string  // backend uses snake_case in /auth/me
  last_name?: string
  fullName?: string
  avatarUrl?: string
  avatar_url?: string  // backend uses snake_case in /auth/me
  department?: string
  position?: string
}

interface AuthState {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (email: string, password: string, role?: string) => Promise<void>
  // Returns 'ok' (signed in), 'not-linked' (need email/password to pair),
  // or throws on real errors. The 2-arg form completes the pairing.
  loginWithLine: (
    lineAccessToken: string,
    pair?: { email: string; password: string }
  ) => Promise<{ status: 'ok' } | { status: 'not-linked'; lineDisplayName?: string; linePictureUrl?: string }>
  logout: () => Promise<void>
  fetchMe: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,

  login: async (email, password, role) => {
    const { data } = await authApi.login(email, password, role)
    const { accessToken, refreshToken, user } = data.data
    Cookies.set('access_token', accessToken, { expires: 1, sameSite: 'strict' })
    Cookies.set('refresh_token', refreshToken, { expires: 30, sameSite: 'strict' })
    set({ user, isAuthenticated: true })
  },

  loginWithLine: async (lineAccessToken, pair) => {
    try {
      const { data } = await lineAuthApi.login(
        lineAccessToken,
        pair?.email,
        pair?.password,
      )
      const { accessToken, refreshToken, user } = data.data
      Cookies.set('access_token', accessToken, { expires: 1, sameSite: 'strict' })
      Cookies.set('refresh_token', refreshToken, { expires: 30, sameSite: 'strict' })
      set({ user, isAuthenticated: true })
      return { status: 'ok' as const }
    } catch (err: any) {
      // 404 + LINE_NOT_LINKED is an expected branch, not an error — surface
      // it so the login page can render the pairing form. Anything else
      // bubbles up to the caller's try/catch.
      if (
        err?.response?.status === 404 &&
        err?.response?.data?.code === 'LINE_NOT_LINKED'
      ) {
        const d = err.response.data?.data || {}
        return {
          status: 'not-linked' as const,
          lineDisplayName: d.lineDisplayName,
          linePictureUrl: d.linePictureUrl,
        }
      }
      throw err
    }
  },

  logout: async () => {
    try { await authApi.logout() } catch {}
    Cookies.remove('access_token')
    Cookies.remove('refresh_token')
    set({ user: null, isAuthenticated: false })
  },

  fetchMe: async () => {
    const token = Cookies.get('access_token')
    if (!token) { set({ isLoading: false }); return }
    try {
      const { data } = await authApi.me()
      set({ user: data.data, isAuthenticated: true, isLoading: false })
    } catch {
      Cookies.remove('access_token')
      Cookies.remove('refresh_token')
      set({ user: null, isAuthenticated: false, isLoading: false })
    }
  },
}))
