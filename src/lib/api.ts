import axios from 'axios'
import Cookies from 'js-cookie'

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api',
  // 60s — uploading a base64 avatar onto Render free tier (with potential
  // cold-start) easily blows past 15s. Backend itself is fast once awake.
  timeout: 60000,
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
        // Backend rotates the refresh token on every /auth/refresh call
        // (revocation hardening) — the old hash is deleted server-side, so
        // we must persist the new one or the next refresh will 401.
        if (data.data.refreshToken) {
          Cookies.set('refresh_token', data.data.refreshToken, { expires: 30, sameSite: 'strict' })
        }
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

// LINE / LIFF auth. lineLogin returns 404 + code:'LINE_NOT_LINKED' when
// this LINE userId has never been paired with an employee account — the
// caller should then present an email/password form and retry, which
// performs the bind and issues JWTs in the same response.
export const lineAuthApi = {
  login: (lineAccessToken: string, email?: string, password?: string) =>
    api.post('/auth/line-login', { lineAccessToken, email, password }),
  link: (lineAccessToken: string) =>
    api.post('/auth/line-link', { lineAccessToken }),
  unlink: () => api.post('/auth/line-unlink'),
}

// Data retention. Read by HR/owner (HR sees-only), write + manual purge
// owner-only. last_purge_summary is the JSONB written by the backend's
// purgeOnce() — shape is intentionally loose here so adding a counter
// on the backend doesn't require a frontend type change.
export interface RetentionPolicy {
  retention_selfie_days: number
  retention_attachment_days: number
  retention_notification_days: number
  retention_audit_days: number
  retention_auto_purge: boolean
  last_purge_at?: string | null
  last_purge_summary?: {
    started_at?: string
    finished_at?: string
    selfies_cleared?: number
    offsite_selfies_cleared?: number
    backdate_attachments_cleared?: number
    leave_documents_cleared?: number
    notifications_deleted?: number
    audit_logs_deleted?: number
    expired_refresh_tokens_deleted?: number
    [k: string]: any
  } | null
}
export const retentionApi = {
  get: () => api.get<{ success: boolean; data: RetentionPolicy }>('/admin/retention'),
  update: (body: Partial<{
    selfieDays: number
    attachmentDays: number
    notificationDays: number
    auditDays: number
    autoPurge: boolean
  }>) => api.patch('/admin/retention', body),
  purgeNow: () => api.post<{ success: boolean; data: RetentionPolicy['last_purge_summary'] }>('/admin/purge-old-data'),
}

// Attendance APIs
export const attendanceApi = {
  checkIn: (lat?: number, lng?: number, method = 'gps', selfie?: string) =>
    api.post('/attendance/check-in', { lat, lng, method, selfie }),
  // Off-site path — same endpoint but { offsite:true, reason } skips the
  // GPS radius gate and the row sits at offsite_status='pending' until
  // HR/owner approves. Selfie + reason are mandatory for review.
  checkInOffsite: (data: { lat?: number; lng?: number; selfie: string; reason: string }) =>
    api.post('/attendance/check-in', { ...data, method: 'gps', offsite: true }),
  checkOut: (lat?: number, lng?: number) =>
    api.post('/attendance/check-out', { lat, lng }),
  today: () => api.get('/attendance/today'),
  myHistory: (month?: number, year?: number) =>
    api.get('/attendance/my-history', { params: { month, year } }),
  dailySummary: (date?: string) =>
    api.get('/attendance/daily-summary', { params: { date } }),
  recentSummary: (days = 5) =>
    api.get('/attendance/recent-summary', { params: { days } }),
  // HR/owner queue of off-site check-ins awaiting decision.
  offsitePending: () => api.get('/attendance/offsite-pending'),
  approveOffsite: (id: string) => api.post(`/attendance/offsite/${id}/approve`),
  rejectOffsite: (id: string, reason?: string) =>
    api.post(`/attendance/offsite/${id}/reject`, { reason }),

  // Backdated check-in / check-out requests.
  submitBackdate: (data: {
    date: string                                     // YYYY-MM-DD
    requestType: 'check_in' | 'check_out' | 'both'
    checkInTime?: string                             // HH:MM
    checkOutTime?: string                            // HH:MM
    reason: string
    attachment?: string                              // base64 dataURL, optional
  }) => api.post('/attendance/backdate-request', data),
  myBackdates: () => api.get('/attendance/backdate-mine'),
  backdatePending: () => api.get('/attendance/backdate-pending'),
  approveBackdate: (id: string) => api.post(`/attendance/backdate/${id}/approve`),
  rejectBackdate: (id: string, reason?: string) =>
    api.post(`/attendance/backdate/${id}/reject`, { reason }),

  // HR / owner direct-write: log check-in / check-out for any employee
  // on any past or current date. Either checkInTime or checkOutTime
  // must be present.
  adminRecord: (data: {
    employeeId: string
    date: string                                     // YYYY-MM-DD
    checkInTime?: string                             // HH:MM
    checkOutTime?: string                            // HH:MM
    note?: string
  }) => api.post('/attendance/admin-record', data),
}

