import { createHmac } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const STRIP = [
  'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PRICE_STARTER',
  'STRIPE_PRICE_GROWTH', 'STRIPE_PRICE_SCALE', 'RESEND_API_KEY', 'EMAIL_FROM',
]
const KEYS = [...STRIP, 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'NEXT_PUBLIC_APP_URL']
const original: Record<string, string | undefined> = {}

beforeAll(() => {
  for (const key of KEYS) original[key] = process.env[key]
  for (const key of STRIP) delete process.env[key]
  Object.assign(process.env, {
    TWILIO_ACCOUNT_SID: 'AC123',
    TWILIO_AUTH_TOKEN: 'twilio-test-token',
    NEXT_PUBLIC_APP_URL: 'https://app.test',
  })
})

afterAll(() => {
  for (const key of KEYS) {
    if (original[key] === undefined) delete process.env[key]
    else process.env[key] = original[key]
  }
})

describe('twilio env scope', () => {
  it('imports and validates signatures without billing credentials', async () => {
    vi.resetModules()
    const { validateTwilioSignature } = await import('@/lib/twilio')

    expect(validateTwilioSignature('http://x', {}, null)).toBe(false)

    const url = 'https://app.test/api/webhooks/twilio/voice'
    const params: Record<string, string> = { CallSid: 'CA1', To: '+15550000000' }
    const data = url + Object.keys(params).sort().map((k) => k + params[k]).join('')
    const signature = createHmac('sha1', 'twilio-test-token').update(data).digest('base64')
    expect(validateTwilioSignature(url, params, signature)).toBe(true)
  })
})
