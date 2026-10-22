# Report — Task 04: additive SQL for idempotent finalization

**Status:** done — all acceptance criteria met. Migration and RPC were **NOT applied to any
live database** (explicitly out of scope for this task; deploy is Task 14). Verification was
static review of the SQL plus the file-text test the brief specifies.

**Commits:** none (constraint: no `git commit` / `git push`).

## Files changed

Created:
- `supabase/migrations/20261022_voice_finalization.sql` — exact SQL from the brief.
- `src/test/sql-voice-upgrade.test.ts` — 11 static assertions covering brief test-plan items 1–10.

Modified:
- `supabase/schema.sql` — three columns added to the `public.calls` DDL; `finalize_call`
  definition plus `revoke`/`grant` appended verbatim at end of file.

No other files touched. No `src/**` changes except the named test. `voice-gateway/**` untouched.
No new dependencies.

### One deviation (placement only)

The brief says to add the columns in `schema.sql` “after `recording_url ...`”, but that column
does not exist in this repo’s `calls` table. The three columns were appended at the **end** of the
`calls` column list (after `created_at`, before the closing `);`), which is also the physical
column order the additive migration produces on an existing database. Semantics are unchanged.

## Exact SQL

`supabase/migrations/20261022_voice_finalization.sql` (full file):

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

`supabase/schema.sql` — `public.calls` DDL delta:

```sql
  transcript jsonb not null default '[]',
  summary text,
  created_at timestamptz not null default now(),
  finalized_at timestamp with time zone,
  finalize_attempts integer not null default 0,
  end_reason text
);
```

`supabase/schema.sql` — appended at end of file (same function body as the migration, with a
one-line comment):

```sql
-- Idempotent call finalization (service role only)
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

## Gate output (actual)

### `npx vitest run src/test/sql-voice-upgrade.test.ts`

```text
The CJS build of Vite's Node API is deprecated. See https://vite.dev/guide/troubleshooting.html#vite-cjs-node-api-deprecated for more details.

 RUN  v2.1.9 H:/ai-voice-receptionist-saas/starter

 ✓ src/test/sql-voice-upgrade.test.ts (11 tests) 11ms

 Test Files  1 passed (1)
      Tests  11 passed (11)
   Start at  23:11:54
   Duration  12.30s (transform 4.10s, setup 242ms, collect 11ms, tests 1ms, environment 7.81s)
EXIT=0
```

### `npm test`

```text
> ai-voice-receptionist@1.0.0 test
> vitest run

 RUN  v2.1.9 H:/ai-voice-receptionist-saas/starter

 ✓ src/test/smoke.test.ts (1 test) 6ms
 ✓ src/test/sql-voice-upgrade.test.ts (11 tests) 21ms
 ✓ src/test/twilio-env-scope.test.ts (1 test) 356ms
 ✓ src/test/voice-config-route.test.ts (4 tests) 23ms
 ✓ src/test/internal-auth.test.ts (6 tests) 416ms

 Test Files  5 passed (5)
      Tests  23 passed (23)
   Start at  23:12:09
   Duration  1.56s
EXIT=0
```

### `npm run type-check`

```text
> ai-voice-receptionist@1.0.0 type-check
> tsc --noEmit

