-- DialDesk — multi-tenant AI voice receptionist for plumbing & HVAC — schema (idempotent where practical)
-- Apply in Supabase SQL editor or via `supabase db push`.
create extension if not exists pgcrypto;

-- ── Core tenancy ────────────────────────────────────────────────
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  industry text not null default 'other',
  timezone text not null default 'UTC',
  plan text not null default 'trial' check (plan in ('trial','starter','growth','scale')),
  subscription_status text not null default 'trialing',
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  current_period_end timestamptz,
  trial_ends_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.memberships (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index if not exists memberships_user_idx on public.memberships(user_id);

create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('admin','member')),
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

-- ── Voice product ───────────────────────────────────────────────
create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null default 'Receptionist',
  greeting text not null default 'Thanks for calling! How can I help you today?',
  voice text not null default 'alloy',
  language text not null default 'en',
  instructions text not null default '',
  business_hours jsonb not null default '{"mon":["09:00","17:00"],"tue":["09:00","17:00"],"wed":["09:00","17:00"],"thu":["09:00","17:00"],"fri":["09:00","17:00"]}',
  appointment_minutes int not null default 30 check (appointment_minutes between 5 and 480),
  transfer_number text,
  record_consent_notice boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  -- Vapi + trades configuration
  vapi_assistant_id text unique,
  services text[] not null default '{}',
  service_zips text[] not null default '{}',
  oncall_number text,
  notify_phone text,
  notify_email text,
  arrival_windows jsonb not null default '[["08:00","12:00"],["12:00","16:00"]]',
  jobs_per_window integer not null default 2 check (jobs_per_window between 1 and 50),
  emergency_service boolean not null default true,
  -- Website voice widget (Vapi web calls)
  widget_enabled boolean not null default false,
  widget_domains text[] not null default '{}',
  widget_token text not null default replace(gen_random_uuid()::text, '-', '')
);
create unique index if not exists agents_widget_token_key on public.agents(widget_token);
create index if not exists agents_org_idx on public.agents(org_id);

create table if not exists public.phone_numbers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid references public.agents(id) on delete set null,
  e164 text not null unique,
  provider text not null default 'vapi',
  provider_sid text,
  status text not null default 'active',
  created_at timestamptz not null default now()
);
create index if not exists phone_numbers_org_idx on public.phone_numbers(org_id);

create table if not exists public.knowledge_docs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  content text not null,
  tsv tsvector generated always as (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(content,''))) stored,
  created_at timestamptz not null default now()
);
create index if not exists knowledge_tsv_idx on public.knowledge_docs using gin(tsv);
create index if not exists knowledge_org_idx on public.knowledge_docs(org_id);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text,
  phone text,
  email text,
  notes text,
  created_at timestamptz not null default now(),
  unique (org_id, phone)
);

create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid references public.agents(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  channel text not null default 'phone' check (channel in ('phone','web')),
  direction text not null default 'inbound' check (direction in ('inbound','outbound')),
  from_number text,
  to_number text,
  provider_sid text unique,
  status text not null default 'in_progress',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds int not null default 0,
  transcript jsonb not null default '[]',
  summary text,
  created_at timestamptz not null default now(),
  finalized_at timestamp with time zone,
  finalize_attempts integer not null default 0,
  end_reason text,
  outcome text check (outcome in ('booked','emergency_escalated','lead_captured','info_only','spam','abandoned')),
  urgency text check (urgency in ('emergency','same_day','routine')),
  recording_url text
);
create index if not exists calls_org_started_idx on public.calls(org_id, started_at desc);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  call_id uuid references public.calls(id) on delete set null,
  status text not null default 'new' check (status in ('new','contacted','qualified','won','lost')),
  intent text,
  summary text,
  urgency text check (urgency in ('emergency','same_day','routine')),
  address text,
  zip text,
  issue text,
  created_at timestamptz not null default now()
);
create index if not exists leads_org_idx on public.leads(org_id, created_at desc);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  call_id uuid references public.calls(id) on delete set null,
  service text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'booked' check (status in ('booked','cancelled','completed','no_show')),
  notes text,
  address text,
  zip text,
  issue text,
  urgency text check (urgency in ('emergency','same_day','routine')),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists appointments_org_start_idx on public.appointments(org_id, starts_at);
