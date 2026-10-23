import { after } from 'next/server'

/** Runs work after the response is sent (so tool calls stay fast); falls back to fire-and-forget outside a request. */
export function runAfter(fn: () => Promise<unknown>) {
  const safe = () => fn().catch((e) => console.error('[after]', e))
  try { after(safe) } catch { void safe() }
}
