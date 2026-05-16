import axios from 'axios'
import Cookies from 'js-cookie'

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

// ใส่ Token ทุก request อัตโนมัติ
api.interceptors.request.use((config) => {
  const token = Cookies.get('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// จัดการ Token หมดอายุ — refresh อัตโนมัติ
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && error.response?.data?.code === 'TOKEN_EXPIRED' && !original._retry) {
      original._retry = true
      try {
        const refreshToken = Cookies.get('refresh_token')
        const { data } = await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL}/auth/refresh`,
          { refreshToken }
        )
        Cookies.set('access_token', data.data.accessToken, { expires: 1 })
        original.headers.Authorization = `Bearer ${data.data.accessToken}`
        return api(original)
      } catch {
        Cookies.remove('access_token')
        Cookies.remove('refresh_token')
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

// Auth APIs
export const authApi = {
  login: (email: string, password: string, role?: string) =>
    api.post('/auth/login', { email, password }),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post('/auth/change-password', { currentPassword, newPassword }),
}

// Attendance APIs
export const attendanceApi = {
  checkIn: (lat?: number, lng?: number, method = 'gps') =>
    api.post('/attendance/check-in', { lat, lng, method }),
  checkOut: (lat?: number, lng?: number) =>
    api.post('/attendance/check-out', { lat, lng }),
  today: () => api.get('/attendance/today'),
  myHistory: (month?: number, year?: number) =>
    api.get('/attendance/my-history', { params: { month, year } }),
  dailySummary: (date?: string) =>
    api.get('/attendance/daily-summary', { params: { date } }),
}

// Leave APIs
export const leaveApi = {
  types: () => api.get('/leave/types'),
  myQuota: (year?: number) => api.get('/leave/my-quota', { params: { year } }),
  myHistory: () => api.get('/leave/my-history'),
  create: (data: { leaveTypeId: string; startDate: string; endDate: string; reason: string }) =>
    api.post('/leave/request', data),
  pending: () => api.get('/leave/pending'),
  approve: (id: string, action: 'approved' | 'rejected', hrNotes?: string) =>
    api.patch(`/leave/${id}/approve`, { action, hrNotes }),
}

// OT APIs
export const otApi = {
  create: (data: { date: string; startTime: string; endTime: string; reason: string }) =>
    api.post('/ot/request', data),
  pending: () => api.get('/ot/pending'),
  approve: (id: string, action: string) =>
    api.patch(`/ot/${id}/approve`, { action }),
}

// Employee APIs
export interface EmployeeUpdate {
  firstName?: string
  lastName?: string
  nickname?: string
  phone?: string
  position?: string
  department?: string
  shiftType?: string
  baseSalary?: number
  role?: 'owner' | 'hr' | 'employee'
  managerId?: string | null
  avatarUrl?: string
  bankAccount?: string
  bankName?: string
  nationalId?: string
}

export interface SelfUpdate {
  nickname?: string
  phone?: string
  avatarUrl?: string
}

export const employeeApi = {
  list: () => api.get('/employees'),
  me: () => api.get('/employees/me'),
  update: (id: string, data: EmployeeUpdate) => api.patch(`/employees/${id}`, data),
  updateMe: (data: SelfUpdate) => api.patch('/employees/me', data),
}

// Department APIs
export const departmentApi = {
  list: () => api.get('/departments'),
  create: (data: { name: string; description?: string; managerId?: string }) =>
    api.post('/departments', data),
  update: (id: string, data: { name?: string; description?: string; managerId?: string | null }) =>
    api.patch(`/departments/${id}`, data),
  delete: (id: string) => api.delete(`/departments/${id}`),
}

// Shift APIs
export interface ShiftAssignment {
  id: string
  employee_id: string
  date: string
  shift_type: 'normal' | 'flexible' | 'dayoff'
  notes?: string
}
export interface ShiftBulkItem {
  employeeId: string
  date: string
  shiftType: 'normal' | 'flexible' | 'dayoff' | 'default'
  notes?: string
}
export const shiftApi = {
  list: (startDate: string, endDate: string) =>
    api.get('/shifts', { params: { startDate, endDate } }),
  bulkUpsert: (items: ShiftBulkItem[]) =>
    api.post('/shifts/bulk', { items }),
  delete: (id: string) => api.delete(`/shifts/${id}`),
}

// Shift Config (rules) APIs
export interface FlexTier {
  checkin_until: string  // "HH:MM" — last allowed check-in time for this tier
  checkout: string       // "HH:MM" — required check-out time
  label?: string
}
export interface ShiftConfig {
  id: string
  name: string
  shift_type: 'normal' | 'flexible' | string
  description?: string
  work_days: number[]
  checkin_start: string
  checkin_end: string
  work_start: string
  work_end: string
  grace_minutes: number
  late_warning_minutes: number
  late_threshold_minutes: number
  absent_threshold_minutes: number
  flex_tiers: FlexTier[]
  is_active: boolean
}
export interface ShiftConfigUpsert {
  name?: string
  shiftType?: 'normal' | 'flexible'
  description?: string
  workDays?: number[]
  checkinStart?: string
  checkinEnd?: string
  workStart?: string
  workEnd?: string
  graceMinutes?: number
  lateWarningMinutes?: number
  lateThresholdMinutes?: number
  absentThresholdMinutes?: number
  flexTiers?: FlexTier[]
  isActive?: boolean
}
export const shiftConfigApi = {
  list: () => api.get('/shift-configs'),
  create: (data: ShiftConfigUpsert) => api.post('/shift-configs', data),
  update: (id: string, data: ShiftConfigUpsert) => api.patch(`/shift-configs/${id}`, data),
  delete: (id: string) => api.delete(`/shift-configs/${id}`),
}

// Holiday APIs
export const holidayApi = {
  list: (year?: number) => api.get('/holidays', { params: { year } }),
  create: (data: { name: string; date: string; type: string }) =>
    api.post('/holidays', data),
  delete: (id: string) => api.delete(`/holidays/${id}`),
}

// Announcement APIs
export const announcementApi = {
  list: () => api.get('/announcements'),
  create: (data: { title: string; content: string; type: string; targetRoles?: string[] }) =>
    api.post('/announcements', data),
  markRead: (id: string) => api.post(`/announcements/${id}/read`),
}

// Project & Task APIs
export const projectApi = {
  list: () => api.get('/projects'),
  create: (data: { name: string; description?: string; priority?: string; dueDate?: string }) =>
    api.post('/projects', data),
  tasks: (projectId: string) => api.get(`/projects/${projectId}/tasks`),
  createTask: (data: { projectId: string; title: string; assigneeId?: string; priority?: string; dueDate?: string }) =>
    api.post('/tasks', data),
  updateTask: (id: string, data: { status?: string; progress?: number }) =>
    api.patch(`/tasks/${id}`, data),
}

// Audit Log APIs
export const auditApi = {
  list: () => api.get('/audit-logs'),
}

export default api
