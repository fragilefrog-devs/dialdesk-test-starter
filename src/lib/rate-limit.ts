// Minimal in-memory sliding window. Fine for a single instance; swap for Upstash/Redis
// before running multiple replicas (see docs/LAUNCH_CHECKLIST.md).
const hits = new Map<string, number[]>()
export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now()
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs)
  if (recent.length >= limit) { hits.set(key, recent); return false }
  recent.push(now); hits.set(key, recent)
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k)
  return true
}
export const clientIp = (req: Request) => req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
