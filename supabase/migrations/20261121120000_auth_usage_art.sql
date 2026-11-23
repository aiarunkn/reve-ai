-- Reve AI · login + per-user rate limits + shared picture cache
-- Paste into Supabase → SQL Editor → New query → Run, or apply with the Supabase CLI/MCP.
-- Safe to run more than once (idempotent).
--
-- Adds:
--   players.user_id   — links a shared-world player to a signed-in Supabase Auth account
--   usage              — per-day, per-kind call counters (server only; atomic via bump_usage())
--   bump_usage()        — the only way to increment usage; refuses over the limit, no policies needed
--   world_art           — which pictures a shared world has painted, and where they live in Storage
--   storage bucket "world-art" — private; only the server (service role) reads or writes it

-- ------------------------------------------------------------------
-- 1. Link players to accounts
-- ------------------------------------------------------------------
alter table players add column if not exists user_id uuid references auth.users(id) on delete set null;
create index if not exists players_user on players(user_id);

-- ------------------------------------------------------------------
-- 2. Per-user / per-guest rate limits
-- ------------------------------------------------------------------
create table if not exists usage (
  subject     text not null,   -- a signed-in user's id, or a guest key (sha256 of ip + server salt)
  day         date not null,
  kind        text not null,   -- 'turn' | 'world' | 'join' | 'image' | 'voice' | 'recap'
  count       int  not null default 0,
  primary key (subject, day, kind)
);
alter table usage enable row level security;

-- Atomically +1 a counter and refuse once it would pass p_limit. Returns the new count,
-- or -1 (no increment) when the limit is reached or p_limit <= 0. One statement, so two
-- concurrent calls for the same subject/day/kind can never both succeed past the limit.
create or replace function bump_usage(p_subject text, p_kind text, p_limit int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if p_limit <= 0 then
    return -1;
  end if;

  insert into usage as u (subject, day, kind, count)
  values (p_subject, current_date, p_kind, 1)
  on conflict (subject, day, kind) do update
    set count = u.count + 1
    where u.count < p_limit
  returning u.count into v_count;

  if v_count is null then
    return -1;
  end if;
  return v_count;
end;
$$;

-- Only the server (service_role) may call this; the default PUBLIC grant covers anon/authenticated too.
revoke all on function bump_usage(text, text, int) from public;
revoke execute on function bump_usage(text, text, int) from anon, authenticated;

-- ------------------------------------------------------------------
-- 3. Shared picture cache: one painting per world per kind
-- ------------------------------------------------------------------
create table if not exists world_art (
  world_code  text not null references worlds(code) on delete cascade,
  kind        text not null,                 -- 'place0'..'place7', 'portrait0'..'portrait7', 'moment<turn>'
  status      text not null check (status in ('painting', 'ready', 'failed')),
  path        text,                          -- storage path once ready: w/<CODE>/<kind>.<ext>
  mime        text,
  claimed_by  uuid,                          -- the player who claimed it to paint it
  updated_at  timestamptz not null default now(),
  primary key (world_code, kind)
);
create index if not exists world_art_world on world_art(world_code);
alter table world_art enable row level security;

-- Private bucket for shared worlds' pictures. Only the server (service role) reads or writes it;
-- no storage policies are added, so the anon/authenticated roles get no access, same as the tables above.
insert into storage.buckets (id, name, public)
values ('world-art', 'world-art', false)
on conflict (id) do nothing;
