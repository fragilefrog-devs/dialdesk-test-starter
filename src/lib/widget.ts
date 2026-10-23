/** Pure helpers for the website widget: which sites may embed a business's voice assistant. */

const HOST_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/

/** "https://www.Example.com:8080/page" -> "www.example.com". Returns null for anything that is not a hostname. */
export function normalizeDomain(raw: string): string | null {
  const v = raw.trim().toLowerCase().replace(/^[a-z][a-z0-9+.-]*:\/\//, '').split(/[/?#]/)[0].replace(/:\d+$/, '').replace(/\.$/, '')
  if (v === 'localhost') return v
  return HOST_RE.test(v) ? v : null
}

export function parseDomains(raw: string, max = 20): string[] {
  const out = new Set<string>()
  for (const part of raw.split(/[\s,;]+/)) {
    const d = normalizeDomain(part)
    if (d) out.add(d)
    if (out.size >= max) break
  }
  return [...out]
}

/** A listed domain covers itself and its subdomains. The app's own host is always allowed (dashboard preview). */
export function refererAllowed(referer: string | null, allowed: string[], ownHost: string): boolean {
  if (!referer) return false
  let host: string
  try { host = new URL(referer).hostname.toLowerCase() } catch { return false }
  if (host === ownHost.toLowerCase()) return true
  return allowed.some((d) => host === d || host.endsWith(`.${d}`))
}

export const WIDGET_TOKEN_RE = /^[a-f0-9]{32}$/
