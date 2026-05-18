'use client'
import { useEffect, useState } from 'react'
import { projectApi, employeeApi } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import {
  IconPlus, IconClipboardList, IconCalendar, IconFlag,
  IconChevronLeft, IconUser, IconCircle, IconCircleCheck,
  IconProgress, IconCircleDashed
} from '@tabler/icons-react'
import dayjs from 'dayjs'
import clsx from 'clsx'

const PRIORITY_META: Record<string, { label: string; badge: string }> = {
  low: { label: 'ต่ำ', badge: 'badge-gray' },
  medium: { label: 'กลาง', badge: 'badge-blue' },
  high: { label: 'สูง', badge: 'badge-amber' },
  urgent: { label: 'ด่วน', badge: 'badge-red' },
}

const TASK_STATUSES = [
  { key: 'todo', label: 'ที่ต้องทำ', icon: IconCircleDashed, color: 'text-gray-400' },
  { key: 'in_progress', label: 'กำลังทำ', icon: IconProgress, color: 'text-[#0C447C]' },
  { key: 'review', label: 'รอตรวจ', icon: IconCircle, color: 'text-[#633806]' },
  { key: 'done', label: 'เสร็จแล้ว', icon: IconCircleCheck, color: 'text-[#085041]' },
] as const

type TaskStatus = typeof TASK_STATUSES[number]['key']

