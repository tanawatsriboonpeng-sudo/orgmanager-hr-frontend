'use client'
// Global toast + confirm system.
//
// Why this exists:
//   The codebase has dozens of ad-hoc `useState<{text, ok} | null>(null)`
//   toast patterns and plenty of native `alert()` / `confirm()` calls.
//   They're inconsistent (different styling per page), block input on
//   iOS, and the native dialog stalls our automation harness.
//
// API (via the useToast() hook):
//   toast.success('บันทึกแล้ว')
//   toast.error('เกิดข้อผิดพลาด')
//   toast.info('โหลดข้อมูลใหม่')
//   await toast.confirm('ลบรายการนี้?', { tone: 'danger' })
//     → returns Promise<boolean>
//
// Mount <ToastViewport /> once in the root layout — it portals itself
// to a fixed position so call sites don't need to think about layering.

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react'
import { createPortal } from 'react-dom'
import { IconCheck, IconX, IconAlertTriangle, IconInfoCircle } from '@tabler/icons-react'
import clsx from 'clsx'

type ToastKind = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  kind: ToastKind
  message: string
  duration: number  // ms; 0 = sticky (manual dismiss)
}

interface ConfirmOpts {
  title?: string
  confirmText?: string
  cancelText?: string
  tone?: 'default' | 'danger'
}

interface PendingConfirm extends ConfirmOpts {
  id: number
  message: string
  resolve: (ok: boolean) => void
}

interface ToastApi {
  success: (msg: string, durationMs?: number) => void
  error:   (msg: string, durationMs?: number) => void
  info:    (msg: string, durationMs?: number) => void
  confirm: (msg: string, opts?: ConfirmOpts) => Promise<boolean>
}

const ToastContext = createContext<ToastApi | null>(null)

/* ============================================================
 * Provider — owns the toast queue + pending confirm dialog.
 * Wrap once near the root (layout) and forget about it.
 * ============================================================ */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [pending, setPending] = useState<PendingConfirm | null>(null)
  const nextId = useRef(1)

  const push = useCallback((kind: ToastKind, message: string, duration?: number) => {
    const id = nextId.current++
    // Errors stay until dismissed (so the user actually reads them);
    // success/info auto-dismiss after a couple of seconds.
    const dur = duration ?? (kind === 'error' ? 0 : kind === 'success' ? 3000 : 4000)
    setToasts(prev => [...prev, { id, kind, message, duration: dur }])
    if (dur > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id))
      }, dur)
    }
  }, [])

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const api = useMemo<ToastApi>(() => ({
    success: (msg, d) => push('success', msg, d),
    error:   (msg, d) => push('error', msg, d),
    info:    (msg, d) => push('info', msg, d),
    confirm: (message, opts = {}) => new Promise<boolean>((resolve) => {
      setPending({
        id: nextId.current++,
        message,
        resolve,
        ...opts,
      })
    }),
  }), [push])

  const resolveConfirm = (ok: boolean) => {
    if (!pending) return
    pending.resolve(ok)
    setPending(null)
  }

  // Close pending confirm on Escape — only when one is open.
  useEffect(() => {
    if (!pending) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') resolveConfirm(false)
      if (e.key === 'Enter')  resolveConfirm(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
      {pending && <ConfirmDialog pending={pending} onResolve={resolveConfirm} />}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    // Defensive fallback so a misplaced useToast() doesn't crash the
    // page — falls through to native dialogs instead.
    return {
      success: (m) => console.log('[toast.success]', m),
      error:   (m) => { console.error('[toast.error]', m); typeof window !== 'undefined' && alert(m) },
      info:    (m) => console.log('[toast.info]', m),
      confirm: async (m) => typeof window !== 'undefined' ? window.confirm(m) : false,
    }
  }
  return ctx
}

/* ============================================================
 * Toast viewport — fixed, bottom-right on desktop, bottom-center
 * on mobile so it doesn't get covered by the LIFF safe-area.
 * ============================================================ */
function ToastViewport({
  toasts, onDismiss,
}: {
  toasts: ToastItem[]
  onDismiss: (id: number) => void
}) {
  if (typeof window === 'undefined') return null
  return createPortal(
    <div className="fixed z-[100] pointer-events-none bottom-4 right-4 left-4 sm:left-auto sm:max-w-sm flex flex-col gap-2 items-end">
      {toasts.map(t => (
        <ToastCard key={t.id} item={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>,
    document.body
  )
}

const TOAST_STYLE = {
  success: {
    border: 'border-[#1D9E75]/30',
    bg: 'bg-white',
    accent: 'bg-[#1D9E75]',
    icon: IconCheck,
    iconBg: 'bg-[#E1F5EE] text-[#0F6E56]',
  },
  error: {
    border: 'border-red-200',
    bg: 'bg-white',
    accent: 'bg-red-500',
    icon: IconAlertTriangle,
    iconBg: 'bg-red-50 text-red-600',
  },
  info: {
    border: 'border-blue-200',
    bg: 'bg-white',
    accent: 'bg-blue-500',
    icon: IconInfoCircle,
    iconBg: 'bg-blue-50 text-blue-600',
  },
} as const

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const style = TOAST_STYLE[item.kind]
  const Icon = style.icon
  return (
    <div
      className={clsx(
        'pointer-events-auto w-full sm:w-auto sm:min-w-[260px] max-w-md',
        'flex items-start gap-2.5 pl-3 pr-2 py-2.5 rounded-[12px] border shadow-lg',
        'animate-slide-up',
        style.border, style.bg,
      )}
      role="status"
    >
      <div className={clsx('w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0', style.iconBg)}>
        <Icon size={15} />
      </div>
      <div className="flex-1 min-w-0 text-sm text-[#111110] leading-snug pt-0.5 break-words">
        {item.message}
      </div>
      <button
        onClick={onDismiss}
        className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 flex-shrink-0"
        aria-label="ปิด"
      >
        <IconX size={14} />
      </button>
    </div>
  )
}

/* ============================================================
 * Confirm dialog — replaces window.confirm with a branded modal.
 * Promise-based so callers can `await confirm()`.
 * ============================================================ */
function ConfirmDialog({
  pending, onResolve,
}: {
  pending: PendingConfirm
  onResolve: (ok: boolean) => void
}) {
  if (typeof window === 'undefined') return null
  const isDanger = pending.tone === 'danger'
  return createPortal(
    <div
      onClick={() => onResolve(false)}
      className="fixed inset-0 z-[110] bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 animate-fade-in"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="modal-panel w-full max-w-sm p-5 animate-scale-in"
      >
        {pending.title && (
          <h3 className="text-base font-semibold text-[#111110] mb-1.5">{pending.title}</h3>
        )}
        <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{pending.message}</p>
        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={() => onResolve(false)}
            className="btn text-sm"
          >
            {pending.cancelText || 'ยกเลิก'}
          </button>
          <button
            onClick={() => onResolve(true)}
            className={clsx(
              'btn text-sm',
              isDanger
                ? 'bg-red-500 hover:bg-red-600 text-white border-red-500'
                : 'btn-primary'
            )}
            autoFocus
          >
            {pending.confirmText || 'ยืนยัน'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