// Leave APIs
export interface LeaveQuotaRow {
  id: string
  employee_id: string
  leave_type_id: string
  year: number
  total_days: number
  used_days: number
  remaining_days: number
  // joined
  first_name?: string
  last_name?: string
  nickname?: string | null
  avatar_url?: string | null
  emp_code?: string
  position?: string | null
  department_name?: string | null
  // ISO date strings (YYYY-MM-DD). Used by the team-quota table to
  // render start-date, hire-date, and tenure ("X ปี Y เดือน").
  start_date?: string | null
  hire_date?: string | null
  emp_is_active?: boolean
  leave_type_name?: string
  leave_type_code?: string
}

export interface LeaveType {
  id: string
  name: string
  code: string
  days_per_year: number
  carry_over_days: number
  advance_notice_days: number
  requires_document: boolean
  is_active: boolean
}

export const leaveApi = {
  // Active types — what the request form should populate. HR/owner
  // managing the settings card should call allTypes() instead so they
  // can see and re-enable disabled ones.
  types: () => api.get<{ success: boolean; data: LeaveType[] }>('/leave/types'),
  allTypes: () => api.get<{ success: boolean; data: LeaveType[] }>('/leave/types-all'),
  createType: (body: {
    name: string; code: string; daysPerYear: number;
    carryOverDays?: number; advanceNoticeDays?: number; requiresDocument?: boolean;
  }) => api.post('/leave/types', body),
  updateType: (id: string, body: Partial<{
    name: string; code: string; daysPerYear: number;
    carryOverDays: number; advanceNoticeDays: number;
    requiresDocument: boolean; isActive: boolean;
  }>) => api.patch(`/leave/types/${id}`, body),
  deleteType: (id: string) => api.delete<{
    success: boolean; soft: boolean; message: string
  }>(`/leave/types/${id}`),

  myQuota: (year?: number) => api.get('/leave/my-quota', { params: { year } }),
  // HR/owner overview — one row per (employee × leave_type) for a year.
  allQuotas: (year?: number) => api.get('/leave/all-quotas', { params: { year } }),
  // Upsert quota — pass year + totalDays; pair with employeeId/leaveTypeId
  // for the (employee × type × year) tuple.
  setQuota: (body: { employeeId: string; leaveTypeId: string; year: number; totalDays: number }) =>
    api.put('/leave/quotas', body),
  // One-click seed: creates quota rows for every (active employee × active
  // type) for the given year using each type's days_per_year. Skips rows
  // that already exist so it's safe to re-run.
  seedDefaultQuotas: (year?: number) =>
    api.post<{ success: boolean; data: { year: number; created: number }; message: string }>(
      '/leave/quotas/seed-defaults', { year }
    ),

  myHistory: () => api.get('/leave/my-history'),
  // HR/owner organization-wide leave request feed. All filters optional.
  allRequests: (params?: {
    status?: 'pending' | 'approved' | 'rejected' | 'cancelled'
    year?: number; departmentId?: string; employeeId?: string; limit?: number
  }) => api.get('/leave/all-requests', { params }),

  // Employee self-service. document is optional unless leave_type
  // requires_document=true (backend enforces — frontend can also guard).
  create: (data: {
    leaveTypeId: string; startDate: string; endDate: string;
    reason: string; document?: string
  }) => api.post('/leave/request', data),
  cancel: (id: string) => api.post(`/leave/${id}/cancel`),
  // HR/owner only — voids an already-approved leave: refunds the quota
  // and removes the leave-marked attendance rows in one backend
  // transaction. Used when an employee's plans change after approval.
  cancelApproved: (id: string, reason?: string) =>
    api.post(`/leave/${id}/cancel-approved`, { reason }),
  pending: () => api.get('/leave/pending'),
  approve: (id: string, action: 'approved' | 'rejected', hrNotes?: string) =>
    api.patch(`/leave/${id}/approve`, { action, hrNotes }),

  // HR/owner backdate. deductQuota defaults to true server-side; pass
  // false to log a leave without consuming the employee's allowance.
  adminRecord: (body: {
    employeeId: string; leaveTypeId: string;
    startDate: string; endDate: string; reason: string;
    document?: string; deductQuota?: boolean; hrNotes?: string;
  }) => api.post('/leave/admin-record', body),
}