EXIT=0
```

Note: an earlier run at 22:59 briefly failed with
`src/test/twilio-env-scope.test.ts(37,66): error TS7053`. That file was being written concurrently
by Task 02, not by this task; Task 02 fixed it at 23:06 and the final full-project run above exits
0. `src/test/sql-voice-upgrade.test.ts` also compiles cleanly in isolation.

## What the test asserts

Mapped 1:1 to the brief’s test plan:

1. Migration exists; contains `add column if not exists finalized_at`, `finalize_attempts`,
   `end_reason`.
2. Exact `create or replace function public.finalize_call(` marker and the five parameter
   declarations, in order.
3. `returns table (finalized boolean)`.
4. `security definer` and `set search_path = public`.
5. Tenant filter `where c.id = p_call and c.org_id = p_org`, plus the
   `finalized_at is not null` early return with `return query select false`.
6. `revoke all on function … from public, anon, authenticated` and exactly one
   `grant execute … to service_role`; no grant to `anon`/`authenticated`.
7. No `drop column`, `alter column`, `drop table`, `add constraint`, `calls_status_check`
   (case-insensitive, migration).
8. All three `add column` lines contain `if not exists`.
9. `schema.sql` still has `status text not null default 'in_progress'`, contains all three new
   column names and `function public.finalize_call`, and the columns are inside the `calls` DDL.
10. No `check (` referencing `status` inside the `calls` table block, and none in the migration.

Item 10 is intentionally scoped to the `calls` table: `leads` and `appointments` legitimately have
their own `status` CHECK constraints, so a whole-file regex would false-positive. The intent —
no CHECK on `calls.status` — is asserted directly.

## Isolation argument (tenant A vs tenant B)

- Every read and the update inside `finalize_call` are filtered by
  `id = p_call AND org_id = p_org`. A UUID belonging to tenant B cannot match a call for tenant A
  because the `org_id` predicate fails; the function returns zero rows, indistinguishable from an
  unknown call. There is no cross-tenant read path: the RPC returns only a boolean, never row data.
- `security definer` is used so the trusted service-role caller gets a consistent update, with
  `search_path` pinned to `public` to prevent object hijacking via caller-controlled schemas.
- Execute is revoked from `public`, `anon`, and `authenticated`, and granted only to `service_role`
  (the app uses the service-role key; RLS is bypassed there, so the org predicate is the actual
  isolation boundary and it is inside the function).
- All DDL is additive: nullable columns plus one defaulted NOT NULL column
  (`finalize_attempts default 0`, metadata-only add on supported Postgres). No drops, renames,
  type changes, data rewrites, or CHECK constraints. The currently deployed gateway image, which
  never calls the RPC, keeps working against the new schema.

## Idempotency behavior

- Call missing or wrong tenant → zero rows (Task 05 maps to 404).
- Existing `finalized_at` → one row `finalized = false`, no writes.
- First finalize → one row `finalized = true`; transcript only replaced when non-null, duration
  never decreases (`greatest`), `ended_at` never overwritten (`coalesce`), terminal statuses
  (`completed, failed, busy, no_answer, canceled`) preserved, `finalize_attempts` + 1.
- This is what makes a crash-then-retry safe: a retry after a committed finalize is a no-op read.

## Residual risks / for Sentinel re-audit

1. **Concurrent finalize race (brief SQL retained verbatim).** Under READ COMMITTED, two
   simultaneous RPC calls can both pass the `finalized_at is not null` guard before either
   commits. The loser still runs the UPDATE (because its WHERE has no `finalized_at is null`
   predicate), gets `finalized = true`, increments `finalize_attempts` a second time and refreshes
   `finalized_at`. Transcript/duration/ended_at are protected by `coalesce`/`greatest`, so data is
   not downgraded, but the boolean is not strict mutual exclusion. Task 05’s retries are
   sequential (0/500/2000 ms), so this is low likelihood. If strict single-winner semantics are
   required, the change is `and c.finalized_at is null` in the UPDATE plus
   `return query select found;` — that alters the binding contract, so it was not done here.
2. **Legacy statuses.** Live `in-progress`/`no-answer` values are not in the terminal list and
   would be written as `completed` if such a row is finalized. This matches the brief’s canonical
   mapping; no backfill was performed. Twilio status webhook remains authoritative (D9).
3. **JSON null transcript.** `coalesce(p_transcript, c.transcript)` treats `'null'::jsonb` as
   non-null, so a caller passing JSON null would replace the transcript with JSON null instead of
   preserving it. Task 05 should pass SQL NULL / omit the value when there is no transcript.
4. **Not deployed.** Nothing was applied to the live project (`ydlnajsvhpenqxakgsyg`) or any other
   database. The migration must run before the new app/gateway image is deployed; until then
   `finalize_call` does not exist. `supabase/schema.sql` is not a migration: existing databases
   need `20261022_voice_finalization.sql`; fresh installs get the columns/RPC from `schema.sql`.
5. **Out of scope, recorded for Task 14:** `calls` UPDATE RLS still allows any org member to update
   rows in their own org (not cross-tenant). No policy change was made.
6. **Migration filename** uses the brief’s 8-digit date prefix (`20261022_…`), not the Supabase
   CLI’s usual 14-digit timestamp. Supabase treats the text before the first `_` as the version;
   Task 14 should confirm the deploy path accepts it (the brief mandates this filename).

## Self-review against the brief

- [x] Migration re-runnable: all three `add column` guarded; function `create or replace`.
- [x] No destructive/type-changing DDL; no CHECK on `status`.
- [x] RPC filters by `id` **and** `org_id`, is idempotent, reports finalized state (0 rows /
      false / true).
- [x] `schema.sql` fresh installs include columns and RPC.
- [x] Function executable only by `service_role`; revoked from `public, anon, authenticated`.
- [x] Static tests pass; no app code changed.
- [x] Argument names/types/return column match the brief exactly (`p_org uuid, p_call uuid,
      p_transcript jsonb, p_duration_seconds integer, p_end_reason text` →
      `returns table (finalized boolean)`), so Task 05 and Task 11 have a stable contract.
