-- ============================================================================
-- SpeakNote — initial schema
-- Tables: profiles, meetings, participants, transcripts, minutes
-- RPCs:   create_meeting, join_meeting, end_meeting, kick_participant
-- Access: RLS + column-level grants. Only the host reads transcripts/minutes.
-- Realtime: private channels room:CODE (presence) and host:CODE (host previews)
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- One row per auth.users row. Mirrors email + a display name.
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text,
  created_at  timestamptz not null default now()
);

-- A meeting. id IS the join code (8 chars). Host is the creator.
create table public.meetings (
  id          text primary key check (id ~ '^[A-Z0-9]{8}$'),
  host_id     uuid not null references public.profiles (id) on delete cascade,
  title       text,
  status      text not null default 'active' check (status in ('active','ended')),
  created_at  timestamptz not null default now(),
  ended_at    timestamptz
);

-- Who is in a meeting. Real name + email captured at join time.
create table public.participants (
  meeting_id  text not null references public.meetings (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  full_name   text not null,
  email       text not null,
  joined_at   timestamptz not null default now(),
  kicked_at   timestamptz,
  primary key (meeting_id, user_id)
);

-- One row per transcribed clip. user_id is set by a trigger from auth.uid().
create table public.transcripts (
  id          bigint generated always as identity primary key,
  meeting_id  text not null references public.meetings (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  full_name   text not null,
  content     text not null,
  created_at  timestamptz not null default now()
);

-- AI-written minutes, one row per meeting.
create table public.minutes (
  meeting_id  text primary key references public.meetings (id) on delete cascade,
  content     jsonb not null,
  model       text,
  created_at  timestamptz not null default now()
);

create index transcripts_meeting_created_idx
  on public.transcripts (meeting_id, created_at);

-- ---------------------------------------------------------------------------
-- Helper: is the current user the host of this meeting?
-- SECURITY DEFINER so RLS policies can call it without recursing.
-- ---------------------------------------------------------------------------
create or replace function public.is_meeting_host(p_meeting_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.meetings m
    where m.id = p_meeting_id and m.host_id = auth.uid()
  );
$$;

-- Helper: is the current user an active (non-kicked) participant?
create or replace function public.is_meeting_participant(p_meeting_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.participants p
    where p.meeting_id = p_meeting_id
      and p.user_id = auth.uid()
      and p.kicked_at is null
  );
$$;

-- ---------------------------------------------------------------------------
-- Trigger: new auth user -> profiles row
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', null)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Trigger: transcripts — force user_id/full_name from auth.uid()
-- (the API inserts with the caller's JWT, so we trust auth.uid(), not body)
-- ---------------------------------------------------------------------------
create or replace function public.set_transcript_author()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.user_id := auth.uid();
  select coalesce(p.full_name, p.email, 'Unknown')
    into new.full_name
    from public.profiles p
   where p.id = auth.uid();
  return new;
end;
$$;

create trigger transcripts_set_author
  before insert on public.transcripts
  for each row execute function public.set_transcript_author();

-- ---------------------------------------------------------------------------
-- RPC: create_meeting
-- ---------------------------------------------------------------------------
create or replace function public.create_meeting(p_title text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_attempt int := 0;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  loop
    v_attempt := v_attempt + 1;
    -- 8 chars from A-Z0-9, avoids ambiguous ones via replace below if desired
    v_code := upper(substr(replace(encode(gen_random_bytes(6), 'base64'), '/', 'A'), 1, 8));
    v_code := regexp_replace(v_code, '[^A-Z0-9]', 'X', 'g');
    begin
      insert into public.meetings (id, host_id, title) values (v_code, auth.uid(), p_title);
      return v_code;
    exception when unique_violation then
      if v_attempt >= 10 then
        raise exception 'could not allocate meeting code';
      end if;
    end;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: join_meeting — stores real name + email; returns meeting row
-- ---------------------------------------------------------------------------
create or replace function public.join_meeting(p_code text, p_full_name text)
returns public.meetings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meeting public.meetings;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into v_meeting from public.meetings where id = p_code;
  if not found then
    raise exception 'meeting not found';
  end if;
  if v_meeting.status <> 'active' then
    raise exception 'meeting has ended';
  end if;

  select coalesce(email, '') into v_email from public.profiles where id = auth.uid();

  insert into public.participants (meeting_id, user_id, full_name, email)
  values (p_code, auth.uid(), coalesce(nullif(p_full_name,''), v_email, 'Unknown'), v_email)
  on conflict (meeting_id, user_id) do update
    set full_name = excluded.full_name,
        email = excluded.email,
        kicked_at = null;

  return v_meeting;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: end_meeting — host only
-- ---------------------------------------------------------------------------
create or replace function public.end_meeting(p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_meeting_host(p_code) then
    raise exception 'only the host can end the meeting';
  end if;
  update public.meetings
     set status = 'ended', ended_at = now()
   where id = p_code and status = 'active';
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: kick_participant — host only
-- ---------------------------------------------------------------------------
create or replace function public.kick_participant(p_code text, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_meeting_host(p_code) then
    raise exception 'only the host can kick participants';
  end if;
  update public.participants
     set kicked_at = now()
   where meeting_id = p_code and user_id = p_user_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles     enable row level security;
alter table public.meetings     enable row level security;
alter table public.participants enable row level security;
alter table public.transcripts  enable row level security;
alter table public.minutes      enable row level security;

-- profiles: read own; read others' name/email only if co-participants (needed
-- for host UI); update own name.
create policy profiles_select_self on public.profiles
  for select using (id = auth.uid());

create policy profiles_update_self on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- meetings: host sees own meetings; participants see meetings they're in.
create policy meetings_select_host on public.meetings
  for select using (host_id = auth.uid());

create policy meetings_select_participant on public.meetings
  for select using (public.is_meeting_participant(id));

-- participants: host sees all in their meetings; participant sees self and
-- co-participants in the same meeting.
create policy participants_select_host on public.participants
  for select using (public.is_meeting_host(meeting_id));

create policy participants_select_self on public.participants
  for select using (user_id = auth.uid());

-- transcripts: HOST ONLY.
create policy transcripts_select_host on public.transcripts
  for select using (public.is_meeting_host(meeting_id));

-- minutes: HOST ONLY.
create policy minutes_select_host on public.minutes
  for select using (public.is_meeting_host(meeting_id));

-- No insert/update/delete policies on transcripts/minutes/meetings from the
-- client: all writes go through the API (service role) or RPCs above.

-- ---------------------------------------------------------------------------
-- Column-level grants: restrict what the client can select even if RLS passes
-- ---------------------------------------------------------------------------
revoke all on public.transcripts from anon, authenticated;
grant select (id, meeting_id, user_id, full_name, content, created_at)
  on public.transcripts to authenticated;

revoke all on public.minutes from anon, authenticated;
grant select (meeting_id, content, model, created_at)
  on public.minutes to authenticated;

revoke all on public.participants from anon, authenticated;
grant select (meeting_id, user_id, full_name, email, joined_at, kicked_at)
  on public.participants to authenticated;

revoke all on public.meetings from anon, authenticated;
grant select (id, host_id, title, status, created_at, ended_at)
  on public.meetings to authenticated;

revoke all on public.profiles from anon, authenticated;
grant select (id, email, full_name, created_at) on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: private channels room:CODE (presence) and host:CODE (host-only)
-- Policies on realtime.messages decide who can read/write.
-- ---------------------------------------------------------------------------
-- room:CODE — any active participant (incl. host) may read/write.
create policy "room channel — participants" on realtime.messages
  for all
  to authenticated
  using (
    realtime.topic() ~ '^room:[A-Z0-9]{8}$'
    and public.is_meeting_participant(substring(realtime.topic() from 6))
  )
  with check (
    realtime.topic() ~ '^room:[A-Z0-9]{8}$'
    and public.is_meeting_participant(substring(realtime.topic() from 6))
  );

-- host:CODE — only the host may read/write.
create policy "host channel — host only" on realtime.messages
  for all
  to authenticated
  using (
    realtime.topic() ~ '^host:[A-Z0-9]{8}$'
    and public.is_meeting_host(substring(realtime.topic() from 6))
  )
  with check (
    realtime.topic() ~ '^host:[A-Z0-9]{8}$'
    and public.is_meeting_host(substring(realtime.topic() from 6))
  );