'use client'
import { useEffect, useMemo, useState } from 'react'
import { positionApi, Position, PositionUpsert } from '@/lib/api'
import {
  IconHierarchy, IconPlus, IconEdit, IconTrash,
  IconChevronDown, IconChevronRight, IconCheck, IconX
} from '@tabler/icons-react'
import clsx from 'clsx'

interface TreeNode extends Position {
  children: TreeNode[]
}

function buildTree(positions: Position[]): TreeNode[] {
  const byId: Record<string, TreeNode> = {}
  for (const p of positions) {
    byId[p.id] = { ...p, children: [] }
  }
  const roots: TreeNode[] = []
  for (const p of positions) {
    const node = byId[p.id]
    if (p.parent_id && byId[p.parent_id]) {
      byId[p.parent_id].children.push(node)
    } else {
      roots.push(node)
    }
  }
  // Sort children by code then name
  const sortFn = (a: TreeNode, b: TreeNode) =>
    (a.code || '').localeCompare(b.code || '') || a.name.localeCompare(b.name, 'th')
  const sortRecursive = (nodes: TreeNode[]) => {
    nodes.sort(sortFn)
    nodes.forEach(n => sortRecursive(n.children))
  }
  sortRecursive(roots)
  return roots
}

interface NodeFormProps {
  parent?: Position | null
  initial?: Position
  onSave: (data: PositionUpsert) => Promise<void>
  onCancel: () => void
  saving: boolean
}

function NodeForm({ parent, initial, onSave, onCancel, saving }: NodeFormProps) {
  const [code, setCode] = useState(initial?.code || '')
  const [name, setName] = useState(initial?.name || '')
  const [description, setDescription] = useState(initial?.description || '')
  const [err, setErr] = useState('')

  const submit = async () => {
    if (!name.trim()) { setErr('กรุณาระบุชื่อตำแหน่ง'); return }
    setErr('')
    try {
      await onSave({
        code: code.trim() || undefined,
        name: name.trim(),
        description: description.trim() || undefined,
        // For "Add child" the parent is fixed; for edit we keep current parent.
        parentId: initial ? initial.parent_id ?? null : (parent ? parent.id : null),
      })
    } catch (e: any) {
      setErr(e.response?.data?.message || 'เกิดข้อผิดพลาด')
    }
  }

  return (
    <div className="bg-gray-50 rounded-[10px] p-3 mt-2 border border-black/[0.04]">
      <div className="text-[11px] font-medium text-gray-500 mb-2">
        {initial
          ? `แก้ไข: ${initial.name}`
          : parent
            ? `เพิ่มตำแหน่งย่อยภายใต้: ${parent.name}`
            : 'เพิ่มตำแหน่งหลัก'}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <input
          className="input font-mono"
          placeholder="โค้ด (เว้นว่าง = auto)"
          value={code}
          onChange={e => setCode(e.target.value)}
        />
        <input
          className="input sm:col-span-2"
          placeholder="ชื่อตำแหน่ง *"
          value={name}
          onChange={e => setName(e.target.value)}
        />
        <input
          className="input sm:col-span-3"
          placeholder="คำอธิบาย (ไม่บังคับ)"
          value={description}
          onChange={e => setDescription(e.target.value)}
        />
      </div>
      {err && <p className="text-xs mt-2 text-red-600">{err}</p>}
      <div className="flex gap-2 mt-2">
        <button onClick={submit} disabled={saving} className="btn btn-primary text-xs">
          <IconCheck size={12} /> {saving ? 'กำลังบันทึก...' : 'บันทึก'}
        </button>
        <button onClick={onCancel} className="btn text-xs">
          <IconX size={12} /> ยกเลิก
        </button>
      </div>
    </div>
  )
}

