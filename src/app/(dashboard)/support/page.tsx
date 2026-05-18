'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  supportApi, aiApi,
  type SupportTicket, type SupportCategory, type SupportStatus, type SupportTicketCreate,
  type SupportDraftIntent,
} from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import {
  IconLifebuoy, IconBug, IconHelp, IconSparkles, IconUserQuestion, IconMessage,
  IconPlus, IconX, IconCheck, IconPaperclip, IconArrowBackUp,
  IconClipboardList, IconSearch, IconClock, IconAlertCircle, IconCircleCheck,
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

// Quick-pick intents for the AI draft — they map 1:1 to the keys
// the backend's aiController whitelists. The label is what the HR
// clicks; the actual guidance text lives server-side so the user
// can't smuggle arbitrary instructions through a forged label.
const DRAFT_INTENTS: { key: SupportDraftIntent; label: string }[] = [
  { key: 'fixed',         label: '✅ แก้ไขแล้ว' },
  { key: 'working',       label: '🔧 กำลังตรวจสอบ' },
  { key: 'need_info',     label: '❓ ขอข้อมูลเพิ่ม' },
  { key: 'workaround',    label: '🩹 แนะนำ workaround' },
  { key: 'not_a_bug',     label: '💡 ไม่ใช่บั๊ก' },
  { key: 'feature_noted', label: '📝 รับข้อเสนอแล้ว' },
]
const STATUS_BADGE: Record<SupportStatus, string> = {
  open: 'bg-amber-50 text-amber-700 border-amber-200',
  answered: 'bg-blue-50 text-blue-700 border-blue-200',
  closed: 'bg-gray-100 text-gray-600 border-gray-200',
}

// Compact stat tile used at the top of the list. Optionally
// clickable — when wired, doubles as a toggleable status filter
// (click "รอตอบ" to drill in, click again to clear). active=true
// outlines it in the matching color so the user knows the list is
// scoped.
const STAT_COLORS: Record<string, { bg: string; text: string; border: string; ring: string }> = {
  amber:   { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   ring: 'ring-amber-300' },
  blue:    { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200',    ring: 'ring-blue-300' },
  gray:    { bg: 'bg-gray-50',    text: 'text-gray-700',    border: 'border-gray-200',    ring: 'ring-gray-300' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', ring: 'ring-emerald-300' },
}
function StatCard({
  label, value, icon: Icon, color, active, onClick,
}: {
  label: string
  value: number
  icon: any
  color: keyof typeof STAT_COLORS
  active?: boolean
  onClick?: () => void
}) {
  const c = STAT_COLORS[color]
  const clickable = !!onClick
  const Inner = (
    <div className="flex items-center gap-2.5">
      <div className={clsx('w-8 h-8 rounded-[8px] border flex items-center justify-center flex-shrink-0', c.bg, c.text, c.border)}>
        <Icon size={15} />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] text-gray-500 truncate">{label}</div>
        <div className="text-base font-semibold tabular-nums text-[#111110]">{value}</div>
      </div>
    </div>
  )
  return clickable ? (
    <button
      onClick={onClick}
      className={clsx(
        'card text-left w-full transition-all hover:border-gray-300',
        active && `ring-2 ${c.ring} ring-offset-1`,
      )}
    >{Inner}</button>
  ) : (
    <div className="card">{Inner}</div>
  )
}

// Category filter chip with an inline count. 0-count chips dim out
// so the eye is drawn to the categories that actually have rows,
// but they stay clickable (the count may be 0 only because the
// current status filter excluded the rows).
function CategoryChip({
  label, count, active, onClick,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'text-[11px] px-2.5 py-1 rounded-full border inline-flex items-center gap-1.5 transition-colors',
        active
          ? 'bg-[#111110] text-white border-[#111110]'
          : count === 0
            ? 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'
            : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
      )}
    >
      <span>{label}</span>
      <span className={clsx(
        'text-[10px] tabular-nums',
        active ? 'text-white/70' : 'text-gray-400'
      )}>
        {count}
      </span>
    </button>
  )
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
  // Free-text search across subject + description + requester name.
  // Lightweight client-side filter — the list is capped at 100 rows
  // by the API so we don't need server-side search.
  const [searchQ, setSearchQ] = useState('')

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

  // Apply filters (view + status + category + search) in one pass.
  const filtered = useMemo(() => {
    const q = searchQ.trim().toLowerCase()
    return tickets.filter(t => {
      if (!isStaff || view === 'mine') {
        if (t.user_id !== user?.id) return false
      }
      if (statusFilter !== 'all' && t.status !== statusFilter) return false
      if (categoryFilter !== 'all' && t.category !== categoryFilter) return false
      if (q) {
        const haystack = [
          t.subject, t.description,
          t.requester_first_name, t.requester_last_name,
          t.requester_nickname, t.requester_email,
        ].filter(Boolean).join(' ').toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [tickets, view, statusFilter, categoryFilter, searchQ, isStaff, user?.id])

  // Counts for the tab badges — gives staff at-a-glance "how many need
  // my attention right now." Scoped to the current view (mine vs all)
  // so an employee's "ของฉัน" badge counts their own open tickets only.
  const pendingCount = useMemo(
    () => tickets.filter(t => t.status === 'open').length,
    [tickets]
  )

  // Stat-card numbers. Use the same view scope as the list so they
  // line up with what the user is looking at. "Today" = opened
  // within the current calendar day.
  const stats = useMemo(() => {
    const scope = tickets.filter(t => {
      if (!isStaff || view === 'mine') return t.user_id === user?.id
      return true
    })
    const startOfDay = dayjs().startOf('day')
    return {
      total: scope.length,
      open: scope.filter(t => t.status === 'open').length,
      answered: scope.filter(t => t.status === 'answered').length,
      closed: scope.filter(t => t.status === 'closed').length,
      today: scope.filter(t => dayjs(t.created_at).isAfter(startOfDay)).length,
    }
  }, [tickets, view, isStaff, user?.id])

  // Per-category counts shown as little numbers on each chip — same
  // view scope as the stat cards so totals add up to what the list
  // would show. Counts respect the current status filter too, so
  // toggling "รอตอบ" updates the category chips to show only-open
  // breakdowns (useful when HR wants to know "what kind of opens
  // are sitting in the queue").
  const categoryCounts = useMemo(() => {
    const scope = tickets.filter(t => {
      if (!isStaff || view === 'mine') {
        if (t.user_id !== user?.id) return false
      }
      if (statusFilter !== 'all' && t.status !== statusFilter) return false
      return true
    })
    const out: Record<string, number> = { all: scope.length }
    for (const c of CATEGORIES) out[c.value] = 0
    for (const t of scope) out[t.category] = (out[t.category] || 0) + 1
    return out
  }, [tickets, view, statusFilter, isStaff, user?.id])

  // Did the user actually narrow anything? Used to show "ล้างตัวกรอง"
  // in the empty state when filters return zero rows.
  const hasActiveFilters =
    statusFilter !== 'all' || categoryFilter !== 'all' || searchQ.trim().length > 0
  const clearFilters = () => {
    setStatusFilter('all'); setCategoryFilter('all'); setSearchQ('')
  }

  // Aging — "ค้างมานานแค่ไหน" for OPEN tickets. Closed/answered
  // tickets don't carry a badge because the clock's not running.
  // Returns null when nothing interesting to show.
  const ageBadge = (t: SupportTicket): { text: string; cls: string } | null => {
    if (t.status !== 'open') return null
    const created = dayjs(t.created_at)
    const hours = dayjs().diff(created, 'hour')
    if (hours >= 24) {
      const days = Math.floor(hours / 24)
      return {
        text: days > 0 ? `ค้างมา ${days} วัน` : `ค้างมา ${hours} ชม.`,
        cls: 'bg-red-50 text-red-700 border-red-200',
      }
    }
    if (hours >= 8) {
      return { text: `ค้างมา ${hours} ชม.`, cls: 'bg-amber-50 text-amber-700 border-amber-200' }
    }
    if (dayjs().diff(created, 'minute') < 60) {
      return { text: 'ใหม่', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
    }
    return null
  }

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

      {/* Toast floats over EVERYTHING (z-[70] beats the ticket modal
          at z-50 and the lightbox at z-[60]). Was originally inline
          which made it invisible behind the modal — clicking "ตอบ"
          looked like nothing happened because the success toast was
          rendered under the open dialog. */}
      {toast && (
        <div className={clsx(
          'fixed top-4 right-4 z-[70] max-w-sm px-3 py-2 rounded-md border text-xs flex items-center gap-3 shadow-lg',
          toast.ok
            ? 'bg-green-50 border-green-200 text-green-700'
            : 'bg-red-50 border-red-200 text-red-700'
        )}>
          <span className="flex-1">{toast.text}</span>
          <button onClick={() => setToast(null)} className="opacity-70 hover:opacity-100 flex-shrink-0">ปิด</button>
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

      {/* Stat cards — at-a-glance breakdown of the current view. Each
          tile doubles as a status filter so HR can click "รอตอบ" to
          drill in (mirrors the chip below but more discoverable). */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <StatCard
          label="รอตอบ"
          value={stats.open}
          icon={IconAlertCircle}
          color="amber"
          active={statusFilter === 'open'}
          onClick={() => setStatusFilter(statusFilter === 'open' ? 'all' : 'open')}
        />
        <StatCard
          label="ตอบแล้ว"
          value={stats.answered}
          icon={IconMessage}
          color="blue"
          active={statusFilter === 'answered'}
          onClick={() => setStatusFilter(statusFilter === 'answered' ? 'all' : 'answered')}
        />
        <StatCard
          label="ปิดแล้ว"
          value={stats.closed}
          icon={IconCircleCheck}
          color="gray"
          active={statusFilter === 'closed'}
          onClick={() => setStatusFilter(statusFilter === 'closed' ? 'all' : 'closed')}
        />
        <StatCard
          label="เปิดวันนี้"
          value={stats.today}
          icon={IconClock}
          color="emerald"
        />
      </div>

      {/* Search + category filter in one card. Status filter is gone
          from here — the stat cards above handle that. Active filter
          on the right gets a quick "ล้าง" if anything is set, so the
          user always has a one-click escape hatch. */}
      <div className="card mb-4 space-y-2.5">
        <div className="relative">
          <IconSearch
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          />
          <input
            className="input pl-9 pr-8 text-sm"
            placeholder="ค้นหาในหัวข้อ / รายละเอียด / ชื่อผู้แจ้ง…"
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
          />
          {searchQ && (
            <button
              type="button"
              onClick={() => setSearchQ('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
              title="ล้างคำค้นหา"
            >
              <IconX size={14} />
            </button>
          )}
        </div>

        {/* Category chips with counts. 0-count categories are dimmed
            but still clickable (in case the count is 0 only because
            of the current status scope). Single "ล้าง" appears when
            anything is filtered. */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <CategoryChip
            label="ทั้งหมด"
            count={categoryCounts.all}
            active={categoryFilter === 'all'}
            onClick={() => setCategoryFilter('all')}
          />
          {CATEGORIES.map(c => (
            <CategoryChip
              key={c.value}
              label={c.label}
              count={categoryCounts[c.value] || 0}
              active={categoryFilter === c.value}
              onClick={() => setCategoryFilter(c.value)}
            />
          ))}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="ml-auto text-[11px] text-gray-500 hover:text-red-600 inline-flex items-center gap-1"
              title="ล้างทุกตัวกรอง"
            >
              <IconX size={11} /> ล้างตัวกรอง
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="card text-sm text-gray-500">กำลังโหลด…</div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-10">
          <IconLifebuoy size={32} className="mx-auto text-gray-300 mb-2" />
          {hasActiveFilters ? (
            <>
              <p className="text-sm text-gray-600">ไม่พบเรื่องที่ตรงกับตัวกรอง</p>
              <p className="text-xs text-gray-400 mt-0.5">
                ลองล้างตัวกรองเพื่อดูทั้งหมด
              </p>
              <button
                onClick={clearFilters}
                className="mt-3 text-xs text-[#1D9E75] hover:underline"
              >
                ล้างตัวกรอง →
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-600">ยังไม่มีเรื่องในรายการ</p>
              <button
                onClick={() => setShowForm(true)}
                className="mt-3 text-xs text-[#1D9E75] hover:underline"
              >
                เปิดเรื่องใหม่ →
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(t => {
            const cat = CAT_BY_VALUE[t.category]
            const requesterName =
              [t.requester_first_name, t.requester_last_name].filter(Boolean).join(' ') ||
              t.requester_email || 'พนักงาน'
            const age = ageBadge(t)
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
                      {age && (
                        <span className={clsx(
                          'text-[10px] px-1.5 py-0.5 rounded-full border inline-flex items-center gap-1',
                          age.cls,
                        )}>
                          <IconClock size={9} /> {age.text}
                        </span>
                      )}
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

  // Lightbox for the attached image. We can't use <a target="_blank">
  // because Chrome blocks navigation to `data:` URLs as a security
  // measure (opens a blank tab). An in-page overlay sidesteps the
  // issue entirely and is actually nicer UX — click to dismiss, Esc
  // to close, no tab juggling.
  const [lightbox, setLightbox] = useState<string | null>(null)
  useEffect(() => {
    if (!lightbox) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox])

  // Compose state for staff reply
  const [response, setResponse] = useState(ticket.hr_response || '')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  useEffect(() => { setResponse(ticket.hr_response || '') }, [ticket.hr_response])

  // AI draft state — separate from `busy` so the AI button doesn't
  // disable the send buttons (they share semantics but feel
  // independent to the user). aiDrafted=true triggers the inline
  // "AI ร่าง — โปรดตรวจก่อนส่ง" reminder under the textarea.
  const [aiDrafting, setAiDrafting] = useState(false)
  const [aiDrafted, setAiDrafted] = useState(false)
  // Optional steering for the draft. `intent` = preset key (clicked
  // chip); `intentNote` = free-text override for cases that don't
  // match a preset. Both are forwarded to the backend; either may be
  // empty/null. We deliberately don't auto-clear after a draft —
  // HR may want to tweak the note and re-draft.
  const [intent, setIntent] = useState<SupportDraftIntent | null>(null)
  const [intentNote, setIntentNote] = useState('')
  const askAiToDraft = async () => {
    if (aiDrafting) return
    setAiDrafting(true)
    try {
      const { data } = await aiApi.draftTicketResponse(ticket.id, {
        intent, intentNote: intentNote.trim() || undefined,
      })
      const draft = data?.data?.draft?.trim() || ''
      if (!draft) {
        flash('AI ไม่ได้ส่งคำตอบกลับมา ลองอีกครั้ง', false)
        return
      }
      setResponse(draft)
      setAiDrafted(true)
      flash('AI ร่างคำตอบให้แล้ว — โปรดตรวจก่อนกดส่ง')
    } catch (e: any) {
      // Distinguish axios timeout from server-returned errors so the
      // user knows whether to retry (timeout) or check setup (other).
      // Was just defaulting to "ร่างคำตอบไม่สำเร็จ" which gave no clue.
      const msg = e?.code === 'ECONNABORTED' || /timeout/i.test(e?.message || '')
        ? 'AI ใช้เวลานานเกินไป ลองอีกครั้ง'
        : e?.response?.data?.message
          || (e?.response?.status ? `ร่างคำตอบไม่สำเร็จ (HTTP ${e.response.status})` : null)
          || e?.message
          || 'ร่างคำตอบไม่สำเร็จ'
      flash(msg, false)
      // Surface the underlying error so the user can paste it back
      // if it's something unexpected.
      console.error('[support] AI draft failed:', e)
    } finally {
      setAiDrafting(false)
    }
  }

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
      // "ตอบ + ปิดเรื่อง" is a terminal action — close the modal so
      // HR returns to the list and immediately sees the ticket moved
      // out of the "open" stat card. Plain "ตอบ" keeps the modal
      // open in case they want to send a follow-up.
      if (closeAfter) onClose()
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
      // Same logic as ตอบ+ปิดเรื่อง — closing is terminal, drop
      // the user back to the list with the visible state change.
      onClose()
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
      // Keep the modal open so HR can immediately reply on the
      // re-opened ticket — they almost always re-open in order to
      // add something.
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
              <button
                type="button"
                onClick={() => setLightbox(ticket.attachment)}
                className="inline-block cursor-zoom-in"
                title="คลิกเพื่อดูขนาดเต็ม"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={ticket.attachment}
                  alt="แนบ"
                  className="max-h-60 rounded-md border border-black/[0.06] hover:opacity-90 transition-opacity"
                />
              </button>
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
            <div className="flex items-center justify-between mb-1.5">
              <label className="label !mb-0">
                {ticket.hr_response ? 'แก้คำตอบ / ตอบเพิ่ม' : 'ตอบกลับ'}
              </label>
              {/* AI draft button — top-right of the label row so it
                  doesn't compete with the primary action buttons
                  below. Clicking fills the textarea with a Haiku-
                  generated draft for the HR to review + edit before
                  sending. The user always sends; AI never sends. */}
              <button
                type="button"
                onClick={askAiToDraft}
                disabled={aiDrafting}
                className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border border-[#1D9E75]/30 text-[#0F6E56] bg-white hover:bg-[#E1F5EE] disabled:opacity-50 transition-colors"
                title="ให้ AI ช่วยร่างคำตอบจากเนื้อหา ticket — คุณตรวจก่อนส่งเอง"
              >
                <IconSparkles
                  size={12}
                  className={clsx(aiDrafting && 'animate-spin')}
                />
                {aiDrafting ? 'กำลังร่าง…' : 'ขอ AI ช่วยร่าง'}
              </button>
            </div>
            {aiDrafting && (
              <div className="mb-2 text-[10px] text-gray-400 text-right">
                AI กำลังคิด… ใช้เวลา ~5-10 วินาที (รอสักครู่)
              </div>
            )}

            {/* Intent chips + free-text note — these steer the AI
                draft. Without picking anything the draft is open-
                ended (AI guesses from ticket content); pick a chip
                or type a note to lock in the direction (e.g. "เป็น
                บั๊กที่ทีมแก้แล้ว"). State persists until the modal
                closes, so HR can tweak and re-draft. */}
            <div className="mb-2 flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-gray-400 mr-0.5">ไกด์ AI:</span>
              {DRAFT_INTENTS.map(opt => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setIntent(intent === opt.key ? null : opt.key)}
                  className={clsx(
                    'text-[10px] px-2 py-0.5 rounded-full border transition-colors',
                    intent === opt.key
                      ? 'bg-[#0F6E56] text-white border-[#0F6E56]'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-[#1D9E75]/40'
                  )}
                  title={opt.label}
                >
                  {opt.label}
                </button>
              ))}
              {intent && (
                <button
                  type="button"
                  onClick={() => setIntent(null)}
                  className="text-[10px] text-gray-400 hover:text-red-600 ml-0.5"
                  title="ล้าง"
                >
                  ×
                </button>
              )}
            </div>
            <input
              type="text"
              className="input text-[11px] mb-2 py-1.5"
              placeholder='บอกบริบทเพิ่มให้ AI (ไม่บังคับ) เช่น "deploy แล้วเมื่อ 10 นาทีก่อน"'
              value={intentNote}
              onChange={e => setIntentNote(e.target.value)}
              maxLength={500}
            />

            <textarea
              className="input min-h-[100px] resize-y text-sm"
              placeholder="ข้อความถึงผู้แจ้ง — ระบบจะแจ้งเตือนผ่าน bell"
              value={response}
              onChange={e => { setResponse(e.target.value); setAiDrafted(false) }}
              maxLength={5000}
            />
            {aiDrafted && (
              <div className="mt-1.5 text-[11px] text-[#0F6E56] flex items-center gap-1">
                <IconSparkles size={11} />
                AI ร่างให้ — โปรดตรวจ + แก้ตามต้องการก่อนกดส่ง
              </div>
            )}
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

      {/* Image lightbox. Rendered at the end so it sits above the
          ticket modal (which already uses z-50; the lightbox uses
          z-[60] to win). Click anywhere — including the image — to
          dismiss. Esc also works via the keydown listener above. */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-4 cursor-zoom-out"
        >
          <button
            onClick={(e) => { e.stopPropagation(); setLightbox(null) }}
            className="absolute top-4 right-4 text-white/80 hover:text-white"
            aria-label="ปิด"
          >
            <IconX size={28} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt="รูปแนบขนาดเต็ม"
            className="max-w-full max-h-full rounded shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}