// OT APIs
export const otApi = {
  create: (data: { date: string; startTime: string; endTime: string; reason: string }) =>
    api.post('/ot/request', data),
  myHistory: () => api.get('/ot/my-history'),
  cancel: (id: string) => api.post(`/ot/${id}/cancel`),
  pending: () => api.get('/ot/pending'),
  approve: (id: string, action: 'approved' | 'rejected', rejectedReason?: string) =>
    api.patch(`/ot/${id}/approve`, { action, rejectedReason }),
}

// Employee APIs
export interface EmployeeUpdate {
  firstName?: string
  lastName?: string
  nickname?: string
  phone?: string
  position?: string
  // Canonical link to the positions tree (overrides position text when
  // both are sent — backend resolves the position name from this id and
  // writes both columns in sync). Pass null to clear.
  positionId?: string | null
  department?: string
  shiftType?: string
  baseSalary?: number
  role?: 'owner' | 'hr' | 'employee'
  managerId?: string | null
  avatarUrl?: string
  bankAccount?: string
  bankName?: string
  nationalId?: string
  workDays?: number[]   // 0=Sun..6=Sat
  // Personal
  title?: string
  firstNameEn?: string
  lastNameEn?: string
  nicknameEn?: string
  gender?: string
  nationality?: string
  maritalStatus?: string
  dateOfBirth?: string  // YYYY-MM-DD
  address?: string
  // IDs
  passportNumber?: string
  socialSecurityNumber?: string
  taxId?: string
  fingerprintCode?: string
  // Employment
  hireDate?: string
  retirementYear?: number
  probationDays?: number
  probationEndDate?: string
  contractEndDate?: string
  employmentType?: string
  startDate?: string
  // Bank / payroll
  bankBranchCode?: string
  paymentMethod?: string
  // Free-form
  notes?: string
  hashtags?: string[]
}

export interface WorkDaysBulkItem {
  employeeId: string
  workDays: number[]
}

// Recurring weekly shift schedule. Keys are day-of-week numbers
// ("0"=Sun..."6"=Sat). Values are a shift_configs.code or "dayoff".
export type WeeklyShifts = Record<string, string>
export interface WeeklyShiftsBulkItem {
  employeeId: string
  weeklyShifts: WeeklyShifts
}

export interface SelfUpdate {
  nickname?: string
  phone?: string
  avatarUrl?: string
  // Personal
  title?: string
  firstNameEn?: string
  lastNameEn?: string
  nicknameEn?: string
  gender?: string
  nationality?: string
  maritalStatus?: string
  dateOfBirth?: string
  address?: string
  // IDs
  nationalId?: string
  passportNumber?: string
  socialSecurityNumber?: string
  taxId?: string
  // Bank
  bankAccount?: string
  bankName?: string
  bankBranchCode?: string
}

export const employeeApi = {
  list: () => api.get('/employees'),
  // Anyone authenticated; returns their direct reports (may be empty).
  // Used by /kpi so a manager-without-HR-role can still pick a subordinate.
  mySubordinates: () => api.get('/employees/my-subordinates'),
  me: () => api.get('/employees/me'),
  getOne: (id: string) => api.get(`/employees/${id}`),
  update: (id: string, data: EmployeeUpdate) => api.patch(`/employees/${id}`, data),
  updateMe: (data: SelfUpdate) => api.patch('/employees/me', data),
  bulkUpdateWorkDays: (items: WorkDaysBulkItem[]) =>
    api.post('/employees/work-days/bulk', { items }),
  bulkUpdateWeeklyShifts: (items: WeeklyShiftsBulkItem[]) =>
    api.post('/employees/weekly-shifts/bulk', { items }),
}

