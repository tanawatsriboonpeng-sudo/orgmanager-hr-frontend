'use client'
// Floating AI assistant. One persistent button bottom-right that opens a
// chat panel. State (open/closed, message history) lives in this component
// — history is intentionally NOT persisted across reloads to keep the
// privacy story simple (and because Haiku-class chats are cheap enough
// that starting fresh isn't a big deal).
//
// On hide: we still mount when the API is configured server-side. The
// /ai/status endpoint controls visibility — when the backend has no
// ANTHROPIC_API_KEY, the widget never renders.

import { useEffect, useRef, useState } from 'react'
import { useAuthStore } from '@/lib/store'
import { aiApi, type AIChatMessage } from '@/lib/api'
import {
  IconRobot, IconX, IconSend2, IconSparkles, IconRefresh,
} from '@tabler/icons-react'
import Spinner from '@/components/ui/Spinner'

interface UIMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  // 'system' rows are inline errors/notices, not shown to backend.
}

// Small starter prompts to nudge first-time users. Tap to send.
// Owner/HR get admin-flavored prompts (they can also use the read-only
// ones); employees only see the read-only set.
const EMPLOYEE_SUGGESTIONS = [
  'ลาพักร้อนเหลือกี่วัน?',
  'พรุ่งนี้กะอะไร?',
  'สลิปเดือนที่แล้วได้เท่าไหร่?',
  'วันหยุดที่ใกล้ที่สุดคือวันไหน?',
]
const ADMIN_SUGGESTIONS = [
  'มีคำขอลาที่รออนุมัติไหม?',
  'เพิ่มวันหยุด 12 ส.ค. ชื่อ วันแม่',
  'สร้างประกาศประชุมพรุ่งนี้ 10 โมง',
  'วันหยุดที่ใกล้ที่สุดคือวันไหน?',
]

// Minimal markdown renderer — only bold and line breaks. Avoids pulling
// in a full markdown library for what is mostly short Thai prose. Tables
// from the model fall back to monospace rendering, which is acceptable.
function renderInline(text: string) {
  // Split on **bold** while preserving the delimiters.
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) {
      return <strong key={i} className="font-semibold">{p.slice(2, -2)}</strong>
    }
    return <span key={i}>{p}</span>
  })
}

