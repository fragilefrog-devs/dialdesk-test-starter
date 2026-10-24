import { describe, expect, it } from 'vitest'
import { domainsWithAppHost, normalizeDomain, parseDomains, refererAllowed, WIDGET_ACCENT_RE, WIDGET_TOKEN_RE } from '@/lib/widget'
import { parseCallMeta } from '@/lib/vapi-parse'

describe('widget domains', () => {
  it('normalizes URLs to hostnames', () => {
    expect(normalizeDomain('https://www.Example.com:8080/contact?x=1')).toBe('www.example.com')
    expect(normalizeDomain('alderstreetplumbing.com.')).toBe('alderstreetplumbing.com')
    expect(normalizeDomain('localhost')).toBe('localhost')
  })
  it('rejects things that are not hostnames', () => {
    for (const bad of ['', 'no spaces.com', 'nodot', '-bad.com', 'a..com', '*.example.com', 'http://']) expect(normalizeDomain(bad)).toBeNull()
  })
  it('parses and de-duplicates lists', () => {
    expect(parseDomains('example.com, https://Example.com/x\nshop.example.org nonsense')).toEqual(['example.com', 'shop.example.org'])
  })
  it('includes the app hostname in widget domains by default', () => {
    expect(domainsWithAppHost('example.com', 'https://app.dialdesk.test/dashboard')).toEqual(['example.com', 'app.dialdesk.test'])
    expect(domainsWithAppHost('app.dialdesk.test', 'https://app.dialdesk.test')).toEqual(['app.dialdesk.test'])
  })
  it('accepts only six-digit hex colors for the widget accent', () => {
    expect(WIDGET_ACCENT_RE.test('#6657e8')).toBe(true)
    expect(WIDGET_ACCENT_RE.test('#FFFFFF')).toBe(true)
    expect(WIDGET_ACCENT_RE.test('red')).toBe(false)
    expect(WIDGET_ACCENT_RE.test('#abc')).toBe(false)
    expect(WIDGET_ACCENT_RE.test('#123456; color: red')).toBe(false)
  })
})

describe('referer check', () => {
  const allowed = ['example.com']
  it('allows listed domains and subdomains', () => {
    expect(refererAllowed('https://example.com/', allowed, 'app.dialdesk.test')).toBe(true)
    expect(refererAllowed('https://www.example.com/page', allowed, 'app.dialdesk.test')).toBe(true)
  })
  it('allows the app itself for the dashboard preview', () => {
    expect(refererAllowed('https://app.dialdesk.test/dashboard/widget-setup', [], 'app.dialdesk.test')).toBe(true)
  })
  it('blocks other sites, look-alikes, missing and malformed referers', () => {
    expect(refererAllowed('https://evil.com/', allowed, 'app.dialdesk.test')).toBe(false)
    expect(refererAllowed('https://notexample.com/', allowed, 'app.dialdesk.test')).toBe(false)
    expect(refererAllowed('https://example.com.evil.com/', allowed, 'app.dialdesk.test')).toBe(false)
    expect(refererAllowed(null, allowed, 'app.dialdesk.test')).toBe(false)
    expect(refererAllowed('not a url', allowed, 'app.dialdesk.test')).toBe(false)
  })
  it('validates the token format', () => {
    expect(WIDGET_TOKEN_RE.test('a'.repeat(32))).toBe(true)
    expect(WIDGET_TOKEN_RE.test('short')).toBe(false)
    expect(WIDGET_TOKEN_RE.test('A'.repeat(32))).toBe(false)
  })
})

describe('web calls', () => {
  it('flags web calls from the call type', () => {
    expect(parseCallMeta({ call: { id: 'c', assistantId: 'a', type: 'webCall' } }).isWeb).toBe(true)
    expect(parseCallMeta({ call: { id: 'c', assistantId: 'a', type: 'inboundPhoneCall' } }).isWeb).toBe(false)
  })
})