export default function ProjectsPage() {
  const { user } = useAuthStore()
  const [projects, setProjects] = useState<any[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tasks, setTasks] = useState<any[]>([])
  const [employees, setEmployees] = useState<any[]>([])
  const [showProjectForm, setShowProjectForm] = useState(false)
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [projectForm, setProjectForm] = useState({ name: '', description: '', priority: 'medium', dueDate: '' })
  const [taskForm, setTaskForm] = useState({ title: '', assigneeId: '', priority: 'medium', dueDate: '' })
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const isHR = user?.role === 'hr' || user?.role === 'owner'

  const loadProjects = async () => {
    const res = await projectApi.list().catch(() => null)
    if (res) setProjects(res.data.data || [])
  }

  const loadTasks = async (projectId: string) => {
    const res = await projectApi.tasks(projectId).catch(() => null)
    if (res) setTasks(res.data.data || [])
  }

  const loadEmployees = async () => {
    if (!isHR) return
    const res = await employeeApi.list().catch(() => null)
    if (res) setEmployees(res.data.data || [])
  }

  useEffect(() => {
    loadProjects()
    loadEmployees()
  }, [])

  useEffect(() => {
    if (selectedId) loadTasks(selectedId)
  }, [selectedId])

  const createProject = async () => {
    if (!projectForm.name) { setMsg('กรุณากรอกชื่อโปรเจกต์'); return }
    setLoading(true); setMsg('')
    try {
      await projectApi.create({
        name: projectForm.name,
        description: projectForm.description || undefined,
        priority: projectForm.priority,
        dueDate: projectForm.dueDate || undefined,
      })
      setShowProjectForm(false)
      setProjectForm({ name: '', description: '', priority: 'medium', dueDate: '' })
      loadProjects()
    } catch (e: any) {
      setMsg(e.response?.data?.message || 'เกิดข้อผิดพลาด')
    } finally { setLoading(false) }
  }

  const createTask = async () => {
    if (!selectedId || !taskForm.title) { setMsg('กรุณากรอกชื่องาน'); return }
    setLoading(true); setMsg('')
    try {
      await projectApi.createTask({
        projectId: selectedId,
        title: taskForm.title,
        assigneeId: taskForm.assigneeId || undefined,
        priority: taskForm.priority,
        dueDate: taskForm.dueDate || undefined,
      })
      setShowTaskForm(false)
      setTaskForm({ title: '', assigneeId: '', priority: 'medium', dueDate: '' })
      loadTasks(selectedId)
    } catch (e: any) {
      setMsg(e.response?.data?.message || 'เกิดข้อผิดพลาด')
    } finally { setLoading(false) }
  }

  // Optimistic with rollback. The dropdown changes the row's status in
  // local state immediately so the UI feels instant; if the API call
  // fails (network, 403, validation) we revert to the prior status and
  // surface the backend error message. Previously the catch was empty
  // and a 403 looked exactly like success.
  const updateTaskStatus = async (taskId: string, status: TaskStatus) => {
    const prev = tasks.find(t => t.id === taskId)?.status as TaskStatus | undefined
    if (!prev || prev === status) return
    setTasks(ts => ts.map(t => t.id === taskId ? { ...t, status } : t))
    try {
      await projectApi.updateTask(taskId, { status })
      setMsg('')
    } catch (e: any) {
      setTasks(ts => ts.map(t => t.id === taskId ? { ...t, status: prev } : t))
      setMsg(e?.response?.data?.message || 'อัปเดตสถานะไม่สำเร็จ')
    }
  }

  const selectedProject = projects.find(p => p.id === selectedId)

  // Detail view: tasks inside a project
  if (selectedId && selectedProject) {
    const tasksByStatus: Record<string, any[]> = {}
    TASK_STATUSES.forEach(s => { tasksByStatus[s.key] = tasks.filter(t => t.status === s.key) })

    return (
      <div className="p-6 max-w-6xl mx-auto">
        <button
          onClick={() => { setSelectedId(null); setTasks([]) }}
          className="btn btn-ghost text-xs mb-3"
        >
          <IconChevronLeft size={14} /> กลับไปรายการโปรเจกต์
        </button>

        <div className="flex items-center justify-between mb-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-xl font-semibold text-[#111110] truncate">{selectedProject.name}</h1>
              <span className={clsx('badge', PRIORITY_META[selectedProject.priority]?.badge || 'badge-gray')}>
                <IconFlag size={11} /> {PRIORITY_META[selectedProject.priority]?.label || selectedProject.priority}
              </span>
            </div>
            {selectedProject.description && (
              <p className="text-sm text-gray-500">{selectedProject.description}</p>
            )}
          </div>
          <button onClick={() => setShowTaskForm(!showTaskForm)} className="btn btn-primary text-sm flex-shrink-0">
            <IconPlus size={15} /> เพิ่มงาน
          </button>
        </div>

        {msg && !showTaskForm && (
          <div className="mb-4 px-3 py-2 rounded-md bg-red-50 border border-red-200 text-xs text-red-700 flex items-center justify-between">
            <span>{msg}</span>
            <button onClick={() => setMsg('')} className="text-red-500 hover:text-red-700">ปิด</button>
          </div>
        )}

        {showTaskForm && (
          <div className="card mb-5">
            <h2 className="text-sm font-semibold mb-4">สร้างงานใหม่</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="label">ชื่องาน</label>
                <input
                  className="input"
                  placeholder="เช่น ออกแบบหน้า landing"
                  value={taskForm.title}
                  onChange={e => setTaskForm(p => ({ ...p, title: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">มอบหมายให้</label>
                <select
                  className="input"
                  value={taskForm.assigneeId}
                  onChange={e => setTaskForm(p => ({ ...p, assigneeId: e.target.value }))}
                >
                  <option value="">ยังไม่มอบหมาย</option>
                  {employees.map((emp: any) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.first_name} {emp.last_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">ความสำคัญ</label>
                <select
                  className="input"
                  value={taskForm.priority}
                  onChange={e => setTaskForm(p => ({ ...p, priority: e.target.value }))}
                >
                  {Object.entries(PRIORITY_META).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="label">กำหนดเสร็จ</label>
                <input
                  type="date"
                  className="input"
                  value={taskForm.dueDate}
                  onChange={e => setTaskForm(p => ({ ...p, dueDate: e.target.value }))}
                />
              </div>
            </div>
            {msg && <p className="text-xs mt-3 text-red-600">{msg}</p>}
            <div className="flex gap-2 mt-4">
              <button onClick={createTask} disabled={loading} className="btn btn-primary text-sm">
                {loading ? 'กำลังสร้าง...' : 'สร้างงาน'}
              </button>
              <button onClick={() => setShowTaskForm(false)} className="btn text-sm">ยกเลิก</button>
            </div>
          </div>
        )}

        {/* Kanban */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {TASK_STATUSES.map(status => {
            const Icon = status.icon
            const items = tasksByStatus[status.key]
            return (
              <div key={status.key} className="bg-white rounded-[14px] border border-black/[0.06] p-3">
                <div className="flex items-center gap-1.5 mb-3 px-1">
                  <Icon size={15} className={status.color} />
                  <span className="text-xs font-semibold text-[#111110]">{status.label}</span>
                  <span className="text-xs text-gray-400 ml-auto">{items.length}</span>
                </div>
                <div className="space-y-2">
                  {items.length === 0 ? (
                    <p className="text-xs text-gray-300 text-center py-4">—</p>
                  ) : items.map((t: any) => (
                    <div
                      key={t.id}
                      className="bg-gray-50 rounded-[10px] p-2.5 border border-black/[0.04] hover:border-[#1D9E75]/30 transition-all"
                    >
                      <div className="text-xs font-medium text-[#111110] mb-1.5">{t.title}</div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {t.priority && (
                          <span className={clsx('badge text-[10px] px-1.5 py-0.5', PRIORITY_META[t.priority]?.badge || 'badge-gray')}>
                            {PRIORITY_META[t.priority]?.label || t.priority}
                          </span>
                        )}
                        {t.due_date && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-gray-500">
                            <IconCalendar size={10} />
                            {dayjs(t.due_date).format('D MMM')}
                          </span>
                        )}
                      </div>
                      {(t.assignee_name || t.assignee_first_name) && (
                        <div className="flex items-center gap-1 mt-1.5 text-[10px] text-gray-500">
                          <IconUser size={10} />
                          {t.assignee_name || `${t.assignee_first_name} ${t.assignee_last_name || ''}`.trim()}
                        </div>
                      )}
                      <select
                        value={t.status}
                        onChange={e => updateTaskStatus(t.id, e.target.value as TaskStatus)}
                        className="mt-2 w-full text-[10px] px-1.5 py-1 rounded-md border border-black/[0.08] bg-white text-gray-600 focus:outline-none focus:border-[#1D9E75]"
                      >
                        {TASK_STATUSES.map(s => (
                          <option key={s.key} value={s.key}>{s.label}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // List view
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#111110]">โปรเจกต์</h1>
          <p className="text-sm text-gray-500 mt-0.5">จัดการโปรเจกต์และงาน</p>
        </div>
        {isHR && (
          <button onClick={() => setShowProjectForm(!showProjectForm)} className="btn btn-primary text-sm">
            <IconPlus size={15} /> สร้างโปรเจกต์
          </button>
        )}
      </div>

      {showProjectForm && (
        <div className="card mb-5">
          <h2 className="text-sm font-semibold mb-4">สร้างโปรเจกต์ใหม่</h2>
          <div className="space-y-3">
            <div>
              <label className="label">ชื่อโปรเจกต์</label>
              <input
                className="input"
                placeholder="เช่น เว็บไซต์ใหม่ Q2"
                value={projectForm.name}
                onChange={e => setProjectForm(p => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="label">รายละเอียด</label>
              <textarea
                className="input min-h-[80px] resize-y"
                placeholder="รายละเอียดโปรเจกต์..."
                value={projectForm.description}
                onChange={e => setProjectForm(p => ({ ...p, description: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">ความสำคัญ</label>
                <select
                  className="input"
                  value={projectForm.priority}
                  onChange={e => setProjectForm(p => ({ ...p, priority: e.target.value }))}
                >
                  {Object.entries(PRIORITY_META).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">กำหนดเสร็จ</label>
                <input
                  type="date"
                  className="input"
                  value={projectForm.dueDate}
                  onChange={e => setProjectForm(p => ({ ...p, dueDate: e.target.value }))}
                />
              </div>
            </div>
          </div>
          {msg && <p className="text-xs mt-3 text-red-600">{msg}</p>}
          <div className="flex gap-2 mt-4">
            <button onClick={createProject} disabled={loading} className="btn btn-primary text-sm">
              {loading ? 'กำลังสร้าง...' : 'สร้างโปรเจกต์'}
            </button>
            <button onClick={() => setShowProjectForm(false)} className="btn text-sm">ยกเลิก</button>
          </div>
        </div>
      )}

      {projects.length === 0 ? (
        <div className="card text-center py-10">
          <IconClipboardList size={28} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-400">ยังไม่มีโปรเจกต์</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p: any) => {
            const total = +(p.total_tasks ?? p.task_count ?? 0)
            const done = +(p.done_tasks ?? p.completed_tasks ?? 0)
            const pct = total > 0 ? Math.round((done / total) * 100) : 0
            return (
              <button
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                className="card text-left hover:border-[#1D9E75]/40 transition-all"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="text-sm font-semibold text-[#111110]">{p.name}</h3>
                  {p.priority && (
                    <span className={clsx('badge', PRIORITY_META[p.priority]?.badge || 'badge-gray')}>
                      {PRIORITY_META[p.priority]?.label || p.priority}
                    </span>
                  )}
                </div>
                {p.description && (
                  <p className="text-xs text-gray-500 line-clamp-2 mb-3">{p.description}</p>
                )}
                <div className="mb-2">
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-gray-500">{done}/{total} งาน</span>
                    <span className="font-medium text-[#085041]">{pct}%</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-[#1D9E75] rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
                {p.due_date && (
                  <div className="flex items-center gap-1 text-[11px] text-gray-400 mt-2">
                    <IconCalendar size={11} />
                    กำหนด {dayjs(p.due_date).format('D MMM BBBB')}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