function MessageBubble({ msg }: { msg: UIMessage }) {
  if (msg.role === 'system') {
    return (
      <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1 mx-auto max-w-[85%] text-center">
        {msg.content}
      </div>
    )
  }
  const isUser = msg.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap break-words ${
          isUser
            ? 'bg-[#1D9E75] text-white rounded-br-md'
            : 'bg-gray-100 text-gray-800 rounded-bl-md'
        }`}
      >
        {msg.content.split('\n').map((line, i) => (
          <div key={i}>{line ? renderInline(line) : <br />}</div>
        ))}
      </div>
    </div>
  )
}

export default function ChatWidget() {
  const { user, isAuthenticated } = useAuthStore()
  const [enabled, setEnabled] = useState(false)
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [messages, setMessages] = useState<UIMessage[]>([])
  const [quota, setQuota] = useState<{ used: number; max: number } | null>(null)

  const scrollRef = useRef<HTMLDivElement | null>(null)

  // Probe /ai/status once after login — controls whether the FAB renders
  // at all. Failing the probe just hides the widget; no toast spam.
  useEffect(() => {
    if (!isAuthenticated) { setEnabled(false); return }
    let cancelled = false
    aiApi.status()
      .then(({ data }) => {
        if (cancelled) return
        setEnabled(!!data?.data?.enabled)
        if (data?.data) {
          setQuota({ used: data.data.used_today, max: data.data.daily_quota })
        }
      })
      .catch(() => { if (!cancelled) setEnabled(false) })
    return () => { cancelled = true }
  }, [isAuthenticated])

  // Auto-scroll to bottom on new message.
  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, open, sending])

  if (!enabled || !isAuthenticated) return null

  const send = async (text?: string) => {
    const toSend = (text ?? input).trim()
    if (!toSend || sending) return
    setInput('')
    const next: UIMessage[] = [...messages, { role: 'user', content: toSend }]
    setMessages(next)
    setSending(true)

    try {
      // Strip 'system' rows before sending — backend only wants user/assistant.
      // Use a type predicate so the .map() preserves the AIRole narrowing.
      const isApiRow = (m: UIMessage): m is UIMessage & { role: 'user' | 'assistant' } =>
        m.role === 'user' || m.role === 'assistant'
      const apiHistory: AIChatMessage[] = next
        .filter(isApiRow)
        .map(m => ({ role: m.role, content: m.content }))

      const { data } = await aiApi.chat(apiHistory)
      const reply = data?.data?.reply || 'ขออภัย ระบบไม่ตอบสนอง'
      setMessages(m => [...m, { role: 'assistant', content: reply }])
      if (data?.data?.usage) {
        setQuota({
          used: data.data.usage.message_count_today,
          max: data.data.usage.daily_quota,
        })
      }
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'เกิดข้อผิดพลาดในการเรียก AI'
      setMessages(m => [...m, { role: 'system', content: msg }])
    } finally {
      setSending(false)
    }
  }

  const reset = () => {
    setMessages([])
  }

  return (
    <>
      {/* Floating action button. Hidden when panel is open so it doesn't
          overlap the panel itself on small screens. */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="เปิดผู้ช่วย AI"
          className="fixed z-[55] bottom-5 right-5 w-14 h-14 rounded-full bg-gradient-to-br from-[#1D9E75] to-[#0F6E56] text-white shadow-xl flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
          style={{ boxShadow: '0 10px 30px rgba(29,158,117,0.35)' }}
        >
          <IconSparkles size={26} />
        </button>
      )}

      {/* Chat panel. Full-height on mobile, floating card on lg+. */}
      {open && (
        <>
          {/* Backdrop on mobile */}
          <div
            className="lg:hidden fixed inset-0 bg-black/40 z-[55]"
            onClick={() => setOpen(false)}
          />
          <div
            className="fixed z-[60] bg-white shadow-2xl flex flex-col
                       lg:bottom-5 lg:right-5 lg:w-[380px] lg:h-[560px] lg:rounded-2xl
                       inset-0 lg:inset-auto lg:max-h-[80vh]"
            style={{ border: '1px solid rgba(0,0,0,0.06)' }}
            role="dialog"
            aria-label="ผู้ช่วย AI"
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-4 py-3 lg:rounded-t-2xl"
              style={{ background: 'linear-gradient(135deg, #1D9E75 0%, #0F6E56 100%)' }}
            >
              <div className="flex items-center gap-2 text-white">
                <div className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center">
                  <IconRobot size={18} />
                </div>
                <div className="leading-tight">
                  <div className="text-[14px] font-semibold">ผู้ช่วย HR</div>
                  <div className="text-[10px] opacity-80">
                    ถามเรื่องลา / สลิป / กะ / วันหยุดได้
                    {quota ? ` · ${quota.used}/${quota.max} ข้อความวันนี้` : ''}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {messages.length > 0 && (
                  <button
                    onClick={reset}
                    aria-label="เริ่มใหม่"
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-white/80 hover:bg-white/10"
                  >
                    <IconRefresh size={16} />
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  aria-label="ปิด"
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-white hover:bg-white/10"
                >
                  <IconX size={18} />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-3 py-3 space-y-2 bg-[#FAFAF8]"
            >
              {messages.length === 0 && (
                <div className="text-center py-6">
                  <div
                    className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg, #E1F5EE, #B7E4D4)' }}
                  >
                    <IconSparkles size={22} className="text-[#0F6E56]" />
                  </div>
                  <div className="text-[13px] font-medium text-gray-800">
                    สวัสดี{user?.firstName ? ` คุณ${user.firstName}` : ''} ครับ
                  </div>
                  <div className="text-[11px] text-gray-500 mt-1 mb-4">
                    ลองถามคำถามเหล่านี้ดูได้
                  </div>
                  <div className="flex flex-wrap gap-1.5 justify-center px-2">
                    {(user?.role === 'owner' || user?.role === 'hr'
                      ? ADMIN_SUGGESTIONS
                      : EMPLOYEE_SUGGESTIONS
                    ).map(s => (
                      <button
                        key={s}
                        onClick={() => send(s)}
                        className="text-[11px] px-2.5 py-1.5 rounded-full bg-white border border-gray-200 text-gray-700 hover:border-[#1D9E75] hover:text-[#0F6E56] transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((m, i) => (
                <MessageBubble key={i} msg={m} />
              ))}
              {sending && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 text-gray-500 text-[12px] rounded-2xl rounded-bl-md px-3 py-2 flex items-center gap-2">
                    <Spinner size={12} />
                    กำลังคิด…
                  </div>
                </div>
              )}
            </div>

            {/* Composer */}
            <div className="px-3 py-2.5 border-t border-black/[0.06] bg-white lg:rounded-b-2xl">
              <form
                onSubmit={(e) => { e.preventDefault(); send() }}
                className="flex items-end gap-2"
              >
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      send()
                    }
                  }}
                  placeholder="พิมพ์คำถาม… (Enter = ส่ง, Shift+Enter = ขึ้นบรรทัด)"
                  rows={1}
                  maxLength={3000}
                  disabled={sending}
                  className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-[13px] focus:outline-none focus:border-[#1D9E75] focus:ring-2 focus:ring-[#1D9E75]/15 max-h-32"
                />
                <button
                  type="submit"
                  disabled={sending || !input.trim()}
                  className="w-9 h-9 rounded-xl bg-[#1D9E75] text-white flex items-center justify-center hover:bg-[#0F6E56] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  aria-label="ส่ง"
                >
                  {sending ? <Spinner size={14} color="white" /> : <IconSend2 size={16} />}
                </button>
              </form>
              <div className="text-[10px] text-gray-400 mt-1.5 px-1">
                ผู้ช่วย AI เห็นเฉพาะข้อมูลของคุณ · อาจตอบผิดพลาดได้ โปรดยืนยันก่อนตัดสินใจ
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}
