# Task 04 — Additive SQL for idempotent finalization

## Goal
Add the columns and the `finalize_call` RPC that make transcript/duration finalization
idempotent and atomic, without altering or dropping anything that exists in production.

## Context you need
- `supabase/schema.sql:100-118` defines `public.calls` with `status text not null
  default 'in_progress'` and **no CHECK constraint**; live rows already contain
  `in-progress` and `no-answer`. A CHECK would fail on existing data and block updates.
- There is no migrations directory yet. `supabase/` contains only `schema.sql`.
- The app uses the Supabase **service role** key; RLS is bypassed there, but grants still
  apply to RPC execution, so the function must be executable by `service_role`.
- Task 05 will call this RPC from `src/lib/voice/session.ts`; the exact signature below is
  binding.
- Idempotency requirement (D9): re-finalizing must not overwrite an existing transcript or
  push `duration_seconds` down.

## Files to create/modify
- `supabase/migrations/20261022_voice_finalization.sql` (new)
- `supabase/schema.sql` (add the three columns to the `calls` table DDL; append the same
  function definition at the end of the file)
- `src/test/sql-voice-upgrade.test.ts` (new)

No app code in this task.

## Interface / contract
RPC (binding for Tasks 05 and 14):

```sql
finalize_call(
  p_org uuid,
  p_call uuid,
  p_transcript jsonb,
  p_duration_seconds integer,
  p_end_reason text
) returns table (finalized boolean)
```

Behavior:
- Zero rows returned when no call matches `id = p_call and org_id = p_org` → caller maps
  to 404.
- One row `finalized = false` when the call exists but `finalized_at is not null` →
  caller maps to 200 already-finalized (no writes).
- One row `finalized = true` after the first successful finalize.

## Exact SQL
Migration file content:

```sql
-- Voice upgrade: idempotent call finalization (additive only).
-- Safe to re-run.

alter table public.calls
  add column if not exists finalized_at timestamptz,
  add column if not exists finalize_attempts integer not null default 0,
  add column if not exists end_reason text;

create or replace function public.finalize_call(
  p_org uuid,
  p_call uuid,
  p_transcript jsonb,
  p_duration_seconds integer,
  p_end_reason text
) returns table (finalized boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from calls where id = p_call and org_id = p_org) then
    return;
  end if;

  if exists (select 1 from calls where id = p_call and org_id = p_org
              and finalized_at is not null) then
    return query select false;
    return;
  end if;

  update calls c
     set transcript = coalesce(p_transcript, c.transcript),
         duration_seconds = greatest(coalesce(p_duration_seconds, 0),
                                     coalesce(c.duration_seconds, 0)),
         end_reason = coalesce(p_end_reason, c.end_reason),
         ended_at = coalesce(c.ended_at, now()),
         status = case
           when c.status in ('completed','failed','busy','no_answer','canceled')
             then c.status
           else 'completed'
         end,
         finalized_at = now(),
         finalize_attempts = c.finalize_attempts + 1
   where c.id = p_call and c.org_id = p_org;

  return query select true;
end;
$$;

revoke all on function public.finalize_call(uuid, uuid, jsonb, integer, text)
  from public, anon, authenticated;
grant execute on function public.finalize_call(uuid, uuid, jsonb, integer, text)
  to service_role;
```

`supabase/schema.sql` changes:
1. Inside the `create table ... calls (...)`, after `recording_url ...` add:

```sql
  finalized_at timestamp with time zone,
  finalize_attempts integer not null default 0,
  end_reason text,
```
(no `if not exists` inside `create table`).
2. Append the `create or replace function public.finalize_call(...)` block and the
   `revoke`/`grant` lines verbatim at the end of the file.

## Exact values
- Terminal statuses never overwritten: `completed, failed, busy, no_answer, canceled`.
- New end reasons (text, free-form but callers use exactly): `hangup`, `max_duration`,
  `token_refresh_failed`, `server_shutdown`, `error`.
- `finalize_attempts` starts at `0`, increments once per successful finalize only.
- `duration_seconds` never decreases (`greatest`).
- `ended_at` set only if null (`coalesce(c.ended_at, now())`).

## Test plan
`src/test/sql-voice-upgrade.test.ts` — static assertions on file text (no DB needed):

1. Migration file exists and contains `add column if not exists finalized_at`,
   `finalize_attempts`, `end_reason`.
2. Contains `create or replace function public.finalize_call(` and the exact five
   parameter declarations in order.
3. `returns table (finalized boolean)`.
4. Contains `security definer` **and** `set search_path = public`.
5. Contains `where c.id = p_call and c.org_id = p_org` (tenant filter) and
   `finalized_at is null` or the `finalized_at is not null` early return.
6. Contains `revoke all on function` and `grant execute` to `service_role`.
7. Forbidden patterns absent (case-insensitive): `drop column`, `alter column`,
   `drop table`, `add constraint`, `calls_status_check`.
8. Every `add column` line in the migration includes `if not exists` (regex over lines).
9. `supabase/schema.sql` still contains `status text not null default 'in_progress'` and
   now contains all three new column names and `function public.finalize_call`.
10. No `check (` referencing `status` in either file.

Run exactly:
```bash
npx vitest run src/test/sql-voice-upgrade.test.ts
npm run type-check
```

## Acceptance criteria
- [ ] Migration is re-runnable (all `add column` guarded; function `create or replace`).
- [ ] No destructive or type-changing DDL; no CHECK on `status`.
- [ ] RPC filters by both `id` and `org_id`, is idempotent, and reports finalized state.
- [ ] `schema.sql` fresh installs include the columns and the RPC.
- [ ] Function is not executable by `anon`/`authenticated`.
- [ ] Static tests pass; no app code changed.

## Out of scope
- Applying the migration to any live database (deploy step, Task 14 docs).
- Backfilling `no-answer` → `no_answer` or adding constraints.
- RLS policy changes for `calls` UPDATE.
- Transcript schema/versioning.

## Report path
`.work/voice-upgrade/reports/04-sql-finalization.md`
