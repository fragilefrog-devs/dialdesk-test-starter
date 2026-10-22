/** Only allow same-site relative paths (blocks open redirects like //evil.com or https://evil.com). */
export const safeNext = (v: string | null | undefined, fallback = '/dashboard') =>
  v && v.startsWith('/') && !v.startsWith('//') && !v.includes('\\') ? v : fallback
