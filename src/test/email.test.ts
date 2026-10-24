import { beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'

const mocks = vi.hoisted(() => ({ send: vi.fn() }))

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: mocks.send }
  },
}))
vi.mock('@/lib/env', () => ({
  emailEnv: () => ({ RESEND_API_KEY: 'test-key', EMAIL_FROM: 'DialDesk <mail@example.test>' }),
}))

import { sendEmail } from '@/lib/email'
import {
  parseConsentedEmail,
  renderEmail,
  renderOwnerNotificationEmail,
  type OwnerNotification,
} from '@/lib/email-templates'

const authEmailConfig = readFileSync(new URL('../../supabase/config.toml', import.meta.url), 'utf8')

describe('email templates', () => {
  it('registers every local Supabase Auth template with an existing HTML file', () => {
    const paths = [...authEmailConfig.matchAll(/content_path\s*=\s*"([^"]+)"/g)].map((match) => match[1])
    expect(paths).toHaveLength(13)
    for (const path of paths) {
      expect(existsSync(new URL(`../../${path.replace(/^\.\//, '')}`, import.meta.url))).toBe(true)
    }
  })

  it('escapes invitation details and includes both HTML and plain text', () => {
    const message = renderEmail({
      kind: 'team-invite',
      inviterEmail: 'owner"><script>alert(1)</script>@example.test',
      organizationName: 'North & South <Plumbing>',
      inviteUrl: 'https://app.example.test/invite/abc?x=1&y=2',
    })

    expect(message.subject).toBe('North & South <Plumbing> invited you to DialDesk')
    expect(message.html).toContain('North &amp; South &lt;Plumbing&gt;')
    expect(message.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(message.html).not.toContain('<script>alert(1)</script>')
    expect(message.html).toContain('x=1&amp;y=2')
    expect(message.text).toContain('https://app.example.test/invite/abc?x=1&y=2')
  })

  it('renders a caller confirmation with the actual arrival window and no exact-time promise', () => {
    const message = renderEmail({
      kind: 'booking-confirmation',
      organizationName: 'North & South Plumbing',
      callerName: 'Morgan <Lee>',
      callbackNumber: '+17735550142',
      address: '17 Oak Street',
      postcode: '60614',
      issue: 'Kitchen drain blocked',
      service: 'Drain cleaning',
      date: '2026-10-27',
      arrivalWindow: '8 AM to 12 PM',
      timezone: 'America/Chicago',
    })

    expect(message.html).toContain('Morgan &lt;Lee&gt;')
    expect(message.html).toContain('8 AM to 12 PM (America/Chicago)')
    expect(message.text).toContain('A technician will arrive during the arrival window, not at a guaranteed exact time.')
  })

  it('renders owner alerts with escaped caller-provided details', () => {
    const notification: OwnerNotification = {
      kind: 'lead',
      callerName: '<img src=x>',
      callbackNumber: '+17735550142',
      intent: 'Repair request',
      summary: 'Leak <urgent>',
      address: '17 Oak Street',
      postcode: '60614',
      issue: 'Pipe leak',
      urgency: 'same_day',
    }

    const message = renderOwnerNotificationEmail(notification)
    expect(message.subject).toBe('New message: <img src=x>')
    expect(message.html).toContain('&lt;img src=x&gt;')
    expect(message.html).toContain('Leak &lt;urgent&gt;')
    expect(message.text).toContain('Callback number: +17735550142')
  })
})

describe('booking confirmation consent', () => {
  it('accepts and normalizes email only with explicit consent', () => {
    expect(parseConsentedEmail('  Caller@Example.com ', true)).toEqual({ email: 'caller@example.com' })
    expect(parseConsentedEmail('caller@example.com', false)).toEqual({ email: null })
    expect(parseConsentedEmail('caller@example.com', 'true')).toEqual({ email: null })
  })

  it('requires a valid address when confirmation consent is given', () => {
    expect(parseConsentedEmail('', true).error).toBeTruthy()
    expect(parseConsentedEmail('not-an-email', true).error).toBeTruthy()
    expect(parseConsentedEmail('a'.repeat(250) + '@example.com', true).error).toBeTruthy()
  })
})

describe('Resend delivery', () => {
  beforeEach(() => {
    mocks.send.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('returns success only when Resend returns a message id', async () => {
    mocks.send.mockResolvedValue({ data: { id: 'email-1' }, error: null })
    await expect(sendEmail('caller@example.test', { subject: 'Subject', html: '<p>Body</p>', text: 'Body' })).resolves.toBe(true)
  })

  it('reports a provider error instead of treating it as success', async () => {
    mocks.send.mockResolvedValue({ data: null, error: { message: 'Rejected' } })
    await expect(sendEmail('caller@example.test', { subject: 'Subject', html: '<p>Body</p>', text: 'Body' })).resolves.toBe(false)
    expect(console.error).toHaveBeenCalled()
  })

  it('reports network exceptions instead of swallowing them as success', async () => {
    mocks.send.mockRejectedValue(new Error('Network unavailable'))
    await expect(sendEmail('caller@example.test', { subject: 'Subject', html: '<p>Body</p>', text: 'Body' })).resolves.toBe(false)
    expect(console.error).toHaveBeenCalled()
  })
})
