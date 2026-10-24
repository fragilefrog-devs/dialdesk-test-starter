-- Add explicit caller consent to the appointment and update the booking RPC.
alter table public.appointments
  add column if not exists email_confirmation_consented_at timestamptz;

drop function if exists public.book_trade_job(uuid,uuid,uuid,text,timestamptz,timestamptz,integer,text,text,text,text,text);
create or replace function public.book_trade_job(
  p_org uuid, p_call uuid, p_contact uuid, p_service text,
  p_starts timestamptz, p_ends timestamptz, p_capacity integer,
  p_address text, p_zip text, p_issue text, p_urgency text, p_notes text,
  p_email_confirmation_consented_at timestamptz default null
) returns table (out_id uuid, out_status text)
language plpgsql security definer set search_path = public as $$
declare v_count integer; v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_org::text || p_starts::text, 0));
  select count(*) into v_count from appointments a
   where a.org_id = p_org and a.status = 'booked' and a.starts_at = p_starts and a.ends_at = p_ends;
  if v_count >= greatest(p_capacity, 1) then
    return query select null::uuid, 'full'::text;
    return;
  end if;
  insert into appointments (
    org_id, contact_id, call_id, service, starts_at, ends_at, address, zip, issue, urgency, notes,
    email_confirmation_consented_at
  )
  values (
    p_org, p_contact, p_call, p_service, p_starts, p_ends, p_address, p_zip, p_issue, p_urgency, p_notes,
    p_email_confirmation_consented_at
  )
  returning id into v_id;
  return query select v_id, 'booked'::text;
end $$;
revoke all on function public.book_trade_job(uuid,uuid,uuid,text,timestamptz,timestamptz,integer,text,text,text,text,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.book_trade_job(uuid,uuid,uuid,text,timestamptz,timestamptz,integer,text,text,text,text,text,timestamptz)
  to service_role;