interface TreeNodeViewProps {
  node: TreeNode
  depth: number
  canEdit: boolean
  expandedIds: Set<string>
  toggleExpand: (id: string) => void
  addingUnder: string | null
  editingId: string | null
  onStartAdd: (parentId: string | null) => void
  onStartEdit: (node: Position) => void
  onSaveAdd: (parent: Position | null, data: PositionUpsert) => Promise<void>
  onSaveEdit: (id: string, data: PositionUpsert) => Promise<void>
  onCancel: () => void
  onDelete: (node: Position) => void
  saving: boolean
}

function TreeNodeView(p: TreeNodeViewProps) {
  const {
    node, depth, canEdit, expandedIds, toggleExpand,
    addingUnder, editingId, onStartAdd, onStartEdit, onSaveAdd, onSaveEdit,
    onCancel, onDelete, saving,
  } = p
  const isExpanded = expandedIds.has(node.id)
  const hasChildren = node.children.length > 0
  const isEditing = editingId === node.id

  return (
    <div className="select-none">
      <div className="flex items-center gap-2 py-1">
        <div style={{ width: depth * 22 }} className="flex-shrink-0" />

        {/* Expander */}
        {hasChildren ? (
          <button onClick={() => toggleExpand(node.id)}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-100 text-gray-500">
            {isExpanded ? <IconChevronDown size={13} /> : <IconChevronRight size={13} />}
          </button>
        ) : (
          <div className="w-5 h-5" />
        )}

        {/* Node card */}
        <div className="flex-1 min-w-0 flex items-center gap-2 bg-white border border-black/[0.06] rounded-[10px] px-3 py-2 hover:shadow-sm group">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-[#111110]">{node.name}</span>
              {node.code && (
                <span className="text-[11px] font-mono text-gray-400">({node.code})</span>
              )}
              {hasChildren && (
                <span className="badge badge-gray text-[10px]">{node.children.length} ตำแหน่งย่อย</span>
              )}
            </div>
            {node.description && (
              <div className="text-[11px] text-gray-500 mt-0.5">{node.description}</div>
            )}
          </div>
          {canEdit && (
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => onStartAdd(node.id)}
                className="w-7 h-7 rounded-full bg-[#E1F5EE] text-[#085041] flex items-center justify-center hover:bg-[#D5EFE6]"
                title="เพิ่มตำแหน่งย่อย">
                <IconPlus size={13} />
              </button>
              <button onClick={() => onStartEdit(node)}
                className="w-7 h-7 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center hover:bg-gray-200"
                title="แก้ไข">
                <IconEdit size={13} />
              </button>
              <button onClick={() => onDelete(node)}
                disabled={hasChildren}
                className={clsx(
                  'w-7 h-7 rounded-full flex items-center justify-center',
                  hasChildren
                    ? 'text-gray-300 cursor-not-allowed'
                    : 'bg-red-50 text-red-500 hover:bg-red-100'
                )}
                title={hasChildren ? 'ลบไม่ได้ — มีตำแหน่งย่อย' : 'ลบ'}>
                <IconTrash size={13} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Inline forms */}
      {isEditing && (
        <div style={{ marginLeft: depth * 22 + 36 }}>
          <NodeForm
            initial={node}
            onSave={(data) => onSaveEdit(node.id, data)}
            onCancel={onCancel}
            saving={saving}
          />
        </div>
      )}
      {addingUnder === node.id && (
        <div style={{ marginLeft: depth * 22 + 36 }}>
          <NodeForm
            parent={node}
            onSave={(data) => onSaveAdd(node, data)}
            onCancel={onCancel}
            saving={saving}
          />
        </div>
      )}

      {/* Children */}
      {hasChildren && isExpanded && (
        <div>
          {node.children.map(child => (
            <TreeNodeView
              key={child.id}
              {...p}
              node={child}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function PositionTree({ isHR }: { isHR: boolean }) {
  const [positions, setPositions] = useState<Position[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState({ text: '', ok: true })

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [addingUnder, setAddingUnder] = useState<string | null>(null) // parent id (or special root marker)
  const [addingRoot, setAddingRoot] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await positionApi.list()
      const list: Position[] = res.data.data || []
      setPositions(list)
      // Auto-expand all
      setExpandedIds(new Set(list.map(p => p.id)))
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const tree = useMemo(() => buildTree(positions), [positions])

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const startAdd = (parentId: string | null) => {
    setEditingId(null)
    setAddingRoot(false)
    setAddingUnder(parentId)
    if (parentId) {
      // Make sure parent is expanded so the form is visible
      setExpandedIds(prev => new Set(prev).add(parentId))
    }
  }
  const startEdit = (node: Position) => {
    setAddingUnder(null)
    setAddingRoot(false)
    setEditingId(node.id)
  }
  const cancel = () => {
    setAddingUnder(null)
    setAddingRoot(false)
    setEditingId(null)
    setMsg({ text: '', ok: true })
  }

  const saveAdd = async (parent: Position | null, data: PositionUpsert) => {
    setSaving(true)
    try {
      await positionApi.create({ ...data, parentId: parent?.id ?? null })
      setMsg({ text: 'สร้างตำแหน่งแล้ว', ok: true })
      cancel()
      load()
    } finally { setSaving(false) }
  }

  const saveEdit = async (id: string, data: PositionUpsert) => {
    setSaving(true)
    try {
      await positionApi.update(id, data)
      setMsg({ text: 'อัปเดตแล้ว', ok: true })
      cancel()
      load()
    } finally { setSaving(false) }
  }

  const handleDelete = async (node: Position) => {
    if (!confirm(`ลบตำแหน่ง "${node.name}"?`)) return
    try {
      await positionApi.delete(node.id)
      load()
    } catch (e: any) {
      alert(e.response?.data?.message || 'เกิดข้อผิดพลาด')
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <IconHierarchy size={16} className="text-[#1D9E75]" />
          <span className="text-sm font-medium text-[#111110]">
            โครงสร้างตำแหน่ง ({positions.length} ตำแหน่ง)
          </span>
        </div>
        {isHR && (
          <button
            onClick={() => { setEditingId(null); setAddingUnder(null); setAddingRoot(true) }}
            className="btn btn-primary text-xs"
          >
            <IconPlus size={13} /> เพิ่มตำแหน่งหลัก
          </button>
        )}
      </div>

      {msg.text && (
        <div className={clsx(
          'flex items-center gap-2 p-2.5 rounded-[10px] text-xs mb-3',
          msg.ok ? 'bg-[#E1F5EE] text-[#085041]' : 'bg-red-50 text-red-600'
        )}>
          {msg.ok ? <IconCheck size={13} /> : <IconX size={13} />}
          {msg.text}
        </div>
      )}

      {addingRoot && (
        <NodeForm
          parent={null}
          onSave={(data) => saveAdd(null, data)}
          onCancel={cancel}
          saving={saving}
        />
      )}

      <div className="card">
        {loading && positions.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">กำลังโหลด...</p>
        ) : tree.length === 0 ? (
          <div className="text-center py-10">
            <IconHierarchy size={28} className="mx-auto text-gray-300 mb-2" />
            <p className="text-sm text-gray-400 mb-2">ยังไม่มีตำแหน่ง</p>
            {isHR && (
              <button onClick={() => setAddingRoot(true)} className="btn btn-primary text-xs">
                <IconPlus size={13} /> เริ่มสร้างตำแหน่งแรก
              </button>
            )}
          </div>
        ) : (
          <div>
            {tree.map(root => (
              <TreeNodeView
                key={root.id}
                node={root}
                depth={0}
                canEdit={isHR}
                expandedIds={expandedIds}
                toggleExpand={toggleExpand}
                addingUnder={addingUnder}
                editingId={editingId}
                onStartAdd={startAdd}
                onStartEdit={startEdit}
                onSaveAdd={saveAdd}
                onSaveEdit={saveEdit}
                onCancel={cancel}
                onDelete={handleDelete}
                saving={saving}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
