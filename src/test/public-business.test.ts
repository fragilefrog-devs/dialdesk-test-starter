import { describe, expect, it } from 'vitest'
import { formatBusinessHours, publicServices } from '@/lib/public-business'

describe('public business details', () => {
  it('formats stored local hours and labels missing days as closed', () => {
    expect(formatBusinessHours({ mon: ['09:00', '17:00'], sat: ['08:30', '12:00'] })).toEqual([
      { day: 'Monday', hours: '9:00 AM – 5:00 PM' },
      { day: 'Tuesday', hours: 'Closed' },
      { day: 'Wednesday', hours: 'Closed' },
      { day: 'Thursday', hours: 'Closed' },
      { day: 'Friday', hours: 'Closed' },
      { day: 'Saturday', hours: '8:30 AM – 12:00 PM' },
      { day: 'Sunday', hours: 'Closed' },
    ])
  })

  it('does not invent hours or services when data is absent or malformed', () => {
    expect(formatBusinessHours(null)).toEqual([])
    expect(formatBusinessHours({ mon: ['not-a-time', '17:00'] })).toEqual([])
    expect(formatBusinessHours({})).toEqual([])
    expect(publicServices(null)).toEqual([])
    expect(publicServices([' Leak repair ', '', null, 42])).toEqual(['Leak repair'])
  })
})
