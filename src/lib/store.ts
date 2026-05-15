import { create } from 'zustand'
import Cookies from 'js-cookie'
import { authApi } from '@/lib/api'

interface User {
  id: string
  email: string
  role: 'owner' | 'hr' | 'employee'
  employeeId: string
  firstName?: string
  lastName?: string
  fullName?: string
  avatarUrl?: string
  department?: string
  position?: string
}

interface AuthState {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (email: string, password: string, role?: string) => Promise<void>
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
