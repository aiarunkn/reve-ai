-- Reve AI · atomic claim for the shared picture cache (world_art, from 20261121120000_auth_usage_art.sql)
-- Paste into Supabase → SQL Editor → New query → Run, or apply with the Supabase CLI/MCP. Idempotent.

create or replace function claim_art(p_world_code text, p_kind text, p_claimed_by uuid, p_stale_seconds int default 180)
returns table(status text, path text, mime text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row world_art;
begin
  -- serialize claim attempts for this exact world+kind, released automatically at the end of the call
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

  -- a stale 'painting' claim, or a previous 'failed' attempt: reclaim it
  update world_art
  set status = 'painting', claimed_by = p_claimed_by, path = null, mime = null, updated_at = now()
  where world_code = p_world_code and kind = p_kind;
  return query select 'claimed'::text, null::text, null::text;
end;
$$;

revoke all on function claim_art(text, text, uuid, int) from public;
revoke execute on function claim_art(text, text, uuid, int) from anon, authenticated;
