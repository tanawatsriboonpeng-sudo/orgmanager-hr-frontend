'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  kpiApi, employeeApi, departmentApi,
  type KpiCriterion, type KpiReview, type KpiReviewStatus, type KpiScoreEntry,
} from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import {
  IconPlus, IconStar, IconStarFilled, IconX, IconCheck,
  IconChartBar, IconTrash, IconEdit, IconSend, IconAlertCircle,
} from '@tabler/icons-react'
import dayjs from 'dayjs'
import clsx from 'clsx'
import EmployeeAvatar from '@/components/employees/EmployeeAvatar'

const STATUS_TH: Record<KpiReviewStatus, string> = {
  draft: 'ร่าง', submitted: 'ส่งแล้ว', approved: 'อนุมัติแล้ว',
}
const STATUS_BADGE: Record<KpiReviewStatus, string> = {
  draft: 'badge-gray', submitted: 'badge-amber', approved: 'badge-green',
}
const toNum = (v: any) => Number(v ?? 0)

type Emp = {
  id: string
  user_id?: string
  first_name?: string
  last_name?: string
  nickname?: string
  avatar_url?: string
  position?: string
  manager_id?: string | null
  department_id?: string | null
}

export default function KpiPage() {
  const { user } = useAuthStore()
  const role = user?.role
  const canManage = role === 'hr' || role === 'owner'

  const [tab, setTab] = useState<'reviews' | 'criteria'>('reviews')
  const [reviews, setReviews] = useState<KpiReview[]>([])
  const [criteria, setCriteria] = useState<KpiCriterion[]>([])
  const [employees, setEmployees] = useState<Emp[]>([])

  const now = dayjs()
  const [year, setYear] = useState<number>(now.year())
  const [quarter, setQuarter] = useState<number | ''>('')
  const [statusFilter, setStatusFilter] = useState<KpiReviewStatus | ''>('')

  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')

  const [editingReview, setEditingReview] = useState<KpiReview | 'new' | null>(null)
  const [editingCriterion, setEditingCriterion] = useState<KpiCriterion | 'new' | null>(null)

  // Ref-tracked dismiss timer so back-to-back flash() calls don't leave
  // an orphan timer that clobbers a later message, and cleanup on
  // unmount avoids the "setState on unmounted" warning when the user
  // navigates away mid-flash.
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current) }, [])
  const flash = (msg: string, isError = false) => {
    if (isError) { setErr(msg); setInfo('') } else { setInfo(msg); setErr('') }
    if (flashTimer.current) clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => { setErr(''); setInfo(''); flashTimer.current = null }, 4000)
  }

  const loadReviews = useCallback(async () => {
    setLoading(true)
    try {
      const params: any = { year }
      if (quarter) params.quarter = quarter
      if (statusFilter) params.status = statusFilter
      const r = await kpiApi.listReviews(params)
      setReviews(r.data.data || [])
    } catch (e: any) {
      flash(e.response?.data?.message || 'โหลดรายการประเมินไม่สำเร็จ', true)
      setReviews([])
    } finally { setLoading(false) }
  }, [year, quarter, statusFilter])

  const loadCriteria = useCallback(async () => {
    try {
      const r = await kpiApi.listCriteria(canManage)
      setCriteria(r.data.data || [])
    } catch { /* best-effort */ }
  }, [canManage])

  useEffect(() => { loadReviews() }, [loadReviews])
  useEffect(() => { loadCriteria() }, [loadCriteria])
  useEffect(() => {
    // HR/owner gets the full list. Plain employees + non-HR managers hit
    // /employees/my-subordinates which is auth-gated to their direct
    // reports — /employees itself is HR/owner-only and would 403.
    const loader = canManage ? employeeApi.list() : employeeApi.mySubordinates()
    loader.then(r => setEmployees(r.data.data || [])).catch(() => setEmployees([]))
  }, [canManage])

  // HR/owner sees everyone except owners (owners don't get reviewed).
  // Managers already received only their direct reports from the backend.
  const reviewableEmployees = useMemo(() => {
    if (canManage) return employees.filter(e => (e as any).role !== 'owner')
    return employees
  }, [canManage, employees])

  const canCreate = reviewableEmployees.length > 0

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#111110]">KPI</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {canManage
              ? 'จัดการเกณฑ์และอนุมัติการประเมินทั้งบริษัท'
              : 'การประเมินผลรายไตรมาส'}
          </p>
        </div>
        {tab === 'reviews' && canCreate && (
          <button onClick={() => setEditingReview('new')} className="btn btn-primary text-sm">
            <IconPlus size={15} /> สร้างการประเมิน
          </button>
        )}
        {tab === 'criteria' && canManage && (
          <button onClick={() => setEditingCriterion('new')} className="btn btn-primary text-sm">
            <IconPlus size={15} /> เพิ่มเกณฑ์
          </button>
        )}
      </div>

      {err && (
        <div className="card mb-4 border-red-200 bg-red-50/60 flex items-center gap-2 py-3 text-sm text-red-700">
          <IconAlertCircle size={16} /> {err}
        </div>
      )}
      {info && (
        <div className="card mb-4 border-green-200 bg-green-50/60 flex items-center gap-2 py-3 text-sm text-green-700">
          <IconCheck size={16} /> {info}
        </div>
      )}

      <div className="flex items-center gap-1 mb-5 border-b border-black/[0.06]">
        <TabBtn active={tab === 'reviews'} onClick={() => setTab('reviews')}>
          การประเมิน
        </TabBtn>
        {canManage && (
          <TabBtn active={tab === 'criteria'} onClick={() => setTab('criteria')}>
            เกณฑ์การประเมิน
          </TabBtn>
        )}
      </div>

      {tab === 'reviews' && (
        <ReviewsTab
          reviews={reviews}
          loading={loading}
          year={year} setYear={setYear}
          quarter={quarter} setQuarter={setQuarter}
          statusFilter={statusFilter} setStatusFilter={setStatusFilter}
          canManage={canManage}
          onView={r => setEditingReview(r)}
          onChanged={loadReviews}
          onError={(m: string) => flash(m, true)}
          onInfo={(m: string) => flash(m)}
        />
      )}

      {tab === 'criteria' && canManage && (
        <CriteriaTab
          criteria={criteria}
          onEdit={c => setEditingCriterion(c)}
          onChanged={loadCriteria}
          onError={(m: string) => flash(m, true)}
          onInfo={(m: string) => flash(m)}
        />
      )}

      {editingReview && (
        <ReviewModal
          review={editingReview === 'new' ? null : editingReview}
          criteria={criteria.filter(c => c.is_active)}
          reviewableEmployees={reviewableEmployees}
          canManage={canManage}
          onClose={() => setEditingReview(null)}
          onSaved={() => { setEditingReview(null); loadReviews(); flash('บันทึกแล้ว') }}
          onError={(m: string) => flash(m, true)}
        />
      )}

      {editingCriterion && (
        <CriterionModal
          criterion={editingCriterion === 'new' ? null : editingCriterion}
          onClose={() => setEditingCriterion(null)}
          onSaved={() => { setEditingCriterion(null); loadCriteria(); flash('บันทึกแล้ว') }}
          onError={(m: string) => flash(m, true)}
        />
      )}
    </div>
  )
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: any }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
        active
          ? 'border-[#1D9E75] text-[#085041]'
          : 'border-transparent text-gray-500 hover:text-gray-700'
      )}
    >
      {children}
    </button>
  )
}

