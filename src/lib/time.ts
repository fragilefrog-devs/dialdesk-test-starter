/** Convert a wall-clock time in an IANA timezone to a UTC Date (DST-safe, no deps). */
export function zonedToUtc(date: string, time: string, tz: string): Date {
  const guess = new Date(`${date}T${time}:00Z`)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(guess).reduce<Record<string, string>>((a, p) => ((a[p.type] = p.value), a), {})
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second)
  const offset = asUtc - guess.getTime()
  return new Date(guess.getTime() - offset)
}

export const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
export const dayKey = (date: string) => DAY_KEYS[new Date(`${date}T12:00:00Z`).getUTCDay()]

export const nowInTz = (tz: string) =>
  new Intl.DateTimeFormat('en-US', { timeZone: tz, dateStyle: 'full', timeStyle: 'short' }).format(new Date())

export const localDate = (d: Date, tz: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
