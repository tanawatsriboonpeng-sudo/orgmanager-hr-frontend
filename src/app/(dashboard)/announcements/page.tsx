'use client'
import { useEffect, useState } from 'react'
import { announcementApi } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { IconPlus, IconSpeakerphone, IconCheck, IconAlertTriangle, IconInfoCircle } from '@tabler/icons-react'
import dayjs from 'dayjs'
import clsx from 'clsx'

const TYPE_META: Record<string, { label: string; badge: string; icon: any }> = {
  info: { label: 'ข้อมูล', badge: 'badge-blue', icon: IconInfoCircle },
  warning: { label: 'เตือน', badge: 'badge-amber', icon: IconAlertTriangle },
  urgent: { label: 'ด่วน', badge: 'badge-red', icon: IconAlertTriangle },
  success: { label: 'ดี', badge: 'badge-green', icon: IconCheck },
}

const ROLE_OPTIONS: { key: 'owner' | 'hr' | 'employee'; label: string }[] = [
  { key: 'owner', label: 'เจ้าของ' },
  { key: 'hr', label: 'HR' },
  { key: 'employee', label: 'พนักงาน' },
]

export default function AnnouncementsPage() {
  const { user } = useAuthStore()
  const [items, setItems] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    title: '',
    content: '',
    type: 'info',
    targetRoles: [] as string[],
  })
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const canCreate = user?.role === 'hr' || user?.role === 'owner'

  const load = async () => {
    const res = await announcementApi.list().catch(() => null)
    if (res) setItems(res.data.data || [])
  }

  useEffect(() => { load() }, [])

  const toggleRole = (role: string) => {
    setForm(p => ({
      ...p,
      targetRoles: p.targetRoles.includes(role)
        ? p.targetRoles.filter(r => r !== role)
        : [...p.targetRoles, role],
    }))
  }

  const submit = async () => {
    if (!form.title || !form.content) {
      setMsg('กรุณากรอกหัวข้อและเนื้อหา'); return
    }
    setLoading(true); setMsg('')
    try {
      await announcementApi.create({
        title: form.title,
        content: form.content,
        type: form.type,
        targetRoles: form.targetRoles.length > 0 ? form.targetRoles : undefined,
      })
      setMsg('สร้างประกาศแล้ว')
      setShowForm(false)
      setForm({ title: '', content: '', type: 'info', targetRoles: [] })
      load()
    } catch (e: any) {
      setMsg(e.response?.data?.message || 'เกิดข้อผิดพลาด')
    } finally { setLoading(false) }
  }

  // Optimistic mark-read: stamp read_at locally, sync via API, surface
  // any failure (offline, 500). Previously the catch was empty so a
  // failed POST left the announcement looking read until the next page
  // load (when load() re-fetched the true state) and the user had no
  // idea anything went wrong. After success we also kick the bell so
  // its badge refreshes without waiting for the 30s poll — the
  // backend's /announcements/:id/read also clears the linked
  // notification row.
  const markRead = async (id: string) => {
    const nowIso = new Date().toISOString()
    setItems(list => list.map(a => a.id === id ? { ...a, read_at: nowIso } : a))
    try {
      await announcementApi.markRead(id)
      setMsg('')
      window.dispatchEvent(new Event('notifications:refresh'))
    } catch (e: any) {
      setItems(list => list.map(a => a.id === id ? { ...a, read_at: null } : a))
      setMsg(e?.response?.data?.message || 'ทำเครื่องหมายอ่านไม่สำเร็จ')
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#111110]">ประกาศ</h1>
          <p className="text-sm text-gray-500 mt-0.5">ข่าวสารและประกาศจากองค์กร</p>
        </div>
        {canCreate && (
          <button onClick={() => setShowForm(!showForm)} className="btn btn-primary text-sm">
            <IconPlus size={15} /> สร้างประกาศ
          </button>
        )}
      </div>

      {msg && !showForm && (
        <div className={clsx(
          'mb-4 px-3 py-2 rounded-md border text-xs flex items-center justify-between',
          msg.includes('แล้ว')
            ? 'bg-green-50 border-green-200 text-green-700'
            : 'bg-red-50 border-red-200 text-red-700'
        )}>
          <span>{msg}</span>
          <button onClick={() => setMsg('')} className="opacity-70 hover:opacity-100">ปิด</button>
        </div>
      )}

      {/* Form */}
      {showForm && canCreate && (
        <div className="card mb-5">
          <h2 className="text-sm font-semibold mb-4">สร้างประกาศใหม่</h2>
          <div className="space-y-3">
            <div>
              <label className="label">หัวข้อ</label>
              <input
                className="input"
                placeholder="หัวข้อประกาศ"
                value={form.title}
                onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              />
            </div>
            <div>
              <label className="label">เนื้อหา</label>
              <textarea
                className="input min-h-[100px] resize-y"
                placeholder="เนื้อหาประกาศ..."
                value={form.content}
                onChange={e => setForm(p => ({ ...p, content: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">ประเภท</label>
                <select
                  className="input"
                  value={form.type}
                  onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
                >
                  {Object.entries(TYPE_META).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">ส่งถึง (ไม่เลือก = ทุกคน)</label>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {ROLE_OPTIONS.map(r => (
                    <button
                      key={r.key}
                      type="button"
                      onClick={() => toggleRole(r.key)}
                      className={clsx(
                        'px-3 py-1.5 rounded-[8px] text-xs border transition-all',
                        form.targetRoles.includes(r.key)
                          ? 'bg-[#1D9E75] text-white border-[#1D9E75]'
                          : 'bg-white text-gray-600 border-black/[0.1] hover:bg-gray-50'
                      )}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          {msg && (
            <p className={clsx('text-xs mt-3', msg.includes('แล้ว') ? 'text-[#085041]' : 'text-red-600')}>
              {msg}
            </p>
          )}
          <div className="flex gap-2 mt-4">
            <button onClick={submit} disabled={loading} className="btn btn-primary text-sm">
              {loading ? 'กำลังส่ง...' : 'เผยแพร่'}
            </button>
            <button onClick={() => setShowForm(false)} className="btn text-sm">ยกเลิก</button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="space-y-3">
        {items.length === 0 ? (
          <div className="card text-center py-10">
            <IconSpeakerphone size={28} className="mx-auto text-gray-300 mb-2" />
            <p className="text-sm text-gray-400">ยังไม่มีประกาศ</p>
          </div>
        ) : (
          items.map((a: any) => {
            const meta = TYPE_META[a.type] || TYPE_META.info
            const Icon = meta.icon
            const isRead = a.is_read || a.read_at
            return (
              <div
                key={a.id}
                className={clsx('card', !isRead && 'ring-1 ring-[#1D9E75]/30')}
              >
                <div className="flex items-start gap-3">
                  <div className={clsx(
                    'w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0',
                    a.type === 'urgent' ? 'bg-[#FCEBEB] text-[#791F1F]' :
                    a.type === 'warning' ? 'bg-[#FAEEDA] text-[#633806]' :
                    a.type === 'success' ? 'bg-[#E1F5EE] text-[#085041]' :
                    'bg-[#E6F1FB] text-[#0C447C]'
                  )}>
                    <Icon size={17} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="text-sm font-semibold text-[#111110]">{a.title}</h3>
                      <span className={clsx('badge', meta.badge)}>{meta.label}</span>
                    </div>
                    <p className="text-sm text-gray-600 whitespace-pre-line">{a.content}</p>
                    <div className="flex items-center justify-between mt-2">
                      <div className="text-[11px] text-gray-400">
                        {dayjs(a.created_at).format('D MMM YYYY HH:mm')}
                        {a.created_by_name && <> · โดย {a.created_by_name}</>}
                      </div>
                      {!isRead && (
                        <button
                          onClick={() => markRead(a.id)}
                          className="text-[11px] text-[#1D9E75] hover:underline"
                        >
                          ทำเครื่องหมายว่าอ่านแล้ว
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
