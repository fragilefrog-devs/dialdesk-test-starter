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
