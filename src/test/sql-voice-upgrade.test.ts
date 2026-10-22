import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const migrationPath = fileURLToPath(
  new URL('../../supabase/migrations/20261022_voice_finalization.sql', import.meta.url),
)
const schemaPath = fileURLToPath(new URL('../../supabase/schema.sql', import.meta.url))

const readMigration = () => readFileSync(migrationPath, 'utf8')
const readSchema = () => readFileSync(schemaPath, 'utf8')

const FINALIZE_MARKER = 'create or replace function public.finalize_call('

/** The parameter list of finalize_call, from the marker up to the closing paren. */
function parameterList(sql: string): string {
  const start = sql.indexOf(FINALIZE_MARKER)
  expect(start).toBeGreaterThanOrEqual(0)
  const rest = sql.slice(start + FINALIZE_MARKER.length)
  const end = rest.indexOf(')')
  expect(end).toBeGreaterThanOrEqual(0)
  return rest.slice(0, end)
}

/** The finalize_call body, from its declaration up to the closing `$$;`. */
function finalizeBlock(sql: string): string {
  const start = sql.indexOf(FINALIZE_MARKER)
  expect(start).toBeGreaterThanOrEqual(0)
  const end = sql.indexOf('$$;', start)
  expect(end).toBeGreaterThan(start)
  return sql.slice(start, end + '$$;'.length)
}

/** The `public.calls` create-table block, which is where a status CHECK would live. */
function callsTableBlock(sql: string): string {
  const start = sql.indexOf('create table if not exists public.calls')
  expect(start).toBeGreaterThanOrEqual(0)
  const end = sql.indexOf('\n);', start)
  expect(end).toBeGreaterThan(start)
  return sql.slice(start, end)
}

describe('voice finalization migration', () => {
  it('exists and adds the three finalization columns additively', () => {
    expect(existsSync(migrationPath)).toBe(true)
    const migration = readMigration()

    expect(migration).toContain('add column if not exists finalized_at')
    expect(migration).toContain('finalize_attempts')
    expect(migration).toContain('end_reason')
  })

  it('declares finalize_call with the exact five parameters in order', () => {
    const params = [
      'p_org uuid',
      'p_call uuid',
      'p_transcript jsonb',
      'p_duration_seconds integer',
      'p_end_reason text',
    ]
    const list = parameterList(readMigration())

    const positions = params.map((param) => list.indexOf(param))
    for (const position of positions) expect(position).toBeGreaterThanOrEqual(0)
    expect(new Set(positions).size).toBe(params.length)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
    // No extra or renamed parameters hiding after the five we expect.
    expect(list.replace(/\s+/g, ' ').trim()).toBe(params.join(', '))
  })

  it('returns table (finalized boolean)', () => {
    expect(readMigration()).toContain('returns table (finalized boolean)')
  })

  it('runs as security definer with a pinned search_path', () => {
    const block = finalizeBlock(readMigration())

    expect(block).toMatch(/security\s+definer/i)
    expect(block).toMatch(/set\s+search_path\s*=\s*public/i)
  })

  it('filters by id and org_id and short-circuits already finalized calls', () => {
    const block = finalizeBlock(readMigration())

    expect(block).toMatch(
      /where\s+c\.id\s*=\s*p_call\s+and\s+c\.org_id\s*=\s*p_org/i,
    )
    expect(block).toMatch(/finalized_at\s+is\s+not\s+null/i)
    expect(block).toMatch(/return\s+query\s+select\s+false/i)
  })

  it('is executable only by service_role', () => {
    const migration = readMigration()

    expect(migration).toMatch(
      /revoke all on function public\.finalize_call\(uuid, uuid, jsonb, integer, text\)\s+from public, anon, authenticated;/i,
    )
    expect(migration).toMatch(
      /grant execute on function public\.finalize_call\(uuid, uuid, jsonb, integer, text\)\s+to service_role;/i,
    )

    const grants = migration.match(/grant\s+execute[\s\S]*?;/gi) ?? []
    const finalizeGrants = grants.filter((grant) => /finalize_call/i.test(grant))
    expect(finalizeGrants).toHaveLength(1)
    expect(finalizeGrants[0]).toMatch(/to\s+service_role/i)
  })

  it('contains no destructive or constraint-changing DDL', () => {
    const migration = readMigration().toLowerCase()

    for (const forbidden of [
      'drop column',
      'alter column',
      'drop table',
      'add constraint',
      'calls_status_check',
    ]) {
      expect(migration).not.toContain(forbidden)
    }
  })

  it('guards every add column with if not exists', () => {
    const addColumnLines = readMigration()
      .split(/\r?\n/)
      .filter((line) => /\badd\s+column\b/i.test(line))

    expect(addColumnLines).toHaveLength(3)
    for (const line of addColumnLines) {
      expect(line).toMatch(/\badd\s+column\s+if\s+not\s+exists\b/i)
    }
  })
})

describe('schema.sql stays compatible', () => {
  it('keeps the existing calls.status default and gains the finalization surface', () => {
    const schema = readSchema()

    expect(schema).toContain("status text not null default 'in_progress'")
    expect(schema).toContain('finalized_at')
    expect(schema).toContain('finalize_attempts')
    expect(schema).toContain('end_reason')
    expect(schema).toContain('function public.finalize_call')
  })

  it('adds all three columns inside the calls table DDL', () => {
    const calls = callsTableBlock(readSchema())

    expect(calls).toMatch(/finalized_at\s+timestamp with time zone/i)
    expect(calls).toMatch(/finalize_attempts\s+integer\s+not\s+null\s+default\s+0/i)
    expect(calls).toMatch(/\bend_reason\s+text\b/i)
  })

  it('has no status CHECK on calls in either file', () => {
    // Scoped to the calls table on purpose: leads/appointments legitimately have
    // their own status CHECK constraints.
    expect(callsTableBlock(readSchema())).not.toMatch(
      /\bcheck\s*\([^)]*\bstatus\b/i,
    )
    expect(readMigration()).not.toMatch(/\bcheck\s*\([^)]*\bstatus\b/i)
  })
})
