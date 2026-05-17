'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  supportApi,
  type SupportTicket, type SupportCategory, type SupportStatus, type SupportTicketCreate,
} from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import {
  IconLifebuoy, IconBug, IconHelp, IconSparkles, IconUserQuestion, IconMessage,
  IconPlus, IconX, IconCheck, IconPaperclip, IconArrowBackUp,
  IconClipboardList,
} from '@tabler/icons-react'
import dayjs from 'dayjs'
import clsx from 'clsx'
import EmployeeAvatar from '@/components/employees/EmployeeAvatar'

// Category metadata — same source of truth used in dropdown options,
// list-row icons, and detail header. Keep keys in sync with backend
// VALID_CATEGORIES.
const CATEGORIES: { value: SupportCategory; label: string; icon: any; color: string }[] = [
  { value: 'bug',     label: '🐞 บั๊ก (ระบบผิดพลาด)',     icon: IconBug,           color: 'text-red-600 bg-red-50 border-red-200' },
  { value: 'help',    label: '❓ ขอความช่วยเหลือ',          icon: IconHelp,          color: 'text-blue-600 bg-blue-50 border-blue-200' },
  { value: 'feature', label: '✨ ขอฟีเจอร์ใหม่',            icon: IconSparkles,      color: 'text-purple-600 bg-purple-50 border-purple-200' },
  { value: 'hr',      label: '👤 เรื่อง HR (ลา/เงินเดือน)', icon: IconUserQuestion,  color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  { value: 'other',   label: '💬 อื่นๆ',                    icon: IconMessage,       color: 'text-gray-600 bg-gray-50 border-gray-200' },
]
const CAT_BY_VALUE = Object.fromEntries(CATEGORIES.map(c => [c.value, c])) as Record<SupportCategory, typeof CATEGORIES[number]>

const STATUS_TH: Record<SupportStatus, string> = {
  open: 'รอตอบ',
  answered: 'ตอบแล้ว',
  closed: 'ปิด',
}
const STATUS_BADGE: Record<SupportStatus, string> = {
  open: 'bg-amber-50 text-amber-700 border-amber-200',
  answered: 'bg-blue-50 text-blue-700 border-blue-200',
  closed: 'bg-gray-100 text-gray-600 border-gray-200',
}

// File → resized 800px-max base64 dataURL. Matches the pattern used by
// leave/payroll attachments so backend size guards line up.
async function fileToDataURL(file: File, maxDim = 800): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      const img = new Image()
      img.onload = () => {
        const scale = Math.min(maxDim / img.width, maxDim / img.height, 1)
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', 0.85))
      }
      img.onerror = reject
      img.src = e.target?.result as string
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function SupportPage() {
  const { user } = useAuthStore()
  const isStaff = user?.role === 'hr' || user?.role === 'owner'
  const router = useRouter()
  const searchParams = useSearchParams()

  // Page-level toast — same pattern as /leave + /cleaning.
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])
  const flash = (text: string, ok = true) => {
    setToast({ text, ok })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => { setToast(null); toastTimer.current = null }, 4000)
  }

  // Two views: my tickets vs all. Staff defaults to "all" so they
  // land on the inbox; employees only have "mine".
  const [view, setView] = useState<'mine' | 'all'>(isStaff ? 'all' : 'mine')
  useEffect(() => { setView(isStaff ? 'all' : 'mine') }, [isStaff])

  // Status filter is purely client-side filter on top of the list.
  // Backend still supports server-side filtering via ?status= but
  // since list response is capped at 100, filtering in memory is fine.
  const [statusFilter, setStatusFilter] = useState<SupportStatus | 'all'>('all')
  const [categoryFilter, setCategoryFilter] = useState<SupportCategory | 'all'>('all')

  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [openTicket, setOpenTicket] = useState<SupportTicket | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await supportApi.list({ limit: 100 })
      setTickets(r.data.data || [])
    } catch (e: any) {
      flash(e?.response?.data?.message || 'โหลดข้อมูลไม่สำเร็จ', false)
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  // Deep-link support: ?ticket=:id (used by bell notifications). Open
  // the detail modal on mount + strip the param on close so a refresh
  // doesn't re-open and the URL stays clean.
  useEffect(() => {
    const tid = searchParams?.get('ticket')
    if (!tid) return
    supportApi.getOne(tid).then(r => setOpenTicket(r.data.data)).catch(() => {})
  }, [searchParams])
  const closeDetail = () => {
    setOpenTicket(null)
    if (searchParams?.get('ticket')) router.replace('/support')
  }

  // Apply filters (view + status + category) in one pass.
  const filtered = useMemo(() => {
    return tickets.filter(t => {
      if (!isStaff || view === 'mine') {
        if (t.user_id !== user?.id) return false
      }
      if (statusFilter !== 'all' && t.status !== statusFilter) return false
      if (categoryFilter !== 'all' && t.category !== categoryFilter) return false
      return true
    })
  }, [tickets, view, statusFilter, categoryFilter, isStaff, user?.id])

  // Counts for the tab badges — gives staff at-a-glance "how many need
  // my attention right now."
  const pendingCount = useMemo(
    () => tickets.filter(t => t.status === 'open').length,
    [tickets]
  )

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#111110] flex items-center gap-2">
            <IconLifebuoy size={18} className="text-[#1D9E75]" />
            แจ้งปัญหา / ติดต่อสอบถาม
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isStaff
              ? 'รับเรื่องจากพนักงาน — ตอบและปิดเรื่องได้ที่นี่'
              : 'พบบั๊ก/อยากถาม/ขอฟีเจอร์ใหม่ ส่งเรื่องได้เลย HR จะตอบกลับ'}
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="btn btn-primary text-sm"
        >
          <IconPlus size={15} /> เปิดเรื่องใหม่
        </button>
      </div>

      {toast && (
        <div className={clsx(
          'mb-4 px-3 py-2 rounded-md border text-xs flex items-center justify-between',
          toast.ok
            ? 'bg-green-50 border-green-200 text-green-700'
            : 'bg-red-50 border-red-200 text-red-700'
        )}>
          <span>{toast.text}</span>
          <button onClick={() => setToast(null)} className="opacity-70 hover:opacity-100">ปิด</button>
        </div>
      )}

      {/* View tabs — only staff need the toggle; employees see only "mine" implicitly. */}
      {isStaff && (
        <div className="flex border-b border-black/[0.08] mb-4">
          {([
            ['all', 'ทั้งหมด'],
            ['mine', 'ของฉัน'],
          ] as const).map(([k, label]) => {
            const active = view === k
            return (
              <button
                key={k}
                onClick={() => setView(k)}
                className={clsx(
                  'flex items-center gap-1.5 px-4 py-2 text-sm border-b-2 -mb-px transition-colors',
                  active
                    ? 'border-[#1D9E75] text-[#111110] font-medium'
                    : 'border-transparent text-gray-500 hover:text-gray-800'
                )}
              >
                {label}
                {k === 'all' && pendingCount > 0 && (
                  <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-semibold leading-none">
                    {pendingCount}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Filter chips */}
      <div className="card mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-gray-500">สถานะ:</span>
          {(['all', 'open', 'answered', 'closed'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={clsx(
                'text-[11px] px-2.5 py-1 rounded-full border transition-colors',
                statusFilter === s
                  ? 'bg-[#111110] text-white border-[#111110]'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
              )}
            >
              {s === 'all' ? 'ทั้งหมด' : STATUS_TH[s]}
            </button>
          ))}
          <span className="text-[11px] text-gray-500 ml-3">หมวด:</span>
          <button
            onClick={() => setCategoryFilter('all')}
            className={clsx(
              'text-[11px] px-2.5 py-1 rounded-full border transition-colors',
              categoryFilter === 'all'
                ? 'bg-[#111110] text-white border-[#111110]'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
            )}
          >
            ทั้งหมด
          </button>
          {CATEGORIES.map(c => (
            <button
              key={c.value}
              onClick={() => setCategoryFilter(c.value)}
              className={clsx(
                'text-[11px] px-2.5 py-1 rounded-full border transition-colors',
                categoryFilter === c.value
                  ? 'bg-[#111110] text-white border-[#111110]'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="card text-sm text-gray-500">กำลังโหลด…</div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-10">
          <IconLifebuoy size={32} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-600">ไม่มีเรื่องในรายการ</p>
          <button
            onClick={() => setShowForm(true)}
            className="mt-3 text-xs text-[#1D9E75] hover:underline"
          >
            เปิดเรื่องใหม่ →
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(t => {
            const cat = CAT_BY_VALUE[t.category]
            const requesterName =
              [t.requester_first_name, t.requester_last_name].filter(Boolean).join(' ') ||
              t.requester_email || 'พนักงาน'
            return (
              <button
                key={t.id}
                onClick={() => setOpenTicket(t)}
                className="w-full card text-left hover:border-[#1D9E75]/40 transition-all"
              >
                <div className="flex items-start gap-3">
                  <div className={clsx('w-9 h-9 rounded-[10px] border flex items-center justify-center flex-shrink-0', cat?.color)}>
                    {cat && <cat.icon size={16} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className="text-sm font-medium text-[#111110] truncate">{t.subject}</span>
                      <span className={clsx('text-[10px] px-1.5 py-0.5 rounded-full border', STATUS_BADGE[t.status])}>
                        {STATUS_TH[t.status]}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500 line-clamp-2">{t.description}</p>
                    <div className="flex items-center gap-2 mt-1.5 text-[10px] text-gray-400 flex-wrap">
                      <EmployeeAvatar
                        person={{
                          first_name: t.requester_first_name || undefined,
                          last_name: t.requester_last_name || undefined,
                          avatar_url: t.requester_avatar_url || undefined,
                        }}
                        size={14}
                      />
                      <span>{requesterName}</span>
                      <span>·</span>
                      <span>{dayjs(t.created_at).format('D MMM HH:mm')}</span>
                      {t.responded_at && (
                        <>
                          <span>·</span>
                          <span className="text-blue-600">ตอบเมื่อ {dayjs(t.responded_at).format('D MMM HH:mm')}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {showForm && (
        <NewTicketModal
          onClose={() => setShowForm(false)}
          onCreated={(id) => {
            setShowForm(false)
            flash('ส่งเรื่องเรียบร้อย — HR จะตอบกลับ')
            load().then(() => {
              // Auto-open the just-created ticket so the user lands
              // on the conversation thread.
              supportApi.getOne(id).then(r => setOpenTicket(r.data.data)).catch(() => {})
            })
          }}
          flash={flash}
        />
      )}

      {openTicket && (
        <TicketDetailModal
          ticket={openTicket}
          isStaff={isStaff}
          currentUserId={user?.id}
          onClose={closeDetail}
          onChanged={async () => {
            // Re-fetch the single ticket so the modal shows the latest
            // state, AND refresh the list so badges/counts update.
            try {
              const r = await supportApi.getOne(openTicket.id)
              setOpenTicket(r.data.data)
            } catch {}
            load()
          }}
          flash={flash}
        />
      )}
    </div>
  )
}

// ============================================================
// NEW TICKET MODAL
// ============================================================

function NewTicketModal({
  onClose, onCreated, flash,
}: {
  onClose: () => void
  onCreated: (id: string) => void
  flash: (text: string, ok?: boolean) => void
}) {
  const [category, setCategory] = useState<SupportCategory>('help')
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [attachment, setAttachment] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // Synchronous double-submit guard — setState is async, so two fast
  // Enter presses can both pass the !submitting check before React
  // commits the state. The ref blocks the second one immediately.
  const submittingRef = useRef(false)

  const onPickFile = async (file: File | null) => {
    if (!file) { setAttachment(null); return }
    if (!file.type.startsWith('image/')) {
      flash('แนบได้เฉพาะไฟล์ภาพ', false)
      return
    }
    try {
      const dataUrl = await fileToDataURL(file)
      setAttachment(dataUrl)
    } catch {
      flash('อ่านไฟล์ไม่สำเร็จ', false)
    }
  }

  const canSubmit = subject.trim().length > 0 && description.trim().length > 0 && !submitting

  const submit = async () => {
    if (!canSubmit) return
    if (submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    try {
      const payload: SupportTicketCreate = {
        category, subject: subject.trim(), description: description.trim(),
        attachment: attachment || undefined,
      }
      const r = await supportApi.create(payload)
      onCreated(r.data.data.id)
    } catch (e: any) {
      flash(e?.response?.data?.message || 'ส่งเรื่องไม่สำเร็จ', false)
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full my-8 shadow-xl">
        <div className="px-5 py-4 border-b border-black/[0.06] flex items-center justify-between">
          <h2 className="text-base font-semibold text-[#111110] flex items-center gap-2">
            <IconPlus size={16} className="text-[#1D9E75]" /> เปิดเรื่องใหม่
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <IconX size={18} />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="label">หมวดหมู่</label>
            <select
              className="input"
              value={category}
              onChange={e => setCategory(e.target.value as SupportCategory)}
            >
              {CATEGORIES.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">หัวข้อ *</label>
            <input
              className="input"
              placeholder="สรุปสั้นๆ ว่าเป็นเรื่องอะไร"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              maxLength={200}
            />
          </div>
          <div>
            <label className="label">รายละเอียด *</label>
            <textarea
              className="input min-h-[140px] resize-y"
              placeholder="อธิบายปัญหา/ความต้องการ — ขั้นตอนที่ทำ + ผลที่ได้ + ผลที่คาดหวัง"
              value={description}
              onChange={e => setDescription(e.target.value)}
              maxLength={5000}
            />
            <div className="text-[10px] text-gray-400 text-right mt-0.5">
              {description.length}/5000
            </div>
          </div>
          <div>
            <label className="label flex items-center gap-1">
              <IconPaperclip size={12} /> แนบรูป (ไม่บังคับ)
            </label>
            {attachment ? (
              <div className="flex items-center gap-2">
                <img src={attachment} alt="แนบ" className="h-20 rounded border border-black/[0.06]" />
                <button
                  onClick={() => setAttachment(null)}
                  className="btn text-xs text-red-600"
                >
                  <IconX size={13} /> ลบรูป
                </button>
              </div>
            ) : (
              <input
                type="file"
                accept="image/*"
                onChange={e => onPickFile(e.target.files?.[0] || null)}
                className="text-xs"
              />
            )}
          </div>
        </div>
        <div className="px-5 py-3 border-t border-black/[0.06] flex justify-end gap-2">
          <button onClick={onClose} className="btn text-sm">ยกเลิก</button>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="btn btn-primary text-sm"
          >
            <IconCheck size={15} /> {submitting ? 'กำลังส่ง…' : 'ส่งเรื่อง'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// DETAIL MODAL
// ============================================================

function TicketDetailModal({
  ticket, isStaff, currentUserId, onClose, onChanged, flash,
}: {
  ticket: SupportTicket
  isStaff: boolean
  currentUserId?: string
  onClose: () => void
  onChanged: () => void
  flash: (text: string, ok?: boolean) => void
}) {
  const cat = CAT_BY_VALUE[ticket.category]
  const isOwner = ticket.user_id === currentUserId

  // Compose state for staff reply
  const [response, setResponse] = useState(ticket.hr_response || '')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  useEffect(() => { setResponse(ticket.hr_response || '') }, [ticket.hr_response])

  const requesterName =
    [ticket.requester_first_name, ticket.requester_last_name].filter(Boolean).join(' ') ||
    ticket.requester_email || 'พนักงาน'
  const responderName =
    [ticket.responder_first_name, ticket.responder_last_name].filter(Boolean).join(' ') || 'HR/เจ้าของ'

  const doRespond = async (closeAfter: boolean) => {
    if (!response.trim()) { flash('กรุณากรอกข้อความตอบ', false); return }
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    try {
      await supportApi.respond(ticket.id, response.trim(), closeAfter)
      flash(closeAfter ? 'ตอบและปิดเรื่องแล้ว' : 'ตอบเรื่องแล้ว')
      onChanged()
    } catch (e: any) {
      flash(e?.response?.data?.message || 'ส่งคำตอบไม่สำเร็จ', false)
    } finally { busyRef.current = false; setBusy(false) }
  }

  const doClose = async () => {
    if (busyRef.current) return
    busyRef.current = true; setBusy(true)
    try {
      await supportApi.close(ticket.id)
      flash('ปิดเรื่องแล้ว')
      onChanged()
    } catch (e: any) {
      flash(e?.response?.data?.message || 'ปิดเรื่องไม่สำเร็จ', false)
    } finally { busyRef.current = false; setBusy(false) }
  }
  const doReopen = async () => {
    if (busyRef.current) return
    busyRef.current = true; setBusy(true)
    try {
      await supportApi.reopen(ticket.id)
      flash('เปิดเรื่องใหม่แล้ว')
      onChanged()
    } catch (e: any) {
      flash(e?.response?.data?.message || 'เปิดเรื่องไม่สำเร็จ', false)
    } finally { busyRef.current = false; setBusy(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-3xl w-full my-8 shadow-xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-black/[0.06] flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className={clsx('w-10 h-10 rounded-[10px] border flex items-center justify-center flex-shrink-0', cat?.color)}>
              {cat && <cat.icon size={18} />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h2 className="text-base font-semibold text-[#111110]">{ticket.subject}</h2>
                <span className={clsx('text-[10px] px-1.5 py-0.5 rounded-full border', STATUS_BADGE[ticket.status])}>
                  {STATUS_TH[ticket.status]}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-gray-500 flex-wrap">
                <span>{cat?.label}</span>
                <span>·</span>
                <span>{dayjs(ticket.created_at).format('D MMM YYYY HH:mm')}</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <IconX size={18} />
          </button>
        </div>

        {/* Original message */}
        <div className="px-5 py-4 border-b border-black/[0.06]">
          <div className="flex items-center gap-2 mb-2">
            <EmployeeAvatar
              person={{
                first_name: ticket.requester_first_name || undefined,
                last_name: ticket.requester_last_name || undefined,
                avatar_url: ticket.requester_avatar_url || undefined,
              }}
              size={22}
            />
            <span className="text-sm font-medium text-[#111110]">{requesterName}</span>
            <span className="text-[11px] text-gray-400">เปิดเรื่อง</span>
          </div>
          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{ticket.description}</p>
          {ticket.attachment && (
            <div className="mt-3">
              <a
                href={ticket.attachment}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block"
              >
                <img
                  src={ticket.attachment}
                  alt="แนบ"
                  className="max-h-60 rounded-md border border-black/[0.06] hover:opacity-90"
                />
              </a>
            </div>
          )}
        </div>

        {/* HR response (if any) */}
        {ticket.hr_response && (
          <div className="px-5 py-4 border-b border-black/[0.06] bg-blue-50/30">
            <div className="flex items-center gap-2 mb-2">
              <EmployeeAvatar
                person={{
                  first_name: ticket.responder_first_name || undefined,
                  last_name: ticket.responder_last_name || undefined,
                  avatar_url: ticket.responder_avatar_url || undefined,
                }}
                size={22}
              />
              <span className="text-sm font-medium text-[#111110]">{responderName}</span>
              <span className="text-[11px] text-blue-600">HR ตอบ</span>
              {ticket.responded_at && (
                <span className="text-[11px] text-gray-400 ml-auto">
                  {dayjs(ticket.responded_at).format('D MMM HH:mm')}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{ticket.hr_response}</p>
          </div>
        )}

        {/* Staff reply composer */}
        {isStaff && ticket.status !== 'closed' && (
          <div className="px-5 py-4 border-b border-black/[0.06] bg-amber-50/30">
            <label className="label">
              {ticket.hr_response ? 'แก้คำตอบ / ตอบเพิ่ม' : 'ตอบกลับ'}
            </label>
            <textarea
              className="input min-h-[100px] resize-y text-sm"
              placeholder="ข้อความถึงผู้แจ้ง — ระบบจะแจ้งเตือนผ่าน bell"
              value={response}
              onChange={e => setResponse(e.target.value)}
              maxLength={5000}
            />
            <div className="flex justify-end gap-2 mt-2">
              <button
                onClick={() => doRespond(false)}
                disabled={busy || !response.trim()}
                className="btn text-sm"
              >
                <IconMessage size={14} /> ตอบ
              </button>
              <button
                onClick={() => doRespond(true)}
                disabled={busy || !response.trim()}
                className="btn btn-primary text-sm"
              >
                <IconCheck size={14} /> ตอบ + ปิดเรื่อง
              </button>
            </div>
          </div>
        )}

        {/* Footer actions: close / reopen */}
        <div className="px-5 py-3 flex justify-between items-center gap-2 flex-wrap">
          <div className="text-[11px] text-gray-400">
            {ticket.status === 'closed' && ticket.closed_at && (
              <>ปิดเมื่อ {dayjs(ticket.closed_at).format('D MMM HH:mm')}</>
            )}
          </div>
          <div className="flex gap-2">
            {ticket.status !== 'closed' && (isStaff || isOwner) && (
              <button onClick={doClose} disabled={busy} className="btn text-sm text-gray-600">
                <IconX size={14} /> ปิดเรื่อง
              </button>
            )}
            {ticket.status === 'closed' && (isStaff || isOwner) && (
              <button onClick={doReopen} disabled={busy} className="btn text-sm">
                <IconArrowBackUp size={14} /> เปิดใหม่
              </button>
            )}
            <button onClick={onClose} className="btn text-sm">ปิดหน้าต่าง</button>
          </div>
        </div>
      </div>
    </div>
  )
}
