-- supabase/migrations/20261103000000_user_settings.sql
-- One row per user. Every column has a default, so a missing row just means "defaults".

create table if not exists public.user_settings (
  user_id                uuid primary key references auth.users (id) on delete cascade,
  avatar_color           text,
  transcription_language text    not null default 'en-US',
  mic_device_id          text,
  auto_minutes           boolean not null default true,
  export_format          text    not null default 'pdf' check (export_format in ('pdf', 'md', 'docx')),
  show_timestamps        boolean not null default true,
  retention_days         integer check (retention_days in (30, 90)),  -- null = keep forever
  updated_at             timestamptz not null default now()
);

alter table public.user_settings enable row level security;

create policy "Users read own settings"
  on public.user_settings for select
  using (auth.uid() = user_id);

create policy "Users insert own settings"
  on public.user_settings for insert
  with check (auth.uid() = user_id);

create policy "Users update own settings"
  on public.user_settings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.touch_user_settings()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger user_settings_touch
  before update on public.user_settings
  for each row execute function public.touch_user_settings();

-- ---------------------------------------------------------------------------
-- OPTIONAL: enforce auto-delete. The Settings page only STORES the preference.
-- Replace `transcripts` / `meeting_id` / `created_at` with your real table and
-- columns, enable the pg_cron extension, then uncomment.
--
-- select cron.schedule('purge-old-transcripts', '0 3 * * *', $$
--   delete from public.transcripts t
--   using public.meetings m, public.user_settings s
--   where t.meeting_id = m.id
--     and m.host_id = s.user_id
--     and s.retention_days is not null
--     and t.created_at < now() - make_interval(days => s.retention_days);
-- $$);
-- ---------------------------------------------------------------------------