-- Trades (plumbing / HVAC) + Vapi rescaffold. Additive and idempotent: safe to re-run.

alter table public.agents
  add column if not exists vapi_assistant_id text unique,
  add column if not exists services text[] not null default '{}',
  add column if not exists service_zips text[] not null default '{}',
  add column if not exists oncall_number text,
  add column if not exists notify_phone text,
  add column if not exists notify_email text,
  add column if not exists arrival_windows jsonb not null default '[["08:00","12:00"],["12:00","16:00"]]',
  add column if not exists jobs_per_window integer not null default 2 check (jobs_per_window between 1 and 50),
  add column if not exists emergency_service boolean not null default true;

alter table public.phone_numbers alter column provider set default 'vapi';

alter table public.calls
  add column if not exists outcome text check (outcome in ('booked','emergency_escalated','lead_captured','info_only','spam','abandoned')),
  add column if not exists urgency text check (urgency in ('emergency','same_day','routine')),
  add column if not exists recording_url text;

alter table public.leads
  add column if not exists urgency text check (urgency in ('emergency','same_day','routine')),
  add column if not exists address text,
  add column if not exists zip text,
  add column if not exists issue text;

alter table public.appointments
  add column if not exists address text,
  add column if not exists zip text,
  add column if not exists issue text,
  add column if not exists urgency text check (urgency in ('emergency','same_day','routine'));

-- Trades book by arrival window with per-window capacity, not one job per org at a time.
alter table public.appointments drop constraint if exists appointments_no_overlap;
create index if not exists appointments_org_window_idx on public.appointments(org_id, starts_at) where status = 'booked';

-- ── Trades: default services by trade ──────────────────────────
create or replace function public.default_services(p_industry text) returns text[]
language sql immutable as $$
  select case p_industry
    when 'plumbing' then array['Leak repair','Drain cleaning','Water heater repair or replacement','Toilet and fixture repair','Burst pipe emergency']
    when 'hvac' then array['AC repair','Furnace repair','New system estimate','Maintenance tune-up','No heat or no cooling emergency']
    when 'plumbing_hvac' then array['Leak repair','Drain cleaning','Water heater repair or replacement','AC repair','Furnace repair','New system estimate','Maintenance tune-up','Burst pipe emergency','No heat or no cooling emergency']
    else array[]::text[]
  end
$$;

-- Atomic tenant creation: org + owner membership + default trades receptionist
create or replace function public.create_organization(p_name text, p_slug text, p_industry text, p_timezone text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into organizations (name, slug, industry, timezone)
  values (p_name, lower(p_slug), coalesce(p_industry,'other'), coalesce(p_timezone,'UTC'))
  returning id into v_org;
  insert into memberships (org_id, user_id, role) values (v_org, auth.uid(), 'owner');
  insert into agents (org_id, name, greeting, instructions, services, business_hours)
  values (v_org, p_name || ' Receptionist',
          'Thanks for calling ' || p_name || '. I''m the virtual assistant. How can I help?',
          'You answer the phone for ' || p_name || ', a local home-service company. Be calm, brief and practical. Collect job details; never diagnose problems, quote prices or promise arrival times.',
          public.default_services(coalesce(p_industry,'other')),
          '{"mon":["07:30","17:00"],"tue":["07:30","17:00"],"wed":["07:30","17:00"],"thu":["07:30","17:00"],"fri":["07:30","17:00"],"sat":["08:00","13:00"]}'::jsonb);
  return v_org;
end $$;
revoke all on function public.create_organization(text,text,text,text) from public, anon;
grant execute on function public.create_organization(text,text,text,text) to authenticated;

-- Capacity-aware booking: several techs can take the same arrival window.
-- The advisory lock serializes bookings for one org + window, so the count-then-insert is race-free.
create or replace function public.book_trade_job(
  p_org uuid, p_call uuid, p_contact uuid, p_service text,
  p_starts timestamptz, p_ends timestamptz, p_capacity integer,
  p_address text, p_zip text, p_issue text, p_urgency text, p_notes text
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
  insert into appointments (org_id, contact_id, call_id, service, starts_at, ends_at, address, zip, issue, urgency, notes)
  values (p_org, p_contact, p_call, p_service, p_starts, p_ends, p_address, p_zip, p_issue, p_urgency, p_notes)
  returning id into v_id;
  return query select v_id, 'booked'::text;
end $$;
revoke all on function public.book_trade_job(uuid,uuid,uuid,text,timestamptz,timestamptz,integer,text,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.book_trade_job(uuid,uuid,uuid,text,timestamptz,timestamptz,integer,text,text,text,text,text)
  to service_role;
