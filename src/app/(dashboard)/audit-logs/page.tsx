'use client'
// Audit log viewer — owner-visible, HR-permitted. Force-redeploy trigger.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { auditApi, type AuditLog } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import {
  IconHistory, IconRefresh, IconFilter, IconUser,
  IconChevronDown, IconChevronUp, IconCalendar,
  IconReceipt2, IconCalendarOff, IconShield,
} from '@tabler/icons-react'
import dayjs from 'dayjs'
import clsx from 'clsx'
import EmployeeAvatar from '@/components/employees/EmployeeAvatar'

// Friendly Thai labels + visual treatment for known actions. Anything not
// listed renders as the raw action string with a neutral grey badge.
const ACTION_META: Record<string, { label: string; cls: string; icon: any; verb: string }> = {
  leave_approval:        { label: 'อนุมัติ/ปฏิเสธคำขอลา', cls: 'badge-purple', icon: IconCalendarOff, verb: 'ดำเนินการคำขอลา' },
  payroll_approve:       { label: 'อนุมัติสลิป',          cls: 'badge-amber',  icon: IconReceipt2,   verb: 'อนุมัติสลิปเงินเดือน' },
  payroll_mark_paid:     { label: 'จ่ายสลิป',             cls: 'badge-green',  icon: IconReceipt2,   verb: 'ทำเครื่องหมายจ่ายแล้ว' },
  payroll_bulk_generate: { label: 'สร้างสลิปประจำเดือน',  cls: 'badge-blue',   icon: IconReceipt2,   verb: 'สร้างสลิปทั้งบริษัท' },
}
const RESOURCE_TH: Record<string, string> = {
  leave_requests:  'คำขอลา',
  payroll_records: 'สลิปเงินเดือน',
}

function relativeTime(iso: string): string {
  const now = dayjs()
  const then = dayjs(iso)
  const diffSec = now.diff(then, 'second')
  if (diffSec < 60) return `${diffSec} วินาทีที่แล้ว`
  const diffMin = now.diff(then, 'minute')
  if (diffMin < 60) return `${diffMin} นาทีที่แล้ว`
  const diffHr = now.diff(then, 'hour')
  if (diffHr < 24) return `${diffHr} ชม.ที่แล้ว`
  const diffDay = now.diff(then, 'day')
  if (diffDay < 7) return `${diffDay} วันที่แล้ว`
  return then.format('D MMM YY HH:mm')
}

