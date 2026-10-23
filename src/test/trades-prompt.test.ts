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
  it('discloses it is an AI and never quotes prices', () => {
    const p = buildSystemPrompt(org, agent)
    expect(p).toContain('You are an AI assistant')
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
    expect(buildSystemPrompt(org, agent)).toContain('transfer the caller to the on-call technician')
    const off = buildSystemPrompt(org, { ...agent, emergency_service: false })
    expect(off).toContain('Emergency dispatch is OFF')
    expect(off).not.toContain('transfer the caller to the on-call technician')
  })
  it('adds a recording notice only when recording is on', () => {
    expect(buildFirstMessage(org, agent)).toContain('may be recorded')
    expect(buildFirstMessage(org, { ...agent, record_consent_notice: false })).not.toContain('recorded')
  })
  it('describes transfer destinations for the model', () => {
    expect(transferDestinations(agent).map((d) => d.number)).toEqual(['+15550000002', '+15550000001'])
    expect(transferDestinations({ ...agent, oncall_number: null, transfer_number: null })).toEqual([])
  })
})