-- Capacity per arrival window is enforced by public.book_trade_job() (see below).
create index if not exists appointments_org_window_idx on public.appointments(org_id, starts_at) where status = 'booked';

-- ── Billing / ops ───────────────────────────────────────────────
create table if not exists public.stripe_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  org_id uuid references public.organizations(id) on delete cascade,
  actor uuid,
  action text not null,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create or replace view public.org_usage_monthly with (security_invoker = true) as
  select org_id,
         date_trunc('month', started_at) as month,
         count(*) as calls,
         ceil(coalesce(sum(duration_seconds),0) / 60.0)::int as minutes
  from public.calls group by 1, 2;

-- ── Helpers + RLS ───────────────────────────────────────────────
create or replace function public.is_member(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships m where m.org_id = p_org and m.user_id = auth.uid());
$$;
create or replace function public.is_org_admin(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships m
    where m.org_id = p_org and m.user_id = auth.uid() and m.role in ('owner','admin'));
$$;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.invites enable row level security;
alter table public.agents enable row level security;
alter table public.phone_numbers enable row level security;
alter table public.knowledge_docs enable row level security;
alter table public.contacts enable row level security;
alter table public.calls enable row level security;
alter table public.leads enable row level security;
alter table public.appointments enable row level security;
alter table public.stripe_events enable row level security;  -- no policies: service role only
alter table public.audit_log enable row level security;

drop policy if exists org_select on public.organizations;
create policy org_select on public.organizations for select using (public.is_member(id));
drop policy if exists org_update on public.organizations;
create policy org_update on public.organizations for update using (public.is_org_admin(id)) with check (public.is_org_admin(id));
-- RLS controls which rows can be updated, not which columns. Keep billing state
-- writable only by trusted server code and expose only tenant-editable fields.
revoke update on table public.organizations from public, anon, authenticated;
revoke update (plan, subscription_status, stripe_customer_id, stripe_subscription_id, current_period_end, trial_ends_at)
  on table public.organizations from public, anon, authenticated;
grant update (name, slug, industry, timezone) on table public.organizations to authenticated;

drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles for select using (id = auth.uid());
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles for update using (id = auth.uid());

drop policy if exists mem_select on public.memberships;
create policy mem_select on public.memberships for select using (public.is_member(org_id));
drop policy if exists mem_admin_delete on public.memberships;
create policy mem_admin_delete on public.memberships for delete using (public.is_org_admin(org_id) and role <> 'owner');

drop policy if exists invites_admin on public.invites;
create policy invites_admin on public.invites for all using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));

-- Tenant data: members read; admins write config; call-derived rows are written by the service role
do $$
declare t text;
begin
  foreach t in array array['agents','phone_numbers','knowledge_docs'] loop
    execute format('drop policy if exists %I_read on public.%I', t, t);
    execute format('create policy %I_read on public.%I for select using (public.is_member(org_id))', t, t);
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format('create policy %I_write on public.%I for all using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id))', t, t);
  end loop;
  foreach t in array array['contacts','calls','leads','appointments'] loop
    execute format('drop policy if exists %I_read on public.%I', t, t);
    execute format('create policy %I_read on public.%I for select using (public.is_member(org_id))', t, t);
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format('create policy %I_write on public.%I for update using (public.is_member(org_id)) with check (public.is_member(org_id))', t, t);
  end loop;
end $$;

drop policy if exists audit_read on public.audit_log;
create policy audit_read on public.audit_log for select using (public.is_org_admin(org_id));

-- Profile bootstrap on signup
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Knowledge lookup used by the voice agent (service role)
create or replace function public.search_knowledge(p_org uuid, p_query text, p_limit int default 3)
returns table (title text, content text) language sql stable as $$
  select title, left(content, 1200) from public.knowledge_docs
  where org_id = p_org and tsv @@ websearch_to_tsquery('simple', p_query)
  order by ts_rank(tsv, websearch_to_tsquery('simple', p_query)) desc
  limit p_limit;
$$;

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
