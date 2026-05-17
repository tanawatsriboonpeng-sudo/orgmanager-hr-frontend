// LIFF (LINE Front-end Framework) helper.
//
// The same Next.js app runs in two places:
//   1. A regular web browser (Vercel domain) — no LIFF, normal email login.
//   2. Inside the LINE app, opened from the official account's LIFF entry —
//      LIFF SDK is available and `liff.isInClient() === true`.
//
// We isolate every `liff.*` call behind init() so consumers can call it
// once at startup and then ask `isInLiff()` / `getAccessToken()` without
// each component having to know about init state.
//
// NEXT_PUBLIC_LIFF_ID must be set on Vercel — without it init() resolves
// to `ready: false` and the rest of the app falls back to email login
// silently.
import type { Liff } from '@line/liff'

let liffInstance: Liff | null = null
let initPromise: Promise<{ ready: boolean; inClient: boolean }> | null = null

export function isLiffConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_LIFF_ID
}

// Idempotent. Safe to call from many components — the underlying
// liff.init() is only invoked once and the result is cached.
export function initLiff(): Promise<{ ready: boolean; inClient: boolean }> {
  if (initPromise) return initPromise
  initPromise = (async () => {
    if (typeof window === 'undefined') return { ready: false, inClient: false }
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID
    if (!liffId) return { ready: false, inClient: false }
    try {
      const mod = await import('@line/liff')
      const liff = mod.default
      await liff.init({ liffId })
      liffInstance = liff
      return { ready: true, inClient: liff.isInClient() }
    } catch (err) {
      // init can fail outside LIFF (e.g. running on Vercel preview while
      // the LIFF endpoint URL doesn't match). Don't crash the app.
      console.warn('[liff] init failed:', err)
      return { ready: false, inClient: false }
    }
  })()
  return initPromise
}

export function isInLiff(): boolean {
  return !!liffInstance && liffInstance.isInClient()
}

export function isLoggedInLine(): boolean {
  return !!liffInstance && liffInstance.isLoggedIn()
}

// Triggers the in-app LINE auth flow. Outside LIFF, opens the LINE login
// web page in a new tab. Inside LIFF, it's a silent native handoff.
export function lineLogin(redirectUri?: string): void {
  if (!liffInstance) return
  liffInstance.login(redirectUri ? { redirectUri } : undefined)
}

export function lineLogout(): void {
  if (!liffInstance) return
  try { liffInstance.logout() } catch {}
}

export function getLineAccessToken(): string | null {
  if (!liffInstance) return null
  return liffInstance.getAccessToken()
}

export async function getLineProfile() {
  if (!liffInstance) return null
  try { return await liffInstance.getProfile() } catch { return null }
}

// Convenience for the "close webapp to go back to chat" UX inside LIFF.
export function closeLiffWindow(): void {
  if (liffInstance && liffInstance.isInClient()) liffInstance.closeWindow()
}

// Opens LINE's native "send to…" sheet so the user can pick a friend
// or group to share `text` with. Works both inside LIFF (LINE app) and
// in a regular browser (LINE will prompt the user to log in first).
//
// Returns:
//   { ok: true }                   — message sent
//   { ok: false, code:'cancelled' } — user dismissed the picker
//   { ok: false, code:'unavailable' } — LIFF not ready / share permission denied
//   { ok: false, code:'error', error } — anything else
//
// We don't throw; the call site renders an inline toast instead.
export async function shareViaLine(text: string): Promise<
  | { ok: true }
  | { ok: false; code: 'cancelled' | 'unavailable' | 'error'; error?: string }
> {
  if (!liffInstance) return { ok: false, code: 'unavailable' }
  if (!liffInstance.isApiAvailable('shareTargetPicker')) {
    return { ok: false, code: 'unavailable' }
  }
  try {
    const res = await liffInstance.shareTargetPicker(
      [{ type: 'text', text }],
      // isMultiple controls the "you can pick multiple recipients" UI;
      // most users sharing a payslip pick a single person/group so the
      // multi-picker would be noisy. Default false.
      { isMultiple: false }
    )
    // shareTargetPicker resolves to null if the user dismissed without
    // selecting; resolves to { status: 'success' } on send.
    if (res?.status === 'success') return { ok: true }
    return { ok: false, code: 'cancelled' }
  } catch (err: any) {
    return { ok: false, code: 'error', error: err?.message }
  }
}
