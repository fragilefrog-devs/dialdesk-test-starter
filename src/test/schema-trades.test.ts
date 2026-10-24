import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const schema = read('supabase/schema.sql')
const migration = read('supabase/migrations/20261023_trades_vapi.sql')

const widgetMigration = read('supabase/migrations/20261024_web_widget.sql')
const widgetAppearanceMigration = read('supabase/migrations/20261024145100_widget_appearance.sql')
const emailMigration = read('supabase/migrations/20261024182000_email_notifications.sql')
describe('widget schema', () => {
  it('adds the widget columns and a unique token to the schema and the migration', () => {
    for (const sql of [schema, widgetMigration]) for (const c of ['widget_enabled', 'widget_domains', 'widget_token', 'agents_widget_token_key']) expect(sql).toContain(c)
    for (const sql of [schema, widgetAppearanceMigration]) for (const c of ['widget_label', 'widget_position', 'widget_accent']) expect(sql).toContain(c)
  })
})

describe('trades schema', () => {
  it('replaces the one-job-at-a-time overlap constraint with capacity booking', () => {
    expect(schema).not.toContain('add constraint appointments_no_overlap')
    expect(migration).toContain('drop constraint if exists appointments_no_overlap')
    for (const sql of [schema, migration]) {
      expect(sql).toContain('create or replace function public.book_trade_job(')
      expect(sql).toContain('pg_advisory_xact_lock')
    }
  })

  describe('booking email consent schema', () => {
    it('records confirmation consent on the appointment and passes it through the atomic booking function', () => {
      for (const sql of [schema, emailMigration]) {
        expect(sql).toContain('email_confirmation_consented_at timestamptz')
        expect(sql).toContain('p_email_confirmation_consented_at timestamptz')
        expect(sql).toContain('email_confirmation_consented_at\n  )')
      }
    })

    it('keeps the updated booking function service-role only', () => {
      expect(emailMigration).toMatch(/revoke all on function public\.book_trade_job\([\s\S]*from public, anon, authenticated/i)
      expect(emailMigration).toMatch(/grant execute on function public\.book_trade_job\([\s\S]*to service_role/i)
    })
  })
  it('keeps booking and finalization service-role only', () => {
    expect(schema).toMatch(/revoke all on function public\.book_trade_job[\s\S]*from public, anon, authenticated/)
    expect(schema).toMatch(/grant execute on function public\.book_trade_job[\s\S]*to service_role/)
  })
  it('adds the trades and Vapi columns in both the schema and the migration', () => {
    for (const col of ['vapi_assistant_id', 'service_zips', 'oncall_number', 'arrival_windows', 'jobs_per_window', 'emergency_service', 'recording_url', 'outcome']) {
      expect(schema).toContain(col)
      expect(migration).toContain(col)
    }
  })
  it('creates organizations with the trades defaults', () => {
    expect(schema).toContain('public.default_services(')
    expect(schema).toContain("provider text not null default 'vapi'")
  })
})