// Position (job-title hierarchy) APIs
export interface Position {
  id: string
  code?: string
  name: string
  description?: string
  parent_id?: string | null
}
export interface PositionUpsert {
  code?: string
  name?: string
  description?: string
  parentId?: string | null
}
export const positionApi = {
  list: () => api.get('/positions'),
  create: (data: PositionUpsert) => api.post('/positions', data),
  update: (id: string, data: PositionUpsert) => api.patch(`/positions/${id}`, data),
  delete: (id: string) => api.delete(`/positions/${id}`),
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
  // shift_configs.code such as "WC001", or the legacy literals
  // 'normal'/'flexible'/'dayoff' (no CHECK constraint anymore).
  shift_type: string
  notes?: string
}
export interface ShiftBulkItem {
  employeeId: string
  date: string
  // Either a shift_configs.code (e.g. "WC001"), the legacy literals
  // 'normal'/'flexible'/'dayoff', or 'default' to clear the override.
  shiftType: string
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
  code?: string | null
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
  code?: string
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

// Calendar events. Distinct from holidays — these are meetings,
// seminars, company events scheduled by HR/owner (or the creator).
// visibility=='all' → everyone sees it; 'department' → only that
// dept; 'specific' → only employees in attendee_ids.
export interface CalendarEvent {
  id: string
  title: string
  description?: string | null
  event_type: 'meeting' | 'seminar' | 'company' | 'birthday' | 'other' | string
  start_date: string          // YYYY-MM-DD
  end_date?: string | null
  start_time?: string | null  // HH:MM:SS
  end_time?: string | null
  location?: string | null
  color?: string | null
  visibility: 'all' | 'department' | 'specific'
  department_id?: string | null
  department_name?: string | null
  attendee_ids?: string[] | null
  created_by?: string | null
  created_by_name?: string | null
  created_at?: string
}
// Pulled out so the update signature can reference it without
// self-referencing eventApi (`Parameters<typeof eventApi.create>` inside
// the same object literal is a TS evaluation-order footgun).
export interface CalendarEventInput {
  title: string
  description?: string
  eventType?: string
  startDate: string
  endDate?: string
  startTime?: string
  endTime?: string
  location?: string
  color?: string
  visibility?: 'all' | 'department' | 'specific'
  departmentId?: string
  attendeeIds?: string[]
}
export const eventApi = {
  // from/to inclusive YYYY-MM-DD. Omit to get the default window
  // (today − 30d .. today + 90d).
  list: (params?: { from?: string; to?: string }) =>
    api.get<{ success: boolean; data: CalendarEvent[] }>('/events', { params }),
  create: (body: CalendarEventInput) =>
    api.post<{ success: boolean; data: CalendarEvent }>('/events', body),
  update: (id: string, body: Partial<CalendarEventInput>) =>
    api.patch<{ success: boolean }>(`/events/${id}`, body),
  delete: (id: string) => api.delete<{ success: boolean }>(`/events/${id}`),
}

// Holiday APIs
export interface Holiday {
  id: string
  name: string
  date: string         // YYYY-MM-DD
  type: 'national' | 'religious' | 'company' | string
  year: number
  created_by?: string | null
  created_at?: string
}
export const holidayApi = {
  list: (year?: number) =>
    api.get<{ success: boolean; data: Holiday[] }>('/holidays', { params: { year } }),
  create: (data: { name: string; date: string; type?: string }) =>
    api.post<{ success: boolean; data: Holiday }>('/holidays', data),
  delete: (id: string) => api.delete<{ success: boolean }>(`/holidays/${id}`),
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

// Payroll APIs
export type PayrollStatus = 'draft' | 'approved' | 'paid'
export interface PayrollRecord {
  id: string
  employee_id: string
  month: number
  year: number
  base_salary: string | number
  ot_amount: string | number
  bonus: string | number
  allowances: string | number
  social_security: string | number
  income_tax: string | number
  other_deductions: string | number
  net_salary: string | number     // generated by Postgres
  work_days: number | null
  absent_days: number
  late_count: number
  ot_hours: string | number
  status: PayrollStatus
  paid_at: string | null
  slip_sent_at: string | null
  notes: string | null
  created_at: string
  // joined from employees / departments
  first_name?: string
  last_name?: string
  nickname?: string
  avatar_url?: string
  emp_code?: string
  position?: string
  department_name?: string
  bank_account?: string
  bank_name?: string
  bank_branch_code?: string
}
export interface PayrollCreate {
  employeeId: string
  month: number
  year: number
  baseSalary: number
  otAmount?: number
  bonus?: number
  allowances?: number
  socialSecurity?: number
  incomeTax?: number
  otherDeductions?: number
  workDays?: number
  absentDays?: number
  lateCount?: number
  otHours?: number
  notes?: string
}
export interface PayrollUpdate {
  baseSalary?: number
  otAmount?: number
  bonus?: number
  allowances?: number
  socialSecurity?: number
  incomeTax?: number
  otherDeductions?: number
  workDays?: number
  absentDays?: number
  lateCount?: number
  otHours?: number
  notes?: string
  status?: PayrollStatus
}
export const payrollApi = {
  list: (params?: { month?: number; year?: number; status?: PayrollStatus; employeeId?: string }) =>
    api.get('/payroll', { params }),
  getOne: (id: string) => api.get(`/payroll/${id}`),
  create: (data: PayrollCreate) => api.post('/payroll', data),
  update: (id: string, data: PayrollUpdate) => api.patch(`/payroll/${id}`, data),
  delete: (id: string) => api.delete(`/payroll/${id}`),
  approve: (id: string) => api.post(`/payroll/${id}/approve`),
  markPaid: (id: string) => api.post(`/payroll/${id}/mark-paid`),
  bulkGenerate: (month: number, year: number) =>
    api.post('/payroll/bulk-generate', { month, year }),
}

// Org Settings APIs (singleton, owner-editable)
export interface OrgSettings {
  id?: number
  company_name: string | null
  company_name_en: string | null
  company_address: string | null
  company_phone: string | null
  company_email: string | null
  company_tax_id: string | null
  company_logo: string | null
  updated_at?: string
}
export interface OrgSettingsUpdate {
  companyName?: string
  companyNameEn?: string
  companyAddress?: string
  companyPhone?: string
  companyEmail?: string
  companyTaxId?: string
  companyLogo?: string
}
export const orgApi = {
  get: () => api.get('/org-settings'),
  update: (data: OrgSettingsUpdate) => api.patch('/org-settings', data),
}

// Notification APIs (in-app bell per user)
export type NotificationType =
  | 'leave_request_pending' | 'leave_approved' | 'leave_rejected'
  | 'ot_request_pending'    | 'ot_approved'    | 'ot_rejected'
  | 'payroll_approved'      | 'payroll_paid'
  | 'announcement'
  | 'password_reset'        | 'account_disabled' | 'account_enabled'
  | string
export interface Notification {
  id: string
  type: NotificationType
  title: string
  body: string | null
  link: string | null
  related_id: string | null
  read_at: string | null
  created_at: string
}
export interface NotificationListParams {
  limit?: number
  offset?: number
  unread?: boolean
}
export const notificationApi = {
  list: (params?: NotificationListParams) =>
    api.get('/notifications', { params }),
  unreadCount: () => api.get('/notifications/unread-count'),
  markRead: (id: string) => api.post(`/notifications/${id}/read`),
  markAllRead: () => api.post('/notifications/mark-all-read'),
  delete: (id: string) => api.delete(`/notifications/${id}`),
  clearRead: () => api.post('/notifications/clear-read'),
}

// Audit Log APIs
export interface AuditLog {
  id: string
  user_id: string | null
  action: string
  resource: string | null
  resource_id: string | null
  details: any
  ip_address: string | null
  device_info: string | null
  created_at: string
  email?: string | null
  role?: string | null
  user_name?: string | null
  user_nickname?: string | null
  user_avatar?: string | null
}
export interface AuditLogParams {
  action?: string
  resource?: string
  userId?: string
  from?: string  // ISO timestamp
  to?: string    // ISO timestamp
  limit?: number
  offset?: number
}
export const auditApi = {
  list: (params?: AuditLogParams) => api.get('/audit-logs', { params }),
}

// KPI APIs
export interface KpiCriterion {
  id: string
  name: string
  description: string | null
  weight: string | number     // NUMERIC from pg may arrive as string
  department_id: string | null
  department_name?: string | null
  is_active: boolean
  created_at: string
}
export interface KpiCriterionUpsert {
  name?: string
  description?: string | null
  weight?: number
  // null = clear department; undefined = leave unchanged
  departmentId?: string | null
  isActive?: boolean
}

export interface KpiScoreEntry {
  criterionId: string
  score: number  // 1..5
  note?: string
  // Joined server-side on GET /kpi/reviews/:id for display
  criterion_name?: string
  criterion_weight?: string | number | null
  criterion_active?: boolean
}
export type KpiReviewStatus = 'draft' | 'submitted' | 'approved'
export interface KpiReview {
  id: string
  employee_id: string
  reviewer_id: string | null
  quarter: 1 | 2 | 3 | 4
  year: number
  scores: KpiScoreEntry[]
  overall_score: string | number | null
  status: KpiReviewStatus
  comments: string | null
  created_at: string
  updated_at: string
  // joined employee
  first_name?: string
  last_name?: string
  nickname?: string
  avatar_url?: string
  emp_code?: string
  position?: string
  department_name?: string
  manager_id?: string | null
  // joined reviewer
  reviewer_email?: string | null
  reviewer_first_name?: string | null
  reviewer_last_name?: string | null
  reviewer_nickname?: string | null
  reviewer_avatar_url?: string | null
}
export interface KpiReviewCreate {
  employeeId: string
  quarter: 1 | 2 | 3 | 4
  year: number
  scores: KpiScoreEntry[]
  comments?: string
}
export interface KpiReviewUpdate {
  scores?: KpiScoreEntry[]
  comments?: string
  status?: KpiReviewStatus
}
export interface KpiReviewListParams {
  employeeId?: string
  quarter?: number
  year?: number
  status?: KpiReviewStatus
}

export const kpiApi = {
  // Criteria
  listCriteria: (includeInactive = false) =>
    api.get('/kpi/criteria', { params: includeInactive ? { includeInactive: 1 } : {} }),
  createCriterion: (data: KpiCriterionUpsert) => api.post('/kpi/criteria', data),
  updateCriterion: (id: string, data: KpiCriterionUpsert) => api.patch(`/kpi/criteria/${id}`, data),
  deleteCriterion: (id: string) => api.delete(`/kpi/criteria/${id}`),
  // Reviews
  listReviews: (params?: KpiReviewListParams) => api.get('/kpi/reviews', { params }),
  getReview: (id: string) => api.get(`/kpi/reviews/${id}`),
  createReview: (data: KpiReviewCreate) => api.post('/kpi/reviews', data),
  updateReview: (id: string, data: KpiReviewUpdate) => api.patch(`/kpi/reviews/${id}`, data),
  submitReview: (id: string) => api.post(`/kpi/reviews/${id}/submit`),
  approveReview: (id: string) => api.post(`/kpi/reviews/${id}/approve`),
  deleteReview: (id: string) => api.delete(`/kpi/reviews/${id}`),
}

// Cleaning roster APIs
export interface CleaningItem {
  id: string
  name: string
  description: string | null
  display_order: number
  is_active: boolean
  created_at?: string
}
export interface CleaningItemUpsert {
  name?: string
  description?: string | null
  displayOrder?: number
  isActive?: boolean
}
export interface CleaningSettings {
  id?: number
  // 0=Sun..6=Sat. Empty array = disabled (no scheduled days).
  weekdays: number[]
  start_time: string  // "HH:MM:SS"
  end_time: string
  is_active: boolean
  updated_at?: string
}
export interface CleaningSettingsUpdate {
  weekdays?: number[]
  startTime?: string  // "HH:MM"
  endTime?: string
  isActive?: boolean
}
export interface CleaningQueueRow {
  id: string
  employee_id: string
  position: number
  is_active: boolean
  first_name?: string
  last_name?: string
  nickname?: string | null
  avatar_url?: string | null
  emp_code?: string
  employee_active?: boolean
}
export interface CleaningQueueResponse {
  queue: CleaningQueueRow[]
  nextPosition: number
}
export type CleaningSessionStatus =
  | 'open' | 'inspector_reviewed' | 'approved' | 'rejected'
export interface CleaningSessionItem {
  id: string
  item_id: string | null
  item_name: string
  display_order: number
  done_by_employee_id: string | null
  // true = inspector marked this item as explicitly skipped ("ไม่ได้ทำ").
  // Mutually exclusive with done_by_employee_id.
  not_done: boolean
  inspector_note: string | null
  done_by_first_name?: string | null
  done_by_last_name?: string | null
  done_by_nickname?: string | null
  done_by_avatar_url?: string | null
}
export interface CleaningSession {
  id: string
  session_date: string  // YYYY-MM-DD
  start_time: string
  end_time: string
  inspector_id: string | null
  status: CleaningSessionStatus
  inspector_notes: string | null
  inspector_completed_at: string | null
  approved_by: string | null
  approved_at: string | null
  hr_notes: string | null
  created_at: string
  // joined
  inspector_first_name?: string | null
  inspector_last_name?: string | null
  inspector_nickname?: string | null
  inspector_avatar_url?: string | null
  approver_first_name?: string | null
  approver_last_name?: string | null
  items: CleaningSessionItem[]
}
export interface CleaningSessionListRow {
  id: string
  session_date: string
  start_time: string
  end_time: string
  status: CleaningSessionStatus
  inspector_id: string | null
  approved_at: string | null
  inspector_first_name?: string | null
  inspector_last_name?: string | null
  inspector_nickname?: string | null
  inspector_avatar_url?: string | null
  item_count: number
  filled_count: number
}
export interface CleaningInspectItem {
  itemId: string
  // When notDone=true the backend force-nulls doneByEmployeeId, so the
  // two fields never disagree even if the caller sends both.
  doneByEmployeeId?: string | null
  notDone?: boolean
  note?: string | null
}
export const cleaningApi = {
  // items
  listItems: (includeInactive = false) =>
    api.get('/cleaning/items', { params: includeInactive ? { includeInactive: 1 } : {} }),
  createItem: (data: CleaningItemUpsert) => api.post('/cleaning/items', data),
  updateItem: (id: string, data: CleaningItemUpsert) => api.patch(`/cleaning/items/${id}`, data),
  deleteItem: (id: string) => api.delete(`/cleaning/items/${id}`),
  // settings
  getSettings: () => api.get('/cleaning/settings'),
  updateSettings: (data: CleaningSettingsUpdate) => api.patch('/cleaning/settings', data),
  // queue
  getQueue: () => api.get('/cleaning/inspector-queue'),
  saveQueue: (employeeIds: string[]) => api.put('/cleaning/inspector-queue', { employeeIds }),
  // sessions
  today: () => api.get('/cleaning/today'),
  listSessions: (params?: { limit?: number; offset?: number }) =>
    api.get('/cleaning/sessions', { params }),
  getSession: (id: string) => api.get(`/cleaning/sessions/${id}`),
  reassignInspector: (id: string, employeeId: string) =>
    api.patch(`/cleaning/sessions/${id}/inspector`, { employeeId }),
  inspect: (id: string, items: CleaningInspectItem[], notes?: string) =>
    api.post(`/cleaning/sessions/${id}/inspect`, { items, notes }),
  // Inspector ad-hoc items: rows the inspector adds beyond what HR
  // pre-defined. Backend enforces "assigned inspector + session still
  // editable" and "only ad-hoc rows can be deleted from here".
  addSessionItem: (sessionId: string, name: string) =>
    api.post(`/cleaning/sessions/${sessionId}/items`, { name }),
  deleteSessionItem: (sessionId: string, itemId: string) =>
    api.delete(`/cleaning/sessions/${sessionId}/items/${itemId}`),
  approve: (id: string, hrNotes?: string) =>
    api.post(`/cleaning/sessions/${id}/approve`, { hrNotes }),
  reject: (id: string, hrNotes?: string) =>
    api.post(`/cleaning/sessions/${id}/reject`, { hrNotes }),
}

// Office Locations APIs — owner-managed list of allowed GPS check-in
// spots, each with its own radius. Anyone authenticated can read; only
// owner can mutate (enforced server-side).
export interface OfficeLocation {
  id: string
  name: string
  lat: number
  lng: number
  radius_meters: number
  is_active: boolean
  created_at?: string
  updated_at?: string
}
export interface OfficeLocationUpsert {
  name?: string
  lat?: number
  lng?: number
  radiusMeters?: number
  isActive?: boolean
}
export const officeLocationApi = {
  list: () => api.get('/office-locations'),
  create: (data: OfficeLocationUpsert) => api.post('/office-locations', data),
  update: (id: string, data: OfficeLocationUpsert) => api.patch(`/office-locations/${id}`, data),
  delete: (id: string) => api.delete(`/office-locations/${id}`),
}

export default api