/* ====== Reviews tab ====== */

function ReviewsTab({
  reviews, loading, year, setYear, quarter, setQuarter, statusFilter, setStatusFilter,
  canManage, onView, onChanged, onError, onInfo,
}: {
  reviews: KpiReview[]; loading: boolean
  year: number; setYear: (n: number) => void
  quarter: number | ''; setQuarter: (n: number | '') => void
  statusFilter: KpiReviewStatus | ''; setStatusFilter: (s: KpiReviewStatus | '') => void
  canManage: boolean
  onView: (r: KpiReview) => void
  onChanged: () => void
  onError: (m: string) => void
  onInfo: (m: string) => void
}) {
  const now = dayjs()
  const approve = async (r: KpiReview) => {
    if (!confirm(`อนุมัติการประเมินของ ${r.first_name} ${r.last_name} (Q${r.quarter}/${r.year}) ?`)) return
    try {
      await kpiApi.approveReview(r.id); onInfo('อนุมัติแล้ว'); onChanged()
    } catch (e: any) { onError(e.response?.data?.message || 'อนุมัติไม่สำเร็จ') }
  }
  const del = async (r: KpiReview) => {
    if (!confirm('ลบการประเมินนี้?')) return
    try {
      await kpiApi.deleteReview(r.id); onInfo('ลบแล้ว'); onChanged()
    } catch (e: any) { onError(e.response?.data?.message || 'ลบไม่สำเร็จ') }
  }

  return (
    <>
      <div className="card mb-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="label">ปี</label>
            <select className="input" value={year} onChange={e => setYear(parseInt(e.target.value, 10))}>
              {Array.from({ length: 5 }).map((_, i) => {
                const y = now.year() - i
                return <option key={y} value={y}>{y + 543}</option>
              })}
            </select>
          </div>
          <div>
            <label className="label">ไตรมาส</label>
            <select className="input" value={quarter} onChange={e => setQuarter(e.target.value === '' ? '' : parseInt(e.target.value, 10))}>
              <option value="">ทั้งปี</option>
              {[1,2,3,4].map(q => <option key={q} value={q}>Q{q}</option>)}
            </select>
          </div>
          <div>
            <label className="label">สถานะ</label>
            <select className="input" value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}>
              <option value="">ทั้งหมด</option>
              <option value="draft">ร่าง</option>
              <option value="submitted">ส่งแล้ว</option>
              <option value="approved">อนุมัติแล้ว</option>
            </select>
          </div>
          <div className="flex items-end text-xs text-gray-500">
            รวม {reviews.length} รายการ
          </div>
        </div>
      </div>

      {loading ? (
        <div className="card text-center py-12 text-sm text-gray-400">กำลังโหลด…</div>
      ) : reviews.length === 0 ? (
        <div className="card text-center py-12">
          <IconChartBar size={28} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-500">ไม่มีการประเมินในช่วงนี้</p>
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-gray-50/80">
              <tr className="text-left text-xs text-gray-500">
                <th className="px-4 py-3 font-medium">พนักงาน</th>
                <th className="px-4 py-3 font-medium">ผู้ประเมิน</th>
                <th className="px-4 py-3 font-medium text-center">ช่วง</th>
                <th className="px-4 py-3 font-medium text-right">คะแนนรวม</th>
                <th className="px-4 py-3 font-medium text-center">สถานะ</th>
                <th className="px-4 py-3 font-medium text-right">การกระทำ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.05]">
              {reviews.map(r => (
                <tr key={r.id} className="hover:bg-gray-50/60">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <EmployeeAvatar
                        person={{ avatar_url: r.avatar_url, first_name: r.first_name, last_name: r.last_name }}
                        size={28}
                      />
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium text-[#111110] truncate">
                          {r.first_name} {r.last_name}
                          {r.nickname ? <span className="text-gray-400 font-normal"> ({r.nickname})</span> : null}
                        </div>
                        <div className="text-[11px] text-gray-400 truncate">{r.position || r.department_name || ''}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    {r.reviewer_first_name ? (
                      <div className="flex items-center gap-2">
                        <EmployeeAvatar
                          person={{ avatar_url: r.reviewer_avatar_url, first_name: r.reviewer_first_name, last_name: r.reviewer_last_name }}
                          size={22}
                        />
                        <span className="text-[12px] text-gray-700">{r.reviewer_first_name} {r.reviewer_last_name}</span>
                      </div>
                    ) : (
                      <span className="text-[11px] text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-center text-[12px] text-gray-700">
                    Q{r.quarter} / {r.year}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <ScorePill value={toNum(r.overall_score)} />
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={clsx('badge', STATUS_BADGE[r.status])}>{STATUS_TH[r.status]}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="inline-flex gap-1">
                      <button onClick={() => onView(r)} className="btn btn-ghost p-1.5" title="ดู/แก้ไข">
                        <IconEdit size={14} />
                      </button>
                      {canManage && r.status === 'submitted' && (
                        <button onClick={() => approve(r)} className="btn btn-ghost p-1.5 text-[#085041]" title="อนุมัติ">
                          <IconCheck size={14} />
                        </button>
                      )}
                      {canManage && r.status === 'draft' && (
                        <button onClick={() => del(r)} className="btn btn-ghost p-1.5 text-red-500" title="ลบ">
                          <IconTrash size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

function ScorePill({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value))
  const color = v >= 80 ? '#1D9E75' : v >= 60 ? '#BA7517' : v > 0 ? '#E24B4A' : '#9CA3AF'
  return (
    <span
      className="inline-block min-w-[44px] text-[12px] font-medium px-2 py-0.5 rounded-full"
      style={{ background: color + '20', color }}
    >
      {v ? v.toFixed(0) : '—'}
    </span>
  )
}

/* ====== Criteria tab ====== */

function CriteriaTab({
  criteria, onEdit, onChanged, onError, onInfo,
}: {
  criteria: KpiCriterion[]
  onEdit: (c: KpiCriterion) => void
  onChanged: () => void
  onError: (m: string) => void
  onInfo: (m: string) => void
}) {
  const del = async (c: KpiCriterion) => {
    if (!confirm(`ลบเกณฑ์ "${c.name}" ?`)) return
    try {
      const r = await kpiApi.deleteCriterion(c.id)
      onInfo(r.data?.message || 'ลบเกณฑ์แล้ว'); onChanged()
    } catch (e: any) { onError(e.response?.data?.message || 'ลบไม่สำเร็จ') }
  }
  const toggle = async (c: KpiCriterion) => {
    try {
      await kpiApi.updateCriterion(c.id, { isActive: !c.is_active })
      onInfo(!c.is_active ? 'เปิดใช้งานแล้ว' : 'ปิดใช้งานแล้ว'); onChanged()
    } catch (e: any) { onError(e.response?.data?.message || 'อัปเดตไม่สำเร็จ') }
  }

  return criteria.length === 0 ? (
    <div className="card text-center py-12">
      <IconChartBar size={28} className="mx-auto text-gray-300 mb-2" />
      <p className="text-sm text-gray-500">ยังไม่มีเกณฑ์การประเมิน</p>
      <p className="text-[11px] text-gray-400 mt-1">กด "เพิ่มเกณฑ์" เพื่อเริ่มสร้างรูบริค</p>
    </div>
  ) : (
    <div className="card overflow-hidden p-0">
      <table className="w-full text-sm">
        <thead className="bg-gray-50/80">
          <tr className="text-left text-xs text-gray-500">
            <th className="px-4 py-3 font-medium">เกณฑ์</th>
            <th className="px-4 py-3 font-medium">แผนก</th>
            <th className="px-4 py-3 font-medium text-right">น้ำหนัก</th>
            <th className="px-4 py-3 font-medium text-center">สถานะ</th>
            <th className="px-4 py-3 font-medium text-right">การกระทำ</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-black/[0.05]">
          {criteria.map(c => (
            <tr key={c.id} className={clsx('hover:bg-gray-50/60', !c.is_active && 'opacity-60')}>
              <td className="px-4 py-2.5">
                <div className="text-[13px] font-medium text-[#111110]">{c.name}</div>
                {c.description && <div className="text-[11px] text-gray-400 mt-0.5">{c.description}</div>}
              </td>
              <td className="px-4 py-2.5 text-[12px] text-gray-700">
                {c.department_name || <span className="text-gray-400">ทั้งบริษัท</span>}
              </td>
              <td className="px-4 py-2.5 text-right text-[12px] tabular-nums">{toNum(c.weight)}</td>
              <td className="px-4 py-2.5 text-center">
                <button onClick={() => toggle(c)} className={clsx('badge', c.is_active ? 'badge-green' : 'badge-gray')}>
                  {c.is_active ? 'ใช้งาน' : 'ปิดใช้'}
                </button>
              </td>
              <td className="px-4 py-2.5 text-right">
                <div className="inline-flex gap-1">
                  <button onClick={() => onEdit(c)} className="btn btn-ghost p-1.5" title="แก้ไข">
                    <IconEdit size={14} />
                  </button>
                  <button onClick={() => del(c)} className="btn btn-ghost p-1.5 text-red-500" title="ลบ">
                    <IconTrash size={14} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ====== Criterion modal ====== */

function CriterionModal({
  criterion, onClose, onSaved, onError,
}: {
  criterion: KpiCriterion | null
  onClose: () => void
  onSaved: () => void
  onError: (m: string) => void
}) {
  const isNew = !criterion
  const [name, setName] = useState(criterion?.name || '')
  const [description, setDescription] = useState(criterion?.description || '')
  const [weight, setWeight] = useState<number>(toNum(criterion?.weight) || 100)
  const [departmentId, setDepartmentId] = useState<string>(criterion?.department_id || '')
  const [departments, setDepartments] = useState<any[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    departmentApi.list().then(r => setDepartments(r.data.data || [])).catch(() => {})
  }, [])

  const save = async () => {
    if (!name.trim()) { onError('กรุณาระบุชื่อเกณฑ์'); return }
    if (!Number.isFinite(weight) || weight <= 0) { onError('น้ำหนักต้องเป็นตัวเลขมากกว่า 0'); return }
    setBusy(true)
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        weight,
        // null clears the department; '' (unselected) sends null too.
        departmentId: departmentId === '' ? null : departmentId,
      }
      if (isNew) await kpiApi.createCriterion(payload)
      else      await kpiApi.updateCriterion(criterion!.id, payload)
      onSaved()
    } catch (e: any) {
      onError(e.response?.data?.message || 'บันทึกไม่สำเร็จ')
    } finally { setBusy(false) }
  }

  return (
    <ModalShell title={isNew ? 'เพิ่มเกณฑ์การประเมิน' : 'แก้ไขเกณฑ์'} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="label">ชื่อเกณฑ์</label>
          <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="เช่น คุณภาพงาน, การทำงานเป็นทีม" />
        </div>
        <div>
          <label className="label">คำอธิบาย</label>
          <textarea className="input min-h-[60px]" value={description} onChange={e => setDescription(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">น้ำหนัก</label>
            <input
              className="input"
              type="number" min={1} step={1}
              value={weight}
              onChange={e => setWeight(parseFloat(e.target.value) || 0)}
            />
            <div className="text-[11px] text-gray-400 mt-1">ค่าเปรียบเทียบกับเกณฑ์อื่น</div>
          </div>
          <div>
            <label className="label">แผนก (ไม่บังคับ)</label>
            <select className="input" value={departmentId} onChange={e => setDepartmentId(e.target.value)}>
              <option value="">ทั้งบริษัท</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        </div>
      </div>
      <div className="flex gap-2 justify-end mt-5">
        <button onClick={onClose} className="btn text-sm">ยกเลิก</button>
        <button onClick={save} disabled={busy} className="btn btn-primary text-sm">
          {busy ? 'กำลังบันทึก…' : 'บันทึก'}
        </button>
      </div>
    </ModalShell>
  )
}

/* ====== Review modal ====== */

function ReviewModal({
  review, criteria, reviewableEmployees, canManage, onClose, onSaved, onError,
}: {
  review: KpiReview | null
  criteria: KpiCriterion[]
  reviewableEmployees: Emp[]
  canManage: boolean
  onClose: () => void
  onSaved: () => void
  onError: (m: string) => void
}) {
  const isNew = !review
  const now = dayjs()
  const [employeeId, setEmployeeId] = useState(review?.employee_id || '')
  const [quarter, setQuarter] = useState<number>(review?.quarter || Math.floor(now.month() / 3) + 1)
  const [year, setYear] = useState<number>(review?.year || now.year())
  const [comments, setComments] = useState(review?.comments || '')
  const [scores, setScores] = useState<KpiScoreEntry[]>(review?.scores || [])
  const [busy, setBusy] = useState(false)
  const [detail, setDetail] = useState<KpiReview | null>(review)

  // Existing review: re-fetch to get the criterion-name join. New review:
  // seed scores from the active criteria list (all unrated at score=0).
  useEffect(() => {
    if (review?.id) {
      kpiApi.getReview(review.id).then(r => {
        const d: KpiReview = r.data.data
        setDetail(d)
        setScores(d.scores || [])
      }).catch(() => {})
    } else if (criteria.length) {
      setScores(criteria.map(c => ({ criterionId: c.id, score: 0 })))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [review?.id, criteria.length])

  // Weight lookup powers the live overall-score preview. For an existing
  // review, prefer the weights stored on the score entries so soft-deleted
  // criteria still count toward the historical total.
  const weightById = useMemo(() => {
    const m: Record<string, number> = {}
    for (const c of criteria) m[c.id] = toNum(c.weight)
    for (const s of scores) {
      if (s.criterion_weight != null && !(s.criterionId in m)) {
        m[s.criterionId] = toNum(s.criterion_weight)
      }
    }
    return m
  }, [criteria, scores])

  const overall = useMemo(() => {
    let ws = 0, wt = 0
    for (const s of scores) {
      const w = weightById[s.criterionId] || 0
      if (!w || !s.score) continue
      ws += w * s.score; wt += w
    }
    return wt ? Math.round((ws / wt) * 20 * 100) / 100 : 0
  }, [scores, weightById])

  const isLocked = !isNew && detail?.status !== 'draft' && !canManage
  const setScore = (criterionId: string, score: number) => {
    setScores(prev => {
      const found = prev.find(s => s.criterionId === criterionId)
      if (found) return prev.map(s => s.criterionId === criterionId ? { ...s, score } : s)
      return [...prev, { criterionId, score }]
    })
  }
  const setNote = (criterionId: string, note: string) => {
    setScores(prev => {
      const found = prev.find(s => s.criterionId === criterionId)
      if (found) return prev.map(s => s.criterionId === criterionId ? { ...s, note } : s)
      return [...prev, { criterionId, score: 0, note }]
    })
  }

  const save = async (alsoSubmit = false) => {
    if (isNew && !employeeId) { onError('กรุณาเลือกพนักงาน'); return }
    const rated = scores.filter(s => s.score >= 1 && s.score <= 5).map(s => ({
      criterionId: s.criterionId, score: s.score, note: s.note,
    }))
    if (alsoSubmit && rated.length === 0) {
      onError('กรุณาให้คะแนนอย่างน้อย 1 เกณฑ์ก่อนส่ง'); return
    }
    setBusy(true)
    try {
      let id = detail?.id
      if (isNew) {
        const r = await kpiApi.createReview({
          employeeId, quarter: quarter as any, year,
          scores: rated, comments: comments.trim() || undefined,
        })
        id = r.data.data.id
      } else {
        await kpiApi.updateReview(detail!.id, {
          scores: rated, comments: comments.trim() || undefined,
        })
      }
      if (alsoSubmit && id) await kpiApi.submitReview(id)
      onSaved()
    } catch (e: any) {
      onError(e.response?.data?.message || 'บันทึกไม่สำเร็จ')
    } finally { setBusy(false) }
  }

  // For existing reviews, render rows from the stored scores (which carry
  // joined criterion_name so deleted criteria still show meaningfully).
  // For new reviews, render from the active criteria list.
  const rowList = isNew
    ? criteria.map(c => ({ criterionId: c.id, name: c.name, weight: toNum(c.weight) }))
    : (detail?.scores || []).map(s => ({
        criterionId: s.criterionId,
        name: s.criterion_name || '(เกณฑ์ถูกลบ)',
        weight: toNum(s.criterion_weight),
      }))

  return (
    <ModalShell title={isNew ? 'ประเมิน KPI' : 'รายละเอียดการประเมิน'} onClose={onClose} wide>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="sm:col-span-3">
          <label className="label">พนักงาน</label>
          {isNew ? (
            <select className="input" value={employeeId} onChange={e => setEmployeeId(e.target.value)}>
              <option value="">เลือกพนักงาน</option>
              {reviewableEmployees.map(e => (
                <option key={e.id} value={e.id}>
                  {e.first_name} {e.last_name} {e.nickname ? `(${e.nickname})` : ''} {e.position ? `— ${e.position}` : ''}
                </option>
              ))}
            </select>
          ) : (
            <div className="flex items-center gap-2 text-sm">
              <EmployeeAvatar
                person={{ avatar_url: detail?.avatar_url, first_name: detail?.first_name, last_name: detail?.last_name }}
                size={28}
              />
              <span>{detail?.first_name} {detail?.last_name}{detail?.nickname ? ` (${detail.nickname})` : ''}</span>
            </div>
          )}
        </div>
        <div>
          <label className="label">ไตรมาส</label>
          <select className="input" value={quarter} disabled={!isNew} onChange={e => setQuarter(parseInt(e.target.value, 10))}>
            {[1,2,3,4].map(q => <option key={q} value={q}>Q{q}</option>)}
          </select>
        </div>
        <div>
          <label className="label">ปี</label>
          <select className="input" value={year} disabled={!isNew} onChange={e => setYear(parseInt(e.target.value, 10))}>
            {Array.from({ length: 5 }).map((_, i) => {
              const y = now.year() - i
              return <option key={y} value={y}>{y + 543}</option>
            })}
          </select>
        </div>
        <div>
          <label className="label">สถานะ</label>
          <div className="pt-2">
            <span className={clsx('badge', STATUS_BADGE[detail?.status || 'draft'])}>
              {STATUS_TH[detail?.status || 'draft']}
            </span>
          </div>
        </div>
      </div>

      <div className="border-t border-black/[0.06] my-3" />

      {rowList.length === 0 ? (
        <div className="text-center py-8 text-sm text-gray-400">
          {canManage
            ? 'ยังไม่มีเกณฑ์การประเมิน — กรุณาไปที่แท็บ "เกณฑ์การประเมิน" ก่อน'
            : 'ยังไม่มีเกณฑ์การประเมิน — โปรดติดต่อ HR'}
        </div>
      ) : (
        <div className="space-y-3">
          {rowList.map(row => {
            const current = scores.find(s => s.criterionId === row.criterionId)
            return (
              <div key={row.criterionId} className="border border-black/[0.05] rounded-[10px] p-3">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div>
                    <div className="text-[13px] font-medium text-[#111110]">{row.name}</div>
                    <div className="text-[11px] text-gray-400">น้ำหนัก {row.weight}</div>
                  </div>
                  <StarRow
                    value={current?.score || 0}
                    disabled={isLocked}
                    onChange={v => setScore(row.criterionId, v)}
                  />
                </div>
                <input
                  className="input text-[12px] py-1.5"
                  placeholder="โน้ตเพิ่มเติม (ไม่บังคับ)"
                  value={current?.note || ''}
                  disabled={isLocked}
                  onChange={e => setNote(row.criterionId, e.target.value)}
                />
              </div>
            )
          })}
        </div>
      )}

      <div className="mt-4">
        <label className="label">ความเห็นภาพรวม</label>
        <textarea
          className="input min-h-[70px]"
          value={comments}
          disabled={isLocked}
          onChange={e => setComments(e.target.value)}
        />
      </div>

      <div className="flex items-center justify-between mt-4 pt-3 border-t border-black/[0.06]">
        <div>
          <div className="text-[11px] text-gray-500">คะแนนรวม (preview)</div>
          <ScorePill value={overall} />
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="btn text-sm">ปิด</button>
          {!isLocked && (
            <>
              <button onClick={() => save(false)} disabled={busy} className="btn text-sm">
                {busy ? 'กำลังบันทึก…' : 'บันทึกร่าง'}
              </button>
              {(detail?.status === 'draft' || isNew) && (
                <button onClick={() => save(true)} disabled={busy} className="btn btn-primary text-sm">
                  <IconSend size={14} /> ส่งการประเมิน
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </ModalShell>
  )
}

function StarRow({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1,2,3,4,5].map(n => {
        const filled = n <= value
        const Icon = filled ? IconStarFilled : IconStar
        return (
          <button
            key={n}
            type="button"
            disabled={disabled}
            onClick={() => onChange(value === n ? 0 : n)}
            className={clsx(
              'p-1 rounded transition-colors',
              disabled ? 'cursor-default' : 'hover:bg-amber-50',
              filled ? 'text-[#BA7517]' : 'text-gray-300'
            )}
            aria-label={`ให้ ${n} ดาว`}
          >
            <Icon size={20} />
          </button>
        )
      })}
    </div>
  )
}

/* ====== Modal shell ====== */

function ModalShell({ onClose, title, children, wide }: { onClose: () => void; title: string; children: any; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className={clsx(
          'bg-white rounded-[14px] shadow-xl w-full max-h-[92vh] overflow-y-auto',
          wide ? 'max-w-3xl' : 'max-w-md'
        )}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-black/[0.06]">
          <h2 className="text-base font-semibold text-[#111110]">{title}</h2>
          <button onClick={onClose} className="btn btn-ghost p-1.5">
            <IconX size={16} />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}
