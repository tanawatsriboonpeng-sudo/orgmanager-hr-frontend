'use client'
import { useState } from 'react'
import { authApi } from '@/lib/api'
import { IconLock, IconCheck, IconX, IconEye, IconEyeOff } from '@tabler/icons-react'
import { useAuthStore } from '@/lib/store'

export default function ChangePasswordPage() {
  const { user } = useAuthStore()
  const [form, setForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState({ text: '', ok: true })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.newPassword !== form.confirmPassword) {
      setMsg({ text: 'รหัสผ่านใหม่ไม่ตรงกัน', ok: false }); return
    }
    if (form.newPassword.length < 6) {
      setMsg({ text: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร', ok: false }); return
    }
    setLoading(true)
    try {
      await authApi.changePassword(form.currentPassword, form.newPassword)
      setMsg({ text: 'เปลี่ยนรหัสผ่านสำเร็จแล้ว', ok: true })
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (e: any) {
      setMsg({ text: e.response?.data?.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่', ok: false })
    } finally { setLoading(false) }
  }

  return (
    <div className="p-6 max-w-lg mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[#111110]">เปลี่ยนรหัสผ่าน</h1>
        <p className="text-sm text-gray-500 mt-0.5">{user?.email}</p>
      </div>

      {msg.text && (
        <div className={`flex items-center gap-2 p-3 rounded-[10px] text-sm mb-4 animate-fade-in
          ${msg.ok ? 'bg-[#E1F5EE] text-[#085041]' : 'bg-red-50 text-red-600'}`}>
          {msg.ok ? <IconCheck size={15} /> : <IconX size={15} />}
          {msg.text}
        </div>
      )}

      <div className="card">
        <div className="flex items-center gap-3 mb-5 pb-4 border-b border-black/[0.06]">
          <div className="w-9 h-9 bg-[#EEEDFE] rounded-xl flex items-center justify-center">
            <IconLock size={18} className="text-[#534AB7]" />
          </div>
          <div>
            <div className="text-sm font-medium text-[#111110]">ความปลอดภัยบัญชี</div>
            <div className="text-xs text-gray-500">รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">รหัสผ่านปัจจุบัน</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                className="input pr-10"
                value={form.currentPassword}
                onChange={e => setForm(p => ({ ...p, currentPassword: e.target.value }))}
                placeholder="••••••••"
                required
              />
              <button type="button" onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                {showPw ? <IconEyeOff size={16} /> : <IconEye size={16} />}
              </button>
            </div>
          </div>

          <div>
            <label className="label">รหัสผ่านใหม่</label>
            <input
              type={showPw ? 'text' : 'password'}
              className="input"
              value={form.newPassword}
              onChange={e => setForm(p => ({ ...p, newPassword: e.target.value }))}
              placeholder="อย่างน้อย 6 ตัวอักษร"
              required
            />
          </div>

          <div>
            <label className="label">ยืนยันรหัสผ่านใหม่</label>
            <input
              type={showPw ? 'text' : 'password'}
              className="input"
              value={form.confirmPassword}
              onChange={e => setForm(p => ({ ...p, confirmPassword: e.target.value }))}
              placeholder="พิมพ์รหัสผ่านใหม่อีกครั้ง"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary w-full justify-center py-2.5"
          >
            {loading
              ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : 'เปลี่ยนรหัสผ่าน'}
          </button>
        </form>
      </div>

      <div className="mt-4 p-3 bg-amber-50 rounded-[10px] text-xs text-amber-700">
        <strong>หมายเหตุ:</strong> หลังเปลี่ยนรหัสผ่านแล้ว ระบบจะยังคงล็อกอินอยู่
        แต่ session อื่นๆ จะถูก logout อัตโนมัติ
      </div>
    </div>
  )
}
