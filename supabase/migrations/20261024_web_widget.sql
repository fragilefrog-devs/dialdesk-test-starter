-- Website voice widget (Vapi web calls). Additive and idempotent.
alter table public.agents
  add column if not exists widget_enabled boolean not null default false,
  add column if not exists widget_domains text[] not null default '{}',
  add column if not exists widget_token text not null default replace(gen_random_uuid()::text, '-', '');
create unique index if not exists agents_widget_token_key on public.agents(widget_token);
