import { describe, expect, it } from 'vitest'
import {
  bestOutcome, cleanWindows, inServiceArea, isOfficeOpen, normalizePostcode, parseList, windowsForDate, windowLabel,
} from '@/lib/trades'
import { toE164 } from '@/ai/tools'

const HOURS = { mon: ['07:30', '17:00'], tue: ['07:30', '17:00'], wed: ['07:30', '17:00'], thu: ['07:30', '17:00'], fri: ['07:30', '17:00'] } as Record<string, [string, string]>
const WINDOWS = cleanWindows([['08:00', '12:00'], ['12:00', '16:00']])

describe('service area', () => {
  it('accepts everything when no postcodes are set', () => expect(inServiceArea([], '99999')).toBe(true))
  it('matches ZIP and ZIP+4 and ignores spacing', () => {
    expect(inServiceArea(['60614'], '60614-1234')).toBe(true)
    expect(inServiceArea(['SW1A 1AA'], 'sw1a1aa')).toBe(true)
  })
  it('rejects outside and empty postcodes', () => {
    expect(inServiceArea(['60614'], '60657')).toBe(false)
    expect(inServiceArea(['60614'], '')).toBe(false)
  })
  it('normalizes and de-duplicates lists', () => {
    expect(normalizePostcode('60614-1234')).toBe('60614')
    expect(parseList('60614, 60657\n60614;', 10)).toEqual(['60614', '60657'])
  })
})

describe('arrival windows', () => {
  it('drops invalid windows and sorts the rest', () => {
    expect(cleanWindows([['12:00', '16:00'], ['09:00', '08:00'], ['08:00', '12:00'], ['x', 'y'], 'bad'])).toEqual([['08:00', '12:00'], ['12:00', '16:00']])
  })
  it('labels in spoken form', () => expect(windowLabel(['08:00', '12:00'])).toBe('8 AM to 12 PM'))
  it('offers windows on an open day in the business timezone', () => {
    const now = new Date('2026-10-26T05:00:00Z') // Mon 00:00 in Chicago
    const slots = windowsForDate('2026-10-26', WINDOWS, HOURS, 'America/Chicago', now)
    expect(slots.map((s) => s.start_local)).toEqual(['2026-10-26T08:00', '2026-10-26T12:00'])
    expect(slots[0].startsAt.toISOString()).toBe('2026-10-26T13:00:00.000Z') // CDT is UTC-5
  })
  it('offers nothing on a closed day or for past windows', () => {
    const now = new Date('2026-10-26T05:00:00Z')
    expect(windowsForDate('2026-10-25', WINDOWS, HOURS, 'America/Chicago', now)).toEqual([]) // Sunday
    const late = new Date('2026-10-26T20:00:00Z')
    expect(windowsForDate('2026-10-26', WINDOWS, HOURS, 'America/Chicago', late)).toEqual([])
  })
  it('skips windows that start inside the lead time', () => {
    const now = new Date('2026-10-26T12:30:00Z') // 07:30 Chicago; 08:00 window is 30 min away
    expect(windowsForDate('2026-10-26', WINDOWS, HOURS, 'America/Chicago', now).map((s) => s.start_local)).toEqual(['2026-10-26T12:00'])
  })
  it('reports whether the office is open', () => {
    expect(isOfficeOpen(HOURS, 'America/Chicago', new Date('2026-10-26T15:00:00Z')).open).toBe(true)
    expect(isOfficeOpen(HOURS, 'America/Chicago', new Date('2026-10-26T04:00:00Z')).open).toBe(false)
  })
})

describe('outcomes and phone numbers', () => {
  it('never downgrades an emergency', () => {
    expect(bestOutcome('emergency_escalated', 'lead_captured')).toBe('emergency_escalated')
    expect(bestOutcome('lead_captured', 'booked')).toBe('booked')
    expect(bestOutcome(null, 'info_only')).toBe('info_only')
  })
  it('converts callback numbers to E.164', () => {
    expect(toE164('(773) 555-0142', null)).toBe('+17735550142')
    expect(toE164('773 555 0142', '+17735550142')).toBe('+17735550142')
    expect(toE164('+44 20 7946 0958', null)).toBe('+442079460958')
    expect(toE164('12345', null)).toBeNull()
  })
})
