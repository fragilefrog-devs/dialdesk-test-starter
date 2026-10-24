-- Persist appearance settings for the website voice widget.
alter table public.agents
  add column if not exists widget_label text not null default 'Talk to us',
  add column if not exists widget_position text not null default 'right' check (widget_position in ('left', 'right')),
  add column if not exists widget_accent text not null default '#6657e8' check (widget_accent ~ '^#[0-9A-Fa-f]{6}$');
