import { describe, expect, it } from 'vitest'
import { buildFirstMessage, buildSystemPrompt, transferDestinations, type AgentRow } from '@/lib/trades-prompt'

const agent: AgentRow = {
  id: 'a', org_id: 'o', name: 'Alder Street Receptionist', greeting: 'Thanks for calling Alder Street Plumbing.', voice: 'alloy', language: 'en',
  instructions: 'We do not service boilers.', business_hours: { mon: ['07:30', '17:00'] }, appointment_minutes: 30,
  transfer_number: '+15550000001', oncall_number: '+15550000002', notify_phone: null, notify_email: null, record_consent_notice: true,
  is_active: true, services: ['Drain cleaning', 'Water heater replacement'], service_zips: ['60614'],
  arrival_windows: [['08:00', '12:00'], ['12:00', '16:00']], jobs_per_window: 2, emergency_service: true, vapi_assistant_id: null,
}
const org = { name: 'Alder Street Plumbing', timezone: 'America/Chicago', industry: 'plumbing' }

describe('trades prompt', () => {
  it('identifies Riley as an AI assistant and never quotes prices', () => {
    const p = buildSystemPrompt(org, agent)
    expect(p).toContain('You are Riley')
    expect(p).toContain('identify yourself as the business’s AI virtual assistant in the opening greeting')
    expect(p).toContain('Never quote prices')
  })
  it('contains the safety script and the no-troubleshooting rule', () => {
    const p = buildSystemPrompt(org, agent)
    expect(p).toContain('leave the building now')
    expect(p).toContain('Never give repair or troubleshooting instructions for gas, electrical or carbon monoxide')
  })
  it('lists services, postcodes, windows and company instructions', () => {
    const p = buildSystemPrompt(org, agent)
    for (const s of ['Drain cleaning', '60614', '8 AM to 12 PM', 'We do not service boilers.']) expect(p).toContain(s)
  })
  it('routes emergencies to on-call only when emergency service is on', () => {
    const enabled = buildSystemPrompt(org, agent)
    expect(enabled).toContain('Call flag_emergency as soon as you know the hazard')
    expect(enabled).toContain('configured transfer after flag_emergency')
    const off = buildSystemPrompt(org, { ...agent, emergency_service: false })
    expect(off).toContain('Emergency dispatch is OFF')
    expect(off).not.toContain('configured transfer after flag_emergency')
  })
  it('asks permission before collecting an email confirmation address', () => {
    const prompt = buildSystemPrompt(org, agent)
    expect(prompt).toContain('offer an optional email confirmation')
    expect(prompt).toContain('Only collect an email address and set email_confirmation_consent to true if the caller clearly agrees')
    expect(prompt).toContain('Follow the book_job email_confirmation result exactly')
  })
  it('directs the assistant to book confirmed visits and use natural, concise speech', () => {
    const prompt = buildSystemPrompt(org, agent)
    expect(prompt).toContain('book a visit directly')
    expect(prompt).toContain('Set caller_confirmed to true only after that confirmation')
    expect(prompt).toContain('Sound conversational rather than scripted')
    expect(prompt).toContain('Respond to the caller’s actual last point')
    expect(prompt).toContain('never ask for them again')
    expect(prompt).toContain('Do not pretend to have human feelings, personal experiences, or a human identity')
    expect(prompt).toContain('Do not promise a callback')
  })
  it('gives Bangla callers natural Bengali-script speech and a localized disclosure', () => {
    const banglaAgent = { ...agent, language: 'bn', greeting: 'আল্ডার স্ট্রিট প্লাম্বিংয়ে কল করার জন্য ধন্যবাদ।' }
    const prompt = buildSystemPrompt(org, banglaAgent)
    expect(prompt).toContain('Bangla (বাংলা)')
    expect(prompt).toContain('Speak Bangla in Bengali script, not romanized transliteration')
    expect(prompt).toContain('respectful form "আপনি"')
    expect(buildFirstMessage(org, banglaAgent)).toBe(
      'আল্ডার স্ট্রিট প্লাম্বিংয়ে কল করার জন্য ধন্যবাদ। আমি রাইলি, Alder Street Plumbing-এর এআই ভার্চুয়াল সহকারী। এই কলটি রেকর্ড করা হতে পারে।',
    )
  })
  it('does not duplicate an AI disclosure already present in a Bangla greeting', () => {
    expect(buildFirstMessage(org, {
      ...agent,
      language: 'bn',
      greeting: 'আমি এআই ভার্চুয়াল সহকারী। কীভাবে সাহায্য করতে পারি?',
      record_consent_notice: false,
    })).toBe('আমি এআই ভার্চুয়াল সহকারী। কীভাবে সাহায্য করতে পারি?')
  })
  it('falls back to a message when a transfer is impossible (website calls)', () => {
    expect(buildSystemPrompt(org, agent)).toContain('including on website calls')
    expect(buildSystemPrompt(org, agent)).toContain('offer to take a message with capture_lead')
  })
  it('adds a recording notice only when recording is on', () => {
    expect(buildFirstMessage(org, agent)).toContain('may be recorded')
    expect(buildFirstMessage(org, { ...agent, record_consent_notice: false })).not.toContain('recorded')
  })
  it('adds an AI disclosure to the opening greeting without duplicating an existing one', () => {
    const greeting = buildFirstMessage(org, { ...agent, record_consent_notice: false })
    expect(greeting).toContain('I’m Riley, the AI virtual assistant for Alder Street Plumbing.')
    expect(buildFirstMessage(org, {
      ...agent,
      greeting: 'Thanks for calling. I am your virtual assistant.',
      record_consent_notice: false,
    })).toBe('Thanks for calling. I am your virtual assistant. I’m Riley, the AI virtual assistant for Alder Street Plumbing.')
  })
  it('uses only tools implemented by the receptionist', () => {
    const prompt = buildSystemPrompt(org, agent)
    for (const tool of ['flag_emergency', 'capture_lead', 'check_availability', 'book_job']) {
      expect(prompt).toContain(tool)
    }
    expect(prompt).not.toContain('escalateEmergency')
    expect(prompt).not.toContain('sendSummary')
  })
  it('describes transfer destinations for the model', () => {
    expect(transferDestinations(agent).map((d) => d.number)).toEqual(['+15550000002', '+15550000001'])
    expect(transferDestinations({ ...agent, oncall_number: null, transfer_number: null })).toEqual([])
  })
})
