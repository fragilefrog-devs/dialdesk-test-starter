import { createHmac, timingSafeEqual } from 'node:crypto'
import { internalEnv } from './env'

/** Short-lived-by-design call capability: binds a callId to the server secret. */
export const signCall = (callId: string) =>
  createHmac('sha256', internalEnv().INTERNAL_API_SECRET).update('call:' + callId).digest('hex')

export function verifyCall(callId: string, token: string | null | undefined) {
  if (!token) return false
  const a = Buffer.from(signCall(callId)), b = Buffer.from(token)
  return a.length === b.length && timingSafeEqual(a, b)
}
