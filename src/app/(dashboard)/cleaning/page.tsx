'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  cleaningApi, employeeApi,
  type CleaningItem, type CleaningSettings, type CleaningQueueRow,
  type CleaningSession, type CleaningSessionListRow, type CleaningInspectItem,
} from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import {
  IconSparkles, IconPlus, IconTrash, IconCheck, IconX,
  IconClipboardList, IconHistory, IconSettings, IconUser,
  IconArrowUp, IconArrowDown, IconEdit, IconAlertCircle,
} from '@tabler/icons-react'
import dayjs from 'dayjs'
import clsx from 'clsx'
import EmployeeAvatar from '@/components/employees/EmployeeAvatar'

// Mon-first matches Thai work-week and existing /shifts.
const WEEK_DAYS: { num: number; label: string; short: string }[] = [
  { num: 1, label: 'จันทร์', short: 'จ' },
  { num: 2, label: 'อังคาร', short: 'อ' },
  { num: 3, label: 'พุธ',    short: 'พ' },
  { num: 4, label: 'พฤหัสบดี', short: 'พฤ' },
  { num: 5, label: 'ศุกร์',  short: 'ศ' },
  { num: 6, label: 'เสาร์',  short: 'ส' },
  { num: 0, label: 'อาทิตย์', short: 'อา' },
]

const STATUS_BADGE: Record<string, string> = {
  open: 'badge-gray',
  inspector_reviewed: 'badge-amber',
  approved: 'badge-green',
  rejected: 'badge-red',
}
const STATUS_TH: Record<string, string> = {
  open: 'รอกรอกข้อมูล',
  inspector_reviewed: 'รออนุมัติ',
  approved: 'อนุมัติแล้ว',
  rejected: 'ตีกลับ',
}

type Tab = 'today' | 'history' | 'settings'