export default function AuditLogsPage() {
  const { user } = useAuthStore()
  const role = user?.role
  // Only HR/owner can hit the backend, but we re-check in UI to avoid
  // showing the table briefly to other roles in case they typed the URL.
  const canView = role === 'owner' || role === 'hr'

  const [items, setItems] = useState<AuditLog[]>([])
  const [knownActions, setKnownActions] = useState<string[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Filters
  const [actionFilter, setActionFilter] = useState<string>('')
  const [from, setFrom] = useState<string>('') // YYYY-MM-DD
  const [to, setTo] = useState<string>('')
  const [limit, setLimit] = useState(100)

  const load = useCallback(async () => {
    if (!canView) return
    setLoading(true)
    try {
      const r = await auditApi.list({
        action: actionFilter || undefined,
        from: from ? dayjs(from).startOf('day').toISOString() : undefined,
        to:   to   ? dayjs(to).endOf('day').toISOString()     : undefined,
        limit,
      })
      setItems(r.data.data || [])
      setTotal(r.data.meta?.total || 0)
      setKnownActions(r.data.meta?.knownActions || [])
    } catch {
      setItems([]); setTotal(0)
    } finally { setLoading(false) }
  }, [canView, actionFilter, from, to, limit])

  useEffect(() => { load() }, [load])

  const clearFilters = () => { setActionFilter(''); setFrom(''); setTo('') }
  const hasFilter = !!(actionFilter || from || to)

  // Group logs by day for a nicer scan.
  const groups = useMemo(() => {
    const g: Record<string, AuditLog[]> = {}
    for (const it of items) {
      const k = dayjs(it.created_at).format('YYYY-MM-DD')
      if (!g[k]) g[k] = []
      g[k].push(it)
    }
    return Object.entries(g)
  }, [items])

  if (!canView) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="card text-center py-12">
          <IconShield size={28} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-500">หน้านี้สำหรับ HR Admin และเจ้าของเท่านั้น</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#111110] flex items-center gap-2">
            <IconHistory size={18} className="text-[#1D9E75]" />
            ประวัติการดำเนินการ
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            บันทึก audit log ของการอนุมัติ / จ่ายเงินเดือน / ดำเนินการคำขอลา
            {total > 0 && <> · {total.toLocaleString()} รายการทั้งหมด{items.length < total && <> (แสดง {items.length})</>}</>}
          </p>
        </div>
        <button onClick={load} disabled={loading} className="btn btn-ghost text-xs">
          <IconRefresh size={13} className={loading ? 'animate-spin' : ''} /> รีเฟรช
        </button>
      </div>

      {/* Filters */}
      <div className="card mb-4 p-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[180px]">
            <label className="label">ประเภทการกระทำ</label>
            <select
              className="input py-2 text-sm"
              value={actionFilter}
              onChange={e => setActionFilter(e.target.value)}
            >
              <option value="">ทุกประเภท</option>
              {knownActions.map(a => (
                <option key={a} value={a}>{ACTION_META[a]?.label || a}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">ตั้งแต่</label>
            <input type="date" className="input py-2 text-sm" value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="label">ถึง</label>
            <input type="date" className="input py-2 text-sm" value={to} onChange={e => setTo(e.target.value)} max={dayjs().format('YYYY-MM-DD')} />
          </div>
          <div>
            <label className="label">จำนวน</label>
            <select className="input py-2 text-sm w-auto" value={limit} onChange={e => setLimit(parseInt(e.target.value, 10))}>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={250}>250</option>
              <option value={500}>500</option>
            </select>
          </div>
          {hasFilter && (
            <button onClick={clearFilters} className="btn btn-ghost text-xs text-gray-500">
              <IconFilter size={13} /> ล้างตัวกรอง
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <div className="card text-center py-12 text-sm text-gray-400">กำลังโหลด…</div>
      ) : items.length === 0 ? (
        <div className="card text-center py-12">
          <IconHistory size={28} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-400">
            {hasFilter ? 'ไม่พบประวัติตามตัวกรอง' : 'ยังไม่มีประวัติการดำเนินการ'}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map(([day, logs]) => (
            <div key={day}>
              <div className="flex items-center gap-2 mb-2 text-xs text-gray-500">
                <IconCalendar size={12} />
                <span className="font-medium">
                  {dayjs(day).format('dddd D MMMM YYYY')}
                </span>
                <span className="text-gray-300">·</span>
                <span>{logs.length} รายการ</span>
              </div>
              <div className="card p-0 divide-y divide-black/[0.05]">
                {logs.map(l => (
                  <LogRow
                    key={l.id}
                    log={l}
                    expanded={expandedId === l.id}
                    onToggle={() => setExpandedId(expandedId === l.id ? null : l.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function LogRow({ log, expanded, onToggle }: { log: AuditLog; expanded: boolean; onToggle: () => void }) {
  const meta = ACTION_META[log.action]
  const Icon = meta?.icon
  const userPerson = log.user_name
    ? { first_name: log.user_name.split(' ')[0], last_name: log.user_name.split(' ').slice(1).join(' '), avatar_url: log.user_avatar, role: log.role }
    : null
  const detailsObj = log.details && typeof log.details === 'object' ? log.details : null
  const detailsPretty = detailsObj ? JSON.stringify(detailsObj, null, 2) : null

  return (
    <div className="p-3">
      <div className="flex items-start gap-3">
        {userPerson
          ? <EmployeeAvatar person={userPerson as any} size={32} />
          : <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 flex-shrink-0">
              <IconUser size={14} />
            </div>
        }

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-[#111110] truncate">
              {log.user_name || log.email || '— ผู้ใช้ที่ถูกลบ —'}
              {log.user_nickname && <span className="text-gray-400 font-normal ml-1">({log.user_nickname})</span>}
            </span>
            <span className={clsx('badge inline-flex items-center gap-1', meta?.cls || 'badge-gray')}>
              {Icon && <Icon size={11} />}
              {meta?.label || log.action}
            </span>
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {meta?.verb || log.action}
            {log.resource && <> · {RESOURCE_TH[log.resource] || log.resource}</>}
            {log.resource_id && <span className="text-gray-300 ml-1 font-mono">({String(log.resource_id).slice(0, 8)})</span>}
          </div>
          <div className="text-[11px] text-gray-400 mt-0.5">
            {relativeTime(log.created_at)}
            <span className="text-gray-300 mx-1">·</span>
            <span className="tabular-nums">{dayjs(log.created_at).format('HH:mm:ss')}</span>
            {log.ip_address && <><span className="text-gray-300 mx-1">·</span>IP {log.ip_address}</>}
          </div>

          {expanded && (
            <div className="mt-2 pt-2 border-t border-black/[0.05] space-y-1.5">
              {log.device_info && (
                <div className="text-[11px] text-gray-500 break-words">
                  <span className="text-gray-400">User-Agent:</span> {log.device_info}
                </div>
              )}
              {detailsPretty && (
                <pre className="text-[11px] text-gray-600 bg-gray-50 rounded p-2 overflow-x-auto whitespace-pre-wrap break-words font-mono">
                  {detailsPretty}
                </pre>
              )}
              {!log.device_info && !detailsPretty && (
                <div className="text-[11px] text-gray-400 italic">ไม่มีรายละเอียดเพิ่มเติม</div>
              )}
            </div>
          )}
        </div>

        <button
          onClick={onToggle}
          className="btn btn-ghost p-1.5 flex-shrink-0"
          aria-label={expanded ? 'ย่อ' : 'ดูรายละเอียด'}
        >
          {expanded ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
        </button>
      </div>
    </div>
  )
}
