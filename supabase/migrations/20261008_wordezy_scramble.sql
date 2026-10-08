-- Wordezy Scramble: daily leaderboard tables + RPCs.
-- Lives in the same Supabase project as Wordezy and Wordezy Search, so one
-- account works across all three games. Mirrors Wordezy Search's design:
-- tables are public-readable where needed, never directly writable — every
-- write goes through a SECURITY DEFINER function that takes the player's
-- identity from auth.uid(), not from anything the client sends.

create table if not exists public.wordezy_scramble_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Player' check (char_length(display_name) between 1 and 20),
  created_at timestamptz not null default now()
);

create table if not exists public.wordezy_scramble_scores (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 20),
  puzzle_date date not null,
  time_ms integer not null check (time_ms > 0 and time_ms < 24 * 60 * 60 * 1000),
  hints integer not null default 0 check (hints >= 0 and hints <= 100),
  created_at timestamptz not null default now(),
  constraint wordezy_scramble_scores_player_date_key unique (player_id, puzzle_date)
);

create index if not exists wordezy_scramble_scores_date_time_idx
  on public.wordezy_scramble_scores (puzzle_date, time_ms);

alter table public.wordezy_scramble_profiles enable row level security;
alter table public.wordezy_scramble_scores enable row level security;

drop policy if exists wordezy_scramble_profiles_select_own on public.wordezy_scramble_profiles;
create policy wordezy_scramble_profiles_select_own on public.wordezy_scramble_profiles
  for select using (id = (select auth.uid()));

drop policy if exists wordezy_scramble_scores_public_read on public.wordezy_scramble_scores;
create policy wordezy_scramble_scores_public_read on public.wordezy_scramble_scores
  for select using (true);

-- Sets (or changes) the caller's display name.
create or replace function public.wordezy_scramble_update_profile(p_display_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if char_length(coalesce(trim(p_display_name), '')) < 1 or char_length(trim(p_display_name)) > 20 then
    raise exception 'invalid display_name';
  end if;

  insert into public.wordezy_scramble_profiles (id, display_name)
  values (auth.uid(), trim(p_display_name))
  on conflict (id) do update set display_name = excluded.display_name;
end;
$$;

-- Returns the caller's display name for this game. A signed-in (non-guest)
-- player who already has a name in Wordezy Search or Wordezy gets that name
-- copied over the first time, so logging in with an existing bgameworld
-- account just works instead of landing on the leaderboard as "Player".
create or replace function public.wordezy_scramble_ensure_profile()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
  v_is_anon boolean := coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
begin
  if v_uid is null then
    return null;
  end if;

  select display_name into v_name from public.wordezy_scramble_profiles where id = v_uid;
  if v_name is not null or v_is_anon then
    return v_name;
  end if;

  select display_name into v_name from public.wordezy_search_profiles where id = v_uid;
  if v_name is null then
    select display_name into v_name from public.profiles where id = v_uid;
  end if;
  v_name := left(trim(coalesce(v_name, '')), 20);
  if v_name = '' then
    v_name := 'Player';
  end if;

  insert into public.wordezy_scramble_profiles (id, display_name)
  values (v_uid, v_name)
  on conflict (id) do nothing;
  return v_name;
end;
$$;

-- Records the caller's result for a daily puzzle. The FIRST finish of the day
-- is the one that counts: once a player has solved today's words they know
-- the answers, so a replay must never be able to improve their time.
create or replace function public.submit_wordezy_scramble_score(p_puzzle_date date, p_time_ms integer, p_hints integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_time_ms is null or p_time_ms <= 0 or p_time_ms >= 24 * 60 * 60 * 1000 then
    raise exception 'invalid time_ms';
  end if;
  if p_hints is null or p_hints < 0 or p_hints > 100 then
    raise exception 'invalid hints';
  end if;
  -- Daily puzzles roll over at midnight UTC; allow one day either side for
  -- players finishing across the boundary, but never a far past/future date.
  if p_puzzle_date is null or abs(p_puzzle_date - (now() at time zone 'utc')::date) > 1 then
    raise exception 'invalid puzzle_date';
  end if;
  if exists (select 1 from public.profiles where id = auth.uid() and is_banned) then
    raise exception 'account suspended';
  end if;

  select display_name into v_name from public.wordezy_scramble_profiles where id = auth.uid();
  if v_name is null then
    raise exception 'profile not set up';
  end if;

  insert into public.wordezy_scramble_scores (player_id, display_name, puzzle_date, time_ms, hints)
  values (auth.uid(), v_name, p_puzzle_date, p_time_ms, p_hints)
  on conflict (player_id, puzzle_date) do nothing;
end;
$$;

-- Fastest finishes for one day.
create or replace function public.wordezy_scramble_daily_leaderboard(p_puzzle_date date, p_limit integer default 10)
returns table (player_id uuid, display_name text, time_ms integer, hints integer)
language sql
stable
set search_path = public
as $$
  select s.player_id, s.display_name, s.time_ms, s.hints
  from public.wordezy_scramble_scores s
  where s.puzzle_date = p_puzzle_date
  order by s.time_ms asc, s.created_at asc
  limit greatest(1, least(p_limit, 100))
$$;

-- All-time standings: most daily wins first, best time as the tiebreaker.
create or replace function public.wordezy_scramble_alltime_leaderboard(p_limit integer default 10)
returns table (player_id uuid, display_name text, wins bigint, best_time_ms integer)
language sql
stable
set search_path = public
as $$
  select
    s.player_id,
    (array_agg(s.display_name order by s.created_at desc))[1] as display_name,
    count(*) as wins,
    min(s.time_ms) as best_time_ms
  from public.wordezy_scramble_scores s
  group by s.player_id
  order by wins desc, best_time_ms asc
  limit greatest(1, least(p_limit, 100))
$$;

-- Functions are executable by PUBLIC by default in Postgres; lock the
-- writers down to signed-in sessions (guests are signed in anonymously and
-- carry the "authenticated" role too) and leave the readers open.
revoke all on function public.wordezy_scramble_update_profile(text) from public, anon;
revoke all on function public.wordezy_scramble_ensure_profile() from public, anon;
revoke all on function public.submit_wordezy_scramble_score(date, integer, integer) from public, anon;
grant execute on function public.wordezy_scramble_update_profile(text) to authenticated;
grant execute on function public.wordezy_scramble_ensure_profile() to authenticated;
grant execute on function public.submit_wordezy_scramble_score(date, integer, integer) to authenticated;
grant execute on function public.wordezy_scramble_daily_leaderboard(date, integer) to anon, authenticated;
grant execute on function public.wordezy_scramble_alltime_leaderboard(integer) to anon, authenticated;
