-- Reve AI · shared worlds
-- Paste this whole file into Supabase → SQL Editor → New query → Run. Safe to run more than once.
--
-- One world, many players. Every player lives their own scenes, but the canon is shared:
-- the ledger (facts, relationships, threads, chapter) is the fold of every player's turns.
-- Turns are append-only, so two friends playing at the same moment never overwrite each other.
--
-- Only the server (api/*, with the service-role key) reads or writes these tables.
-- Row level security is on with no policies, so the public anon key can't read anything;
-- the browser uses the anon key only for live "someone just played" pings (Realtime broadcast).

create table if not exists worlds (
  code        text primary key,                 -- the 6-letter room code, e.g. "MOONLK"
  premise     text not null,
  bible       jsonb not null,                   -- places, cast, threads, opening
  base        jsonb not null default '{}'::jsonb, -- ledger/chapter/scene/time when the world was opened up
  created_at  timestamptz not null default now()
);

create table if not exists players (
  id          uuid primary key default gen_random_uuid(),
  world_code  text not null references worlds(code) on delete cascade,
  name        text not null,
  color       text not null,
  look        text,
  tag         text,
  want        text,
  secret      text,                             -- only ever sent back to its own player
  about       text,                             -- how they described themselves when joining
  token_hash  text not null,                    -- sha256 of the player's device token
  created_at  timestamptz not null default now()
);
create index if not exists players_world on players(world_code);

create table if not exists turns (
  id          bigserial primary key,
  world_code  text not null references worlds(code) on delete cascade,
  player_id   uuid not null references players(id) on delete cascade,
  kind        text not null default 'turn',     -- opening | arrival | turn | interlude
  actions     jsonb not null default '[]'::jsonb,
  narration   text,
  record      jsonb,                            -- consequences, facts, relationships, threads, scene, time, choices
  created_at  timestamptz not null default now()
);
create index if not exists turns_world on turns(world_code, id);
create index if not exists turns_player on turns(player_id);

alter table worlds  enable row level security;
alter table players enable row level security;
alter table turns   enable row level security;

-- Reve AI · login + per-user rate limits + shared picture cache
-- (same as supabase/migrations/20261121120000_auth_usage_art.sql — idempotent, safe to run more than once)

alter table players add column if not exists user_id uuid references auth.users(id) on delete set null;
create index if not exists players_user on players(user_id);

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

revoke all on function bump_usage(text, text, int) from public;
revoke execute on function bump_usage(text, text, int) from anon, authenticated;

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

-- Atomic claim for world_art (see supabase/migrations/20261121120100_claim_art.sql — idempotent)
create or replace function claim_art(p_world_code text, p_kind text, p_claimed_by uuid, p_stale_seconds int default 180)
returns table(status text, path text, mime text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row world_art;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_world_code || ':' || p_kind, 0));

  select * into v_row from world_art where world_code = p_world_code and kind = p_kind;

  if v_row.world_code is null then
    insert into world_art (world_code, kind, status, claimed_by, updated_at)
    values (p_world_code, p_kind, 'painting', p_claimed_by, now());
    return query select 'claimed'::text, null::text, null::text;
    return;
  end if;

  if v_row.status = 'ready' then
    return query select 'ready'::text, v_row.path, v_row.mime;
    return;
  end if;

  if v_row.status = 'painting' and v_row.updated_at > now() - make_interval(secs => p_stale_seconds) then
    return query select 'wait'::text, null::text, null::text;
    return;
  end if;

  update world_art
  set status = 'painting', claimed_by = p_claimed_by, path = null, mime = null, updated_at = now()
  where world_code = p_world_code and kind = p_kind;
  return query select 'claimed'::text, null::text, null::text;
end;
$$;

revoke all on function claim_art(text, text, uuid, int) from public;
revoke execute on function claim_art(text, text, uuid, int) from anon, authenticated;
