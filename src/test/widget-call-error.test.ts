import { describe, expect, it } from 'vitest'
import { widgetCallErrorMessage } from '@/lib/widget-call-error'

describe('voice widget call errors', () => {
  it('explains denied microphone access from direct and Vapi-wrapped errors', () => {
    const expected = 'Microphone access is blocked. Allow microphone access for this site, then try again.'
    expect(widgetCallErrorMessage({ name: 'NotAllowedError', message: 'Permission denied' })).toBe(expected)
    expect(widgetCallErrorMessage({ type: 'start-method-error', error: { name: 'NotAllowedError', message: 'Permission denied' } })).toBe(expected)
  })

  it('distinguishes a missing or busy microphone from other call errors', () => {
    expect(widgetCallErrorMessage({ name: 'NotFoundError', message: 'No audio input device' }))
      .toBe('No microphone was found. Connect a microphone and try again.')
    expect(widgetCallErrorMessage({ name: 'NotReadableError', message: 'Device already in use' }))
      .toBe('The microphone is unavailable or in use by another app. Close other audio apps and try again.')
    expect(widgetCallErrorMessage(new Error('Unknown failure'))).toBe('The call could not continue. Please try again.')
  })
})
