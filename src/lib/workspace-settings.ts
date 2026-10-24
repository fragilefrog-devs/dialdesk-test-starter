export const INDUSTRY_OPTIONS = [
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'hvac', label: 'Heating and cooling (HVAC)' },
  { value: 'plumbing_hvac', label: 'Plumbing and HVAC' },
] as const

const US_TIME_ZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
]

export function getTimeZoneOptions() {
  const available = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : ['UTC']
  return {
    us: US_TIME_ZONES,
    other: available.filter((timezone) => !US_TIME_ZONES.includes(timezone)),
  }
}
