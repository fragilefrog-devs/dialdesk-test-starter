import { timingSafeEqual } from 'node:crypto'
import { env } from './env'

/** Constant-time check of the shared secret used by the voice gateway. */
export function isInternalRequest(req: Request): boolean {
  const given = Buffer.from(req.headers.get('x-internal-secret') ?? '')
  const want = Buffer.from(env().INTERNAL_API_SECRET)
  return given.length === want.length && timingSafeEqual(given, want)
}