export default function CleaningPage() {
  const { user } = useAuthStore()
  const isHR = user?.role === 'hr' || user?.role === 'owner'
  const router = useRouter()
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<Tab>('today')

  // Page-level toast (auto-dismiss via ref-tracked timer).
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])
  const flash = (text: string, ok = true) => {
    setToast({ text, ok })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => { setToast(null); toastTimer.current = null }, 4000)
  }

  // Deep-link support: ?session=:id (used by bell notifications). When
  // present we land on the History tab and open the detail modal so HR
  // can approve/reject a backlog session without hunting for it.
  const [openSessionId, setOpenSessionId] = useState<string | null>(null)
  useEffect(() => {
    const sid = searchParams?.get('session')
    if (sid) { setOpenSessionId(sid); setTab('history') }
  }, [searchParams])
  const closeDetail = () => {
    setOpenSessionId(null)
    // Strip the ?session= so a refresh doesn't re-open and the URL stays clean.
    if (searchParams?.get('session')) router.replace('/cleaning')
  }

  // Pending-approval count powers a small amber badge next to the
  // "ประวัติ" tab label. Lightweight — same listSessions endpoint, single
  // pass, refreshed when a child indicates state may have changed.
  const [pendingCount, setPendingCount] = useState(0)
  const refreshPending = useCallback(async () => {
    if (!isHR) return
    try {
      const r = await cleaningApi.listSessions({ limit: 50 })
      const n = (r.data.data || []).filter((x: CleaningSessionListRow) => x.status === 'inspector_reviewed').length
      setPendingCount(n)
    } catch {}
  }, [isHR])
  useEffect(() => { refreshPending() }, [refreshPending])

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#111110] flex items-center gap-2">
            <IconSparkles size={18} className="text-[#1D9E75]" />
            ตารางทำความสะอาด
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">ทุกคนช่วยกัน ผู้ตรวจกรอกชื่อคนทำหลังตรวจเสร็จ</p>
        </div>
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

      <div className="flex border-b border-black/[0.08] mb-5">
        {([
          ['today', 'วันนี้', IconClipboardList],
          ['history', 'ประวัติ', IconHistory],
          ...(isHR ? [['settings', 'ตั้งค่า', IconSettings] as const] : []),
        ] as const).map(([k, label, Icon]) => {
          const active = tab === k
          return (
            <button
              key={k}
              onClick={() => setTab(k as Tab)}
              className={clsx(
                'flex items-center gap-1.5 px-4 py-2 text-sm border-b-2 -mb-px transition-colors',
                active
                  ? 'border-[#1D9E75] text-[#111110] font-medium'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              )}
            >
              <Icon size={14} /> {label}
              {k === 'history' && isHR && pendingCount > 0 && (
                <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-semibold leading-none">
                  {pendingCount}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {tab === 'today' && <TodayTab flash={flash} isHR={isHR} onChanged={refreshPending} />}
      {tab === 'history' && <HistoryTab flash={flash} isHR={isHR} onOpenDetail={setOpenSessionId} />}
      {tab === 'settings' && isHR && <SettingsTab flash={flash} />}

      {openSessionId && (
        <SessionDetailModal
          sessionId={openSessionId}
          isHR={isHR}
          onClose={closeDetail}
          onChanged={refreshPending}
          flash={flash}
        />
      )}
    </div>
  )
}

// ============================================================
// TODAY
// ============================================================

function TodayTab({ flash, isHR, onChanged }: { flash: (text: string, ok?: boolean) => void; isHR: boolean; onChanged?: () => void }) {
  const { user } = useAuthStore()
  const [session, setSession] = useState<CleaningSession | null>(null)
  const [emptyMsg, setEmptyMsg] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  // Inspector form state — keyed by session_item.id
  const [formItems, setFormItems] = useState<Record<string, { doneBy: string; note: string }>>({})
  const [overallNote, setOverallNote] = useState('')
  const [hrNote, setHrNote] = useState('')
  const [employees, setEmployees] = useState<any[]>([])
  const [showReassign, setShowReassign] = useState(false)
  const [reassignTo, setReassignTo] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const r = await cleaningApi.today()
      const data = r.data.data as CleaningSession | null
      setSession(data)
      setEmptyMsg(r.data.message || '')
      if (data) {
        // Pre-fill the form with existing values (handy if inspector
        // already submitted once and HR rejected — they can edit and re-send).
        const next: typeof formItems = {}
        for (const it of data.items) {
          next[it.id] = {
            doneBy: it.done_by_employee_id || '',
            note: it.inspector_note || '',
          }
        }
        setFormItems(next)
        setOverallNote(data.inspector_notes || '')
      }
    } catch (e: any) {
      flash(e?.response?.data?.message || 'โหลดข้อมูลไม่สำเร็จ', false)
    } finally { setLoading(false) }
  }

  const loadEmployees = async () => {
    try {
      const r = await employeeApi.list()
      setEmployees(r.data.data || [])
    } catch {}
  }

  useEffect(() => { load(); loadEmployees() }, [])

  // Map req.user → employees.id so we can identify "am I the inspector?"
  const myEmpId = useMemo(() => {
    const me = employees.find(e => e.user_id === user?.id)
    return me?.id as string | undefined
  }, [employees, user])

  const isInspector = !!session && !!myEmpId && session.inspector_id === myEmpId
  const canFillForm = isInspector && !!session && (session.status === 'open' || session.status === 'rejected')
  const canSubmit = isInspector && !!session && (session.status === 'open' || session.status === 'rejected' || session.status === 'inspector_reviewed')
  const canApprove = isHR && !!session && session.status === 'inspector_reviewed'

  const submitInspection = async () => {
    if (!session) return
    setBusy(true)
    try {
      const items: CleaningInspectItem[] = session.items.map(it => ({
        itemId: it.id,
        doneByEmployeeId: formItems[it.id]?.doneBy || null,
        note: formItems[it.id]?.note || null,
      }))
      await cleaningApi.inspect(session.id, items, overallNote || undefined)
      flash('ส่งรายงานแล้ว รอ HR/เจ้าของอนุมัติ')
      await load()
      onChanged?.()
    } catch (e: any) {
      flash(e?.response?.data?.message || 'ส่งรายงานไม่สำเร็จ', false)
    } finally { setBusy(false) }
  }

  const approve = async () => {
    if (!session) return
    setBusy(true)
    try {
      await cleaningApi.approve(session.id, hrNote || undefined)
      flash('อนุมัติเรียบร้อย')
      setHrNote('')
      await load()
      onChanged?.()
    } catch (e: any) {
      flash(e?.response?.data?.message || 'อนุมัติไม่สำเร็จ', false)
    } finally { setBusy(false) }
  }

  const reject = async () => {
    if (!session) return
    if (!hrNote.trim()) { flash('กรุณาใส่เหตุผลที่ตีกลับ', false); return }
    setBusy(true)
    try {
      await cleaningApi.reject(session.id, hrNote)
      flash('ตีกลับเรียบร้อย')
      setHrNote('')
      await load()
      onChanged?.()
    } catch (e: any) {
      flash(e?.response?.data?.message || 'ตีกลับไม่สำเร็จ', false)
    } finally { setBusy(false) }
  }

  const doReassign = async () => {
    if (!session || !reassignTo) return
    setBusy(true)
    try {
      await cleaningApi.reassignInspector(session.id, reassignTo)
      flash('เปลี่ยนผู้ตรวจแล้ว')
      setShowReassign(false)
      setReassignTo('')
      await load()
    } catch (e: any) {
      flash(e?.response?.data?.message || 'เปลี่ยนผู้ตรวจไม่สำเร็จ', false)
    } finally { setBusy(false) }
  }

  if (loading) return <div className="card text-sm text-gray-500">กำลังโหลด…</div>

  if (!session) {
    return (
      <div className="card text-center py-10">
        <IconSparkles size={32} className="mx-auto text-gray-300 mb-2" />
        <p className="text-sm text-gray-600">{emptyMsg || 'วันนี้ไม่มีรอบทำความสะอาด'}</p>
        {isHR && (
          <p className="text-xs text-gray-500 mt-2">
            ตั้งค่ารายการงาน + วันในสัปดาห์ได้ที่แท็บ <strong>ตั้งค่า</strong>
          </p>
        )}
      </div>
    )
  }

  const inspectorName =
    [session.inspector_first_name, session.inspector_last_name].filter(Boolean).join(' ') || 'ยังไม่กำหนด'
  const dateLabel = dayjs(session.session_date).format('dddd ที่ D MMMM YYYY')

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-lg font-semibold text-[#111110]">{dateLabel}</h2>
              <span className={clsx('badge', STATUS_BADGE[session.status])}>
                {STATUS_TH[session.status]}
              </span>
            </div>
            <p className="text-sm text-gray-600">
              ช่วงเวลา <span className="font-medium">{session.start_time?.slice(0,5)}–{session.end_time?.slice(0,5)}</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-gray-500 mb-1">ผู้ตรวจ</p>
            <div className="flex items-center gap-2 justify-end">
              {session.inspector_id ? (
                <>
                  <EmployeeAvatar
                    person={{
                      first_name: session.inspector_first_name || undefined,
                      last_name: session.inspector_last_name || undefined,
                      avatar_url: session.inspector_avatar_url || undefined,
                    }}
                    size={28}
                  />
                  <span className="text-sm font-medium">{inspectorName}</span>
                </>
              ) : (
                <span className="text-sm text-gray-500 italic">ยังไม่กำหนด</span>
              )}
            </div>
            {isHR && session.status !== 'approved' && (
              <button
                onClick={() => setShowReassign(s => !s)}
                className="text-[11px] text-[#1D9E75] hover:underline mt-1"
              >
                เปลี่ยนผู้ตรวจ
              </button>
            )}
          </div>
        </div>

        {showReassign && (
          <div className="mt-3 p-3 rounded-md bg-gray-50 border border-black/[0.06] flex gap-2 items-center">
            <select
              className="input flex-1"
              value={reassignTo}
              onChange={e => setReassignTo(e.target.value)}
            >
              <option value="">— เลือกพนักงาน —</option>
              {employees.filter(e => e.is_active).map(e => (
                <option key={e.id} value={e.id}>
                  {e.first_name} {e.last_name}
                </option>
              ))}
            </select>
            <button onClick={doReassign} disabled={!reassignTo || busy} className="btn btn-primary text-xs">บันทึก</button>
            <button onClick={() => { setShowReassign(false); setReassignTo('') }} className="btn text-xs">ยกเลิก</button>
          </div>
        )}

        {!canFillForm && session.status === 'open' && (
          <div className="mt-3 p-3 rounded-md bg-blue-50 border border-blue-200 text-xs text-blue-800">
            ตกลงกันเองได้เลยว่าใครทำงานไหน <strong>ผู้ตรวจจะกรอกชื่อให้ทุกคนตอนตรวจเสร็จ</strong>
          </div>
        )}
        {session.status === 'rejected' && (
          <div className="mt-3 p-3 rounded-md bg-red-50 border border-red-200 text-xs text-red-800 flex items-start gap-2">
            <IconAlertCircle size={14} className="flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">รอบนี้ถูกตีกลับ</p>
              {session.hr_notes && <p className="mt-0.5">เหตุผล: {session.hr_notes}</p>}
              {isInspector && <p className="mt-1">กรุณาแก้ไขข้อมูลและส่งใหม่</p>}
            </div>
          </div>
        )}
      </div>

      {/* Items */}
      <div className="card">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
          <IconClipboardList size={14} /> รายการงานวันนี้
          <span className="text-xs text-gray-500 font-normal">({session.items.length} รายการ)</span>
        </h3>

        <div className="space-y-2">
          {session.items.map((it, idx) => {
            const filled = formItems[it.id]
            const showForm = canFillForm
            return (
              <div key={it.id} className="border border-black/[0.06] rounded-md p-3">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-start gap-2">
                    <span className="text-xs text-gray-400 font-medium mt-0.5">{idx + 1}.</span>
                    <span className="text-sm font-medium text-[#111110]">{it.item_name}</span>
                  </div>
                </div>

                {showForm ? (
                  <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 ml-6">
                    <select
                      className="input col-span-2 text-xs"
                      value={filled?.doneBy || ''}
                      onChange={e => setFormItems(p => ({ ...p, [it.id]: { ...p[it.id], doneBy: e.target.value, note: p[it.id]?.note || '' } }))}
                    >
                      <option value="">— คนทำ —</option>
                      {employees.filter(e => e.is_active).map(e => (
                        <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>
                      ))}
                    </select>
                    <input
                      className="input col-span-3 text-xs"
                      placeholder="หมายเหตุ (ไม่บังคับ)"
                      value={filled?.note || ''}
                      onChange={e => setFormItems(p => ({ ...p, [it.id]: { ...p[it.id], note: e.target.value, doneBy: p[it.id]?.doneBy || '' } }))}
                    />
                  </div>
                ) : (
                  <div className="ml-6 text-xs text-gray-600 flex items-center gap-2 flex-wrap">
                    {it.done_by_employee_id ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-50 text-green-800 border border-green-200">
                        <EmployeeAvatar
                          person={{
                            first_name: it.done_by_first_name || undefined,
                            last_name: it.done_by_last_name || undefined,
                            avatar_url: it.done_by_avatar_url || undefined,
                          }}
                          size={16}
                        />
                        {it.done_by_first_name} {it.done_by_last_name}
                      </span>
                    ) : (
                      <span className="text-gray-400 italic">— ยังไม่กรอก —</span>
                    )}
                    {it.inspector_note && <span className="text-gray-500">· {it.inspector_note}</span>}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {canSubmit && (
          <div className="mt-4 pt-4 border-t border-black/[0.06]">
            <label className="label">หมายเหตุภาพรวม (ไม่บังคับ)</label>
            <textarea
              className="input min-h-[60px] resize-y text-sm"
              placeholder="เช่น พบขยะตกค้างใต้โต๊ะ B"
              value={overallNote}
              onChange={e => setOverallNote(e.target.value)}
            />
            <div className="flex justify-end mt-3">
              <button onClick={submitInspection} disabled={busy} className="btn btn-primary text-sm">
                <IconCheck size={15} /> ตรวจเสร็จ → ส่งให้ HR อนุมัติ
              </button>
            </div>
          </div>
        )}
      </div>

      {/* HR approval bar */}
      {canApprove && (
        <div className="card border-amber-200 bg-amber-50/30">
          <h3 className="text-sm font-semibold mb-2">อนุมัติรอบนี้</h3>
          <p className="text-xs text-gray-600 mb-3">
            ผู้ตรวจส่งรายงานแล้วเมื่อ {session.inspector_completed_at ? dayjs(session.inspector_completed_at).format('D MMM HH:mm') : '-'}
            {session.inspector_notes && <> · หมายเหตุผู้ตรวจ: "{session.inspector_notes}"</>}
          </p>
          <textarea
            className="input min-h-[50px] resize-y text-sm"
            placeholder="หมายเหตุ HR (ถ้าตีกลับต้องระบุเหตุผล)"
            value={hrNote}
            onChange={e => setHrNote(e.target.value)}
          />
          <div className="flex justify-end gap-2 mt-3">
            <button onClick={reject} disabled={busy} className="btn text-sm text-red-600">
              <IconX size={15} /> ตีกลับ
            </button>
            <button onClick={approve} disabled={busy} className="btn btn-primary text-sm">
              <IconCheck size={15} /> อนุมัติ
            </button>
          </div>
        </div>
      )}

      {/* Approved info */}
      {session.status === 'approved' && (
        <div className="card border-green-200 bg-green-50/30 text-sm text-green-800">
          <p className="font-medium">
            <IconCheck size={14} className="inline" /> อนุมัติเรียบร้อยโดย {session.approver_first_name} {session.approver_last_name}
            {session.approved_at && <> · {dayjs(session.approved_at).format('D MMM HH:mm')}</>}
          </p>
          {session.hr_notes && <p className="text-xs mt-1">หมายเหตุ: {session.hr_notes}</p>}
        </div>
      )}
    </div>
  )
}

// ============================================================
// HISTORY
// ============================================================

function HistoryTab({ flash, isHR, onOpenDetail }: {
  flash: (text: string, ok?: boolean) => void
  isHR: boolean
  onOpenDetail: (sessionId: string) => void
}) {
  const [rows, setRows] = useState<CleaningSessionListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'pending'>('all')

  useEffect(() => {
    (async () => {
      setLoading(true)
      try {
        const r = await cleaningApi.listSessions({ limit: 50 })
        setRows(r.data.data || [])
      } catch (e: any) {
        flash(e?.response?.data?.message || 'โหลดประวัติไม่สำเร็จ', false)
      } finally { setLoading(false) }
    })()
  }, [])

  const filtered = useMemo(() =>
    filter === 'pending' ? rows.filter(r => r.status === 'inspector_reviewed') : rows,
  [rows, filter])
  const pendingCount = useMemo(() => rows.filter(r => r.status === 'inspector_reviewed').length, [rows])

  if (loading) return <div className="card text-sm text-gray-500">กำลังโหลด…</div>

  return (
    <div className="space-y-3">
      {isHR && (
        <div className="flex items-center gap-2 flex-wrap">
          {([['all', 'ทั้งหมด', rows.length], ['pending', 'รออนุมัติ', pendingCount]] as const).map(([k, label, n]) => {
            const active = filter === k
            return (
              <button
                key={k}
                onClick={() => setFilter(k as 'all' | 'pending')}
                className={clsx(
                  'text-[12px] px-3 py-1.5 rounded-full border transition-colors flex items-center gap-1.5',
                  active
                    ? 'bg-[#111110] text-white border-[#111110]'
                    : 'bg-white text-gray-600 border-black/[0.08] hover:bg-gray-50'
                )}
              >
                {label}
                <span className={clsx(
                  'px-1.5 py-0.5 rounded-full text-[10px] font-semibold leading-none',
                  active ? 'bg-white/20 text-white' : k === 'pending' && n > 0 ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'
                )}>
                  {n}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="card text-sm text-gray-500 text-center py-8">
          {filter === 'pending' ? 'ไม่มีรอบที่รออนุมัติ' : 'ยังไม่มีประวัติ'}
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-black/[0.06] text-[11px] text-gray-500 uppercase">
                <th className="text-left px-3 py-2.5">วันที่</th>
                <th className="text-left px-3 py-2.5">เวลา</th>
                <th className="text-left px-3 py-2.5">ผู้ตรวจ</th>
                <th className="text-left px-3 py-2.5">รายการ</th>
                <th className="text-left px-3 py-2.5">สถานะ</th>
                <th className="text-left px-3 py-2.5">อนุมัติเมื่อ</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr
                  key={r.id}
                  onClick={() => onOpenDetail(r.id)}
                  className="border-b border-black/[0.04] hover:bg-gray-50 cursor-pointer"
                >
                  <td className="px-3 py-2.5">{dayjs(r.session_date).format('D MMM YY')}</td>
                  <td className="px-3 py-2.5 text-gray-600">{r.start_time?.slice(0,5)}–{r.end_time?.slice(0,5)}</td>
                  <td className="px-3 py-2.5">
                    {r.inspector_id ? (
                      <div className="flex items-center gap-1.5">
                        <EmployeeAvatar
                          person={{
                            first_name: r.inspector_first_name || undefined,
                            last_name: r.inspector_last_name || undefined,
                            avatar_url: r.inspector_avatar_url || undefined,
                          }}
                          size={20}
                        />
                        <span>{r.inspector_first_name} {r.inspector_last_name}</span>
                      </div>
                    ) : <span className="text-gray-400">-</span>}
                  </td>
                  <td className="px-3 py-2.5 text-gray-600">{r.filled_count}/{r.item_count}</td>
                  <td className="px-3 py-2.5">
                    <span className={clsx('badge', STATUS_BADGE[r.status])}>{STATUS_TH[r.status]}</span>
                  </td>
                  <td className="px-3 py-2.5 text-gray-500 text-xs">
                    {r.approved_at ? dayjs(r.approved_at).format('D MMM HH:mm') : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ============================================================
// SETTINGS (HR/owner)
// ============================================================

function SettingsTab({ flash }: { flash: (text: string, ok?: boolean) => void }) {
  return (
    <div className="space-y-5">
      <ItemsSection flash={flash} />
      <ScheduleSection flash={flash} />
      <InspectorQueueSection flash={flash} />
    </div>
  )
}

function ItemsSection({ flash }: { flash: (text: string, ok?: boolean) => void }) {
  const [items, setItems] = useState<CleaningItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', description: '' })
  const [editingId, setEditingId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const r = await cleaningApi.listItems(true)
      setItems(r.data.data || [])
    } catch (e: any) {
      flash(e?.response?.data?.message || 'โหลดรายการไม่สำเร็จ', false)
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const submit = async () => {
    if (!form.name.trim()) { flash('กรุณาระบุชื่องาน', false); return }
    try {
      if (editingId) {
        await cleaningApi.updateItem(editingId, { name: form.name, description: form.description || null })
        flash('แก้ไขแล้ว')
      } else {
        await cleaningApi.createItem({ name: form.name, description: form.description || null })
        flash('เพิ่มแล้ว')
      }
      setShowForm(false); setEditingId(null); setForm({ name: '', description: '' })
      load()
    } catch (e: any) {
      flash(e?.response?.data?.message || 'บันทึกไม่สำเร็จ', false)
    }
  }

  const toggle = async (it: CleaningItem) => {
    try {
      await cleaningApi.updateItem(it.id, { isActive: !it.is_active })
      load()
    } catch (e: any) { flash(e?.response?.data?.message || 'เปลี่ยนสถานะไม่สำเร็จ', false) }
  }

  const del = async (it: CleaningItem) => {
    if (!confirm(`ลบ "${it.name}"? ประวัติรอบเก่ายังคงอยู่`)) return
    try {
      await cleaningApi.deleteItem(it.id)
      flash('ลบแล้ว')
      load()
    } catch (e: any) { flash(e?.response?.data?.message || 'ลบไม่สำเร็จ', false) }
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <IconClipboardList size={14} /> รายการงานทำความสะอาด
        </h3>
        <button
          onClick={() => { setShowForm(true); setEditingId(null); setForm({ name: '', description: '' }) }}
          className="btn btn-primary text-xs"
        >
          <IconPlus size={13} /> เพิ่ม
        </button>
      </div>

      {showForm && (
        <div className="mb-3 p-3 rounded-md bg-gray-50 border border-black/[0.06]">
          <input
            className="input mb-2 text-sm"
            placeholder="ชื่องาน เช่น เช็ดโต๊ะ"
            value={form.name}
            onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
          />
          <input
            className="input mb-3 text-sm"
            placeholder="คำอธิบายเพิ่มเติม (ไม่บังคับ)"
            value={form.description}
            onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
          />
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setShowForm(false); setEditingId(null) }} className="btn text-xs">ยกเลิก</button>
            <button onClick={submit} className="btn btn-primary text-xs">
              {editingId ? 'บันทึก' : 'เพิ่ม'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-gray-500">กำลังโหลด…</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-gray-500 text-center py-4">ยังไม่มีรายการ — เพิ่มงานแรกได้เลย</p>
      ) : (
        <div className="space-y-1.5">
          {items.map(it => (
            <div key={it.id} className={clsx(
              'flex items-center justify-between gap-2 px-3 py-2 rounded-md border',
              it.is_active ? 'border-black/[0.06] bg-white' : 'border-black/[0.04] bg-gray-50 opacity-60'
            )}>
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#111110] truncate">{it.name}</p>
                {it.description && <p className="text-xs text-gray-500 truncate">{it.description}</p>}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => toggle(it)}
                  className="text-[11px] px-2 py-1 rounded border border-black/[0.08] hover:bg-gray-50"
                  title={it.is_active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                >
                  {it.is_active ? 'ปิด' : 'เปิด'}
                </button>
                <button
                  onClick={() => { setEditingId(it.id); setForm({ name: it.name, description: it.description || '' }); setShowForm(true) }}
                  className="p-1.5 rounded hover:bg-gray-100"
                  title="แก้ไข"
                >
                  <IconEdit size={14} className="text-gray-500" />
                </button>
                <button
                  onClick={() => del(it)}
                  className="p-1.5 rounded hover:bg-red-50"
                  title="ลบ"
                >
                  <IconTrash size={14} className="text-red-500" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ScheduleSection({ flash }: { flash: (text: string, ok?: boolean) => void }) {
  const [s, setS] = useState<CleaningSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const r = await cleaningApi.getSettings()
      setS(r.data.data)
    } catch (e: any) {
      flash(e?.response?.data?.message || 'โหลด schedule ไม่สำเร็จ', false)
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const toggleDay = (d: number) => {
    setS(prev => {
      if (!prev) return prev
      const has = prev.weekdays.includes(d)
      const next = has ? prev.weekdays.filter(x => x !== d) : [...prev.weekdays, d]
      return { ...prev, weekdays: next.sort() }
    })
  }
  const save = async () => {
    if (!s) return
    setSaving(true)
    try {
      await cleaningApi.updateSettings({
        weekdays: s.weekdays,
        startTime: s.start_time?.slice(0, 5),
        endTime: s.end_time?.slice(0, 5),
        isActive: s.is_active,
      })
      flash('บันทึก schedule แล้ว')
    } catch (e: any) {
      flash(e?.response?.data?.message || 'บันทึกไม่สำเร็จ', false)
    } finally { setSaving(false) }
  }

  if (loading || !s) return <div className="card text-xs text-gray-500">กำลังโหลด…</div>

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <IconSettings size={14} /> วันและเวลา
        </h3>
        <label className="flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={s.is_active}
            onChange={e => setS(p => p ? { ...p, is_active: e.target.checked } : p)}
          />
          เปิดใช้งาน
        </label>
      </div>
      <label className="label">วันในสัปดาห์</label>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {WEEK_DAYS.map(d => {
          const on = s.weekdays.includes(d.num)
          return (
            <button
              key={d.num}
              type="button"
              onClick={() => toggleDay(d.num)}
              className={clsx(
                'px-3 py-1.5 rounded-md border text-xs font-medium',
                on
                  ? 'bg-[#1D9E75] text-white border-[#1D9E75]'
                  : 'bg-white text-gray-600 border-black/[0.08] hover:bg-gray-50'
              )}
            >
              {d.label}
            </button>
          )
        })}
      </div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="label">เริ่ม</label>
          <input
            type="time"
            className="input text-sm"
            value={s.start_time?.slice(0, 5)}
            onChange={e => setS(p => p ? { ...p, start_time: e.target.value + ':00' } : p)}
          />
        </div>
        <div>
          <label className="label">สิ้นสุด</label>
          <input
            type="time"
            className="input text-sm"
            value={s.end_time?.slice(0, 5)}
            onChange={e => setS(p => p ? { ...p, end_time: e.target.value + ':00' } : p)}
          />
        </div>
      </div>
      <div className="flex justify-end">
        <button onClick={save} disabled={saving} className="btn btn-primary text-sm">
          {saving ? 'กำลังบันทึก…' : 'บันทึก'}
        </button>
      </div>
    </div>
  )
}

function InspectorQueueSection({ flash }: { flash: (text: string, ok?: boolean) => void }) {
  const [queue, setQueue] = useState<CleaningQueueRow[]>([])
  const [nextPos, setNextPos] = useState(0)
  const [employees, setEmployees] = useState<any[]>([])
  const [pickerId, setPickerId] = useState('')
  const [saving, setSaving] = useState(false)

  const load = async () => {
    try {
      const [qRes, eRes] = await Promise.all([cleaningApi.getQueue(), employeeApi.list()])
      setQueue(qRes.data.data.queue || [])
      setNextPos(qRes.data.data.nextPosition || 0)
      setEmployees(eRes.data.data || [])
    } catch (e: any) {
      flash(e?.response?.data?.message || 'โหลดคิวไม่สำเร็จ', false)
    }
  }
  useEffect(() => { load() }, [])

  const inQueueIds = useMemo(() => new Set(queue.map(q => q.employee_id)), [queue])
  const candidates = employees.filter(e => e.is_active && !inQueueIds.has(e.id))

  const add = () => {
    if (!pickerId) return
    const emp = employees.find(e => e.id === pickerId)
    if (!emp) return
    setQueue(prev => [...prev, {
      id: 'tmp-' + emp.id,
      employee_id: emp.id,
      position: prev.length,
      is_active: true,
      first_name: emp.first_name,
      last_name: emp.last_name,
      nickname: emp.nickname,
      avatar_url: emp.avatar_url,
      emp_code: emp.employee_id,
      employee_active: true,
    }])
    setPickerId('')
  }
  const remove = (id: string) => setQueue(prev => prev.filter(q => q.employee_id !== id))
  const move = (idx: number, dir: -1 | 1) => {
    setQueue(prev => {
      const next = [...prev]
      const j = idx + dir
      if (j < 0 || j >= next.length) return prev
      ;[next[idx], next[j]] = [next[j], next[idx]]
      return next
    })
  }
  const save = async () => {
    setSaving(true)
    try {
      await cleaningApi.saveQueue(queue.map(q => q.employee_id))
      flash('บันทึกคิวแล้ว')
      load()
    } catch (e: any) {
      flash(e?.response?.data?.message || 'บันทึกไม่สำเร็จ', false)
    } finally { setSaving(false) }
  }

  return (
    <div className="card">
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
        <IconUser size={14} /> คิวผู้ตรวจ
        <span className="text-xs text-gray-500 font-normal">(เวียนตามลำดับ ทุกครั้งที่ HR อนุมัติ pointer จะขยับ +1)</span>
      </h3>

      {queue.length === 0 ? (
        <p className="text-xs text-gray-500 text-center py-4">ยังไม่มีใครในคิว — เพิ่มคนแรกได้เลย</p>
      ) : (
        <div className="space-y-1.5 mb-3">
          {queue.map((q, idx) => (
            <div
              key={q.employee_id}
              className={clsx(
                'flex items-center justify-between gap-2 px-3 py-2 rounded-md border',
                idx === nextPos
                  ? 'border-[#1D9E75] bg-green-50/50'
                  : 'border-black/[0.06] bg-white'
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs text-gray-400 font-medium w-6">{idx + 1}</span>
                <EmployeeAvatar
                  person={{
                    first_name: q.first_name || undefined,
                    last_name: q.last_name || undefined,
                    avatar_url: q.avatar_url || undefined,
                  }}
                  size={24}
                />
                <span className="text-sm font-medium truncate">
                  {q.first_name} {q.last_name}
                  {idx === nextPos && <span className="ml-2 text-[10px] text-[#085041] font-semibold">คิวถัดไป</span>}
                </span>
              </div>
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <button onClick={() => move(idx, -1)} disabled={idx === 0} className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30">
                  <IconArrowUp size={14} className="text-gray-500" />
                </button>
                <button onClick={() => move(idx, 1)} disabled={idx === queue.length - 1} className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30">
                  <IconArrowDown size={14} className="text-gray-500" />
                </button>
                <button onClick={() => remove(q.employee_id)} className="p-1.5 rounded hover:bg-red-50">
                  <IconTrash size={14} className="text-red-500" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 items-center mb-3">
        <select className="input flex-1 text-sm" value={pickerId} onChange={e => setPickerId(e.target.value)}>
          <option value="">— เพิ่มพนักงานเข้าคิว —</option>
          {candidates.map(e => (
            <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>
          ))}
        </select>
        <button onClick={add} disabled={!pickerId} className="btn btn-primary text-xs">
          <IconPlus size={13} /> เพิ่ม
        </button>
      </div>

      <div className="flex justify-end">
        <button onClick={save} disabled={saving} className="btn btn-primary text-sm">
          {saving ? 'กำลังบันทึก…' : 'บันทึกคิว'}
        </button>
      </div>
    </div>
  )
}

// ============================================================
// SESSION DETAIL MODAL
// ============================================================
// Used from the History tab (and bell deep-link). Shows the full
// snapshot of a past or pending session and, when the current user is
// HR/owner and the session is in inspector_reviewed state, exposes the
// same approve/reject panel the Today tab uses — so backlog approval
// works without hunting through the calendar.

function SessionDetailModal({
  sessionId, isHR, onClose, onChanged, flash,
}: {
  sessionId: string
  isHR: boolean
  onClose: () => void
  onChanged?: () => void
  flash: (text: string, ok?: boolean) => void
}) {
  const [detail, setDetail] = useState<CleaningSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [hrNote, setHrNote] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await cleaningApi.getSession(sessionId)
      setDetail(r.data.data)
    } catch (e: any) {
      flash(e?.response?.data?.message || 'โหลดรายละเอียดไม่สำเร็จ', false)
      onClose()
    } finally { setLoading(false) }
  }, [sessionId])
  useEffect(() => { load() }, [load])

  const approve = async () => {
    if (!detail) return
    setBusy(true)
    try {
      await cleaningApi.approve(detail.id, hrNote || undefined)
      flash('อนุมัติเรียบร้อย')
      onChanged?.()
      onClose()
    } catch (e: any) {
      flash(e?.response?.data?.message || 'อนุมัติไม่สำเร็จ', false)
    } finally { setBusy(false) }
  }
  const reject = async () => {
    if (!detail) return
    if (!hrNote.trim()) { flash('กรุณาใส่เหตุผลที่ตีกลับ', false); return }
    setBusy(true)
    try {
      await cleaningApi.reject(detail.id, hrNote)
      flash('ตีกลับเรียบร้อย')
      onChanged?.()
      onClose()
    } catch (e: any) {
      flash(e?.response?.data?.message || 'ตีกลับไม่สำเร็จ', false)
    } finally { setBusy(false) }
  }

  const canApprove = isHR && detail?.status === 'inspector_reviewed'

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-black/[0.06] sticky top-0 bg-white">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <IconSparkles size={16} className="text-[#1D9E75]" />
            รายละเอียดรอบทำความสะอาด
          </h2>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100">
            <IconX size={16} className="text-gray-500" />
          </button>
        </div>

        {loading || !detail ? (
          <div className="p-6 text-sm text-gray-500 text-center">กำลังโหลด…</div>
        ) : (
          <div className="p-5 space-y-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <p className="text-sm font-semibold text-[#111110]">
                  {dayjs(detail.session_date).format('dddd ที่ D MMMM YYYY')}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {detail.start_time?.slice(0,5)}–{detail.end_time?.slice(0,5)}
                </p>
              </div>
              <span className={clsx('badge', STATUS_BADGE[detail.status])}>{STATUS_TH[detail.status]}</span>
            </div>

            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-500 text-xs">ผู้ตรวจ:</span>
              {detail.inspector_id ? (
                <>
                  <EmployeeAvatar
                    person={{
                      first_name: detail.inspector_first_name || undefined,
                      last_name: detail.inspector_last_name || undefined,
                      avatar_url: detail.inspector_avatar_url || undefined,
                    }}
                    size={20}
                  />
                  <span>{detail.inspector_first_name} {detail.inspector_last_name}</span>
                </>
              ) : <span className="text-gray-400 italic">ยังไม่กำหนด</span>}
              {detail.inspector_completed_at && (
                <span className="text-xs text-gray-500 ml-auto">
                  ส่งรายงาน {dayjs(detail.inspector_completed_at).format('D MMM HH:mm')}
                </span>
              )}
            </div>

            {detail.inspector_notes && (
              <div className="px-3 py-2 rounded-md bg-blue-50 border border-blue-200 text-xs text-blue-900">
                <span className="font-medium">หมายเหตุผู้ตรวจ:</span> {detail.inspector_notes}
              </div>
            )}

            <div>
              <p className="text-xs font-semibold text-gray-600 mb-1.5">
                รายการงาน ({detail.items.length})
              </p>
              <div className="space-y-1.5">
                {detail.items.map((it, idx) => (
                  <div key={it.id} className="border border-black/[0.06] rounded-md p-2.5">
                    <div className="flex items-start gap-2">
                      <span className="text-xs text-gray-400 font-medium mt-0.5">{idx + 1}.</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-[#111110]">{it.item_name}</p>
                        <div className="text-xs text-gray-600 mt-1 flex items-center gap-2 flex-wrap">
                          {it.done_by_employee_id ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-50 text-green-800 border border-green-200">
                              <EmployeeAvatar
                                person={{
                                  first_name: it.done_by_first_name || undefined,
                                  last_name: it.done_by_last_name || undefined,
                                  avatar_url: it.done_by_avatar_url || undefined,
                                }}
                                size={14}
                              />
                              {it.done_by_first_name} {it.done_by_last_name}
                            </span>
                          ) : (
                            <span className="text-gray-400 italic">— ไม่ระบุคนทำ —</span>
                          )}
                          {it.inspector_note && <span className="text-gray-500">· {it.inspector_note}</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* HR approve/reject panel */}
            {canApprove && (
              <div className="rounded-md border border-amber-200 bg-amber-50/50 p-3">
                <p className="text-xs font-semibold text-amber-900 mb-2">รอ HR/เจ้าของอนุมัติ</p>
                <textarea
                  className="input min-h-[50px] resize-y text-sm"
                  placeholder="หมายเหตุ HR (ถ้าตีกลับต้องระบุเหตุผล)"
                  value={hrNote}
                  onChange={e => setHrNote(e.target.value)}
                />
                <div className="flex justify-end gap-2 mt-2">
                  <button onClick={reject} disabled={busy} className="btn text-sm text-red-600">
                    <IconX size={15} /> ตีกลับ
                  </button>
                  <button onClick={approve} disabled={busy} className="btn btn-primary text-sm">
                    <IconCheck size={15} /> อนุมัติ
                  </button>
                </div>
              </div>
            )}

            {/* Approved / rejected info */}
            {detail.status === 'approved' && (
              <div className="rounded-md border border-green-200 bg-green-50/50 p-3 text-xs text-green-900">
                <p className="font-medium">
                  <IconCheck size={13} className="inline" /> อนุมัติโดย {detail.approver_first_name} {detail.approver_last_name}
                  {detail.approved_at && <> · {dayjs(detail.approved_at).format('D MMM HH:mm')}</>}
                </p>
                {detail.hr_notes && <p className="mt-1">หมายเหตุ HR: {detail.hr_notes}</p>}
              </div>
            )}
            {detail.status === 'rejected' && (
              <div className="rounded-md border border-red-200 bg-red-50/50 p-3 text-xs text-red-900">
                <p className="font-medium"><IconAlertCircle size={13} className="inline" /> ตีกลับ</p>
                {detail.hr_notes && <p className="mt-1">เหตุผล: {detail.hr_notes}</p>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
