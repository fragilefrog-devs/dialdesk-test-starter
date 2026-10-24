import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const nextConfig = readFileSync(new URL('../../next.config.mjs', import.meta.url), 'utf8').replace(/\r\n/g, '\n')

describe('business page microphone permissions', () => {
  it('does not inherit the default microphone denial and grants the embedded call frame access', () => {
    expect(nextConfig).toContain("source: '/((?!embed/|business/).*)'")
    expect(nextConfig).toMatch(/source:\s*'\/business\/:path\*'[\s\S]*?microphone=\(self\)/)
    expect(nextConfig).toMatch(/source:\s*'\/embed\/:path\*'[\s\S]*?microphone=\(self\)/)
  })
})
