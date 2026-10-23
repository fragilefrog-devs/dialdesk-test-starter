import { dayKey, zonedToUtc } from './time'

/** Pure trades helpers: service area, arrival windows, hazards, call outcomes. */

export type Urgency = 'emergency' | 'same_day' | 'routine'
export type Outcome = 'booked' | 'emergency_escalated' | 'lead_captured' | 'info_only' | 'spam' | 'abandoned'
export type Hazard = 'gas' | 'co' | 'flood' | 'sewage' | 'electrical' | 'no_heat' | 'no_cooling' | 'other'

export const HAZARDS: readonly Hazard[] = ['gas', 'co', 'flood', 'sewage', 'electrical', 'no_heat', 'no_cooling', 'other']

/** Hazards where the caller's safety comes before anything else on the call. */
export const LIFE_SAFETY_HAZARDS: ReadonlySet<Hazard> = new Set<Hazard>(['gas', 'co', 'electrical'])

export const SAFETY_SCRIPT =
  'If you smell gas, hear a carbon monoxide alarm, or see sparks or smoke, leave the building now, ' +
  'and call your local emergency number or your gas utility from outside. Please do that first.'

/** Higher rank wins when several tools fire on one call. */
const OUTCOME_RANK: Record<Outcome, number> = {
  emergency_escalated: 5, booked: 4, lead_captured: 3, info_only: 2, spam: 1, abandoned: 0,
}
export const bestOutcome = (current: Outcome | null | undefined, next: Outcome): Outcome =>
  !current || OUTCOME_RANK[next] > OUTCOME_RANK[current] ? next : current

/** "60614-1234" -> "60614"; other postcodes are compared upper-cased without spaces or dashes. */
export function normalizePostcode(raw: string): string {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return /^\d{9}$/.test(cleaned) ? cleaned.slice(0, 5) : cleaned
}

export function parseList(raw: string, max: number, itemMax = 80): string[] {
  const seen = new Set<string>()
  for (const part of raw.split(/[\n,;]+/)) {
    const v = part.trim().slice(0, itemMax)
    if (v) seen.add(v)
    if (seen.size >= max) break
  }
  return [...seen]
}

/** An empty list means "we serve everywhere" so a new tenant is never locked out by default. */
export function inServiceArea(zips: string[], postcode: string): boolean {
  if (!zips.length) return true
  const want = normalizePostcode(postcode)
  return want.length > 0 && zips.some((z) => normalizePostcode(z) === want)
}

export type ArrivalWindow = [string, string]
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

export function cleanWindows(input: unknown): ArrivalWindow[] {
  if (!Array.isArray(input)) return []
  const out: ArrivalWindow[] = []
  for (const w of input) {
    if (Array.isArray(w) && typeof w[0] === 'string' && typeof w[1] === 'string' && TIME_RE.test(w[0]) && TIME_RE.test(w[1]) && w[0] < w[1]) {
      out.push([w[0], w[1]])
    }
  }
  return out.sort((a, b) => a[0].localeCompare(b[0])).slice(0, 4)
}

const clock = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${suffix}`
}
export const windowLabel = (w: ArrivalWindow) => `${clock(w[0])} to ${clock(w[1])}`

export interface WindowSlot {
  start_local: string   // YYYY-MM-DDTHH:mm, what book_job expects
  label: string         // spoken label
  startsAt: Date
  endsAt: Date
}

/**
 * Arrival windows for a date in the business timezone. Closed days (no office hours) have none.
 * Windows that start within `leadMinutes` of `now` are not offered.
 */
export function windowsForDate(
  date: string, windows: ArrivalWindow[], officeHours: Record<string, [string, string]> | null | undefined,
  tz: string, now: Date = new Date(), leadMinutes = 60,
): WindowSlot[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return []
  if (!officeHours?.[dayKey(date)]) return []
  return windows
    .map((w) => ({ w, startsAt: zonedToUtc(date, w[0], tz), endsAt: zonedToUtc(date, w[1], tz) }))
    .filter(({ startsAt }) => startsAt.getTime() >= now.getTime() + leadMinutes * 60000)
    .map(({ w, startsAt, endsAt }) => ({ start_local: `${date}T${w[0]}`, label: windowLabel(w), startsAt, endsAt }))
}

export function isOfficeOpen(officeHours: Record<string, [string, string]> | null | undefined, tz: string, now: Date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).reduce<Record<string, string>>((a, p) => ((a[p.type] = p.value), a), {})
  const date = `${parts.year}-${parts.month}-${parts.day}`
  const hhmm = `${parts.hour}:${parts.minute}`
  const today = officeHours?.[dayKey(date)]
  return { date, hhmm, hoursToday: today ?? null, open: !!today && hhmm >= today[0] && hhmm < today[1] }
}

export const URGENCIES: readonly Urgency[] = ['emergency', 'same_day', 'routine']
export const asUrgency = (v: unknown): Urgency | null => (URGENCIES as readonly unknown[]).includes(v) ? (v as Urgency) : null
export const asHazard = (v: unknown): Hazard => (HAZARDS as readonly unknown[]).includes(v) ? (v as Hazard) : 'other'
