const BUSINESS_DAYS = [
  ['mon', 'Monday'],
  ['tue', 'Tuesday'],
  ['wed', 'Wednesday'],
  ['thu', 'Thursday'],
  ['fri', 'Friday'],
  ['sat', 'Saturday'],
  ['sun', 'Sunday'],
] as const

const CLOCK_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/
const clockFormatter = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'UTC',
})

function formatClock(value: unknown): string | null {
  if (typeof value !== 'string' || !CLOCK_RE.test(value)) return null
  return clockFormatter.format(new Date(`1970-01-01T${value}:00Z`))
}

export function formatBusinessHours(value: unknown): { day: string; hours: string }[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []

  const hoursByDay = value as Record<string, unknown>
  const hasPostedHours = BUSINESS_DAYS.some(([key]) => {
    const range = hoursByDay[key]
    return Array.isArray(range) && range.length === 2 && range.every((time) => formatClock(time) !== null)
  })
  if (!hasPostedHours) return []

  return BUSINESS_DAYS.map(([key, day]) => {
    const range = hoursByDay[key]
    if (!Array.isArray(range) || range.length !== 2) return { day, hours: 'Closed' }
    const [start, end] = range.map(formatClock)
    return { day, hours: start && end ? `${start} – ${end}` : 'Closed' }
  })
}

export function publicServices(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((service): service is string => typeof service === 'string' && service.trim().length > 0)
    .map((service) => service.trim())
}
