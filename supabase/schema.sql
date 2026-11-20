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

alter table worlds  enable row level security;
alter table players enable row level security;
alter table turns   enable row level security;
