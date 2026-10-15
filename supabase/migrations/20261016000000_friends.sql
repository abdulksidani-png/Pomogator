-- PomoGator migration 4: delete my account, friends, presence, support messages and study-together rooms.
-- Paste all of it into Supabase → SQL Editor and click Run. Safe to run again.
--
-- Friends only ever see what the other person chose to share. All reads of another person's data go through
-- the functions below (security definer), which check the friendship and the sharing switches on the server.
-- Guests (anonymous sign-ins) can't use friends; they can delete their data.

/* ---------------------------------------------------------------- delete my account */

create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  -- Every table references auth.users with "on delete cascade", so this removes all of the person's rows.
  -- (Their uploaded files are removed by the app through Storage first.)
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

/* ---------------------------------------------------------------- tables */

create table if not exists public.social_profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  code         text not null unique,                    -- friend code, e.g. K7Q2M9XP
  name         text not null default '' check (char_length(name) <= 40),
  buddy        text not null default 'gator' check (char_length(buddy) <= 20),
  share_online boolean not null default true,           -- friends see when I'm online and what I'm doing
  share_music  boolean not null default false,          -- ... and what I'm listening to
  share_stats  boolean not null default true,           -- ... and my stats
  stats        jsonb check (stats is null or octet_length(stats::text) < 4000),
  updated_at   timestamptz not null default now()
);

create table if not exists public.friendships (
  user_a       uuid not null references auth.users (id) on delete cascade,
  user_b       uuid not null references auth.users (id) on delete cascade,
  requested_by uuid not null,
  status       text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at   timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);
create index if not exists friendships_b on public.friendships (user_b);

create table if not exists public.presence (
  user_id  uuid primary key references auth.users (id) on delete cascade,
  seen_at  timestamptz not null default now(),
  activity jsonb check (activity is null or octet_length(activity::text) < 2000),
  music    jsonb check (music is null or octet_length(music::text) < 1000)
);

create table if not exists public.support_messages (
  id         uuid primary key default gen_random_uuid(),
  from_id    uuid not null references auth.users (id) on delete cascade,
  to_id      uuid not null references auth.users (id) on delete cascade,
  day        date not null,
  buddy      text not null default 'gator' check (char_length(buddy) <= 20),
  text       text not null check (char_length(text) between 1 and 140),
  created_at timestamptz not null default now(),
  seen_at    timestamptz,
  unique (from_id, to_id, day)                          -- one message per friend per day
);
create index if not exists support_to on public.support_messages (to_id, seen_at);

create table if not exists public.collab_rooms (
  id         uuid primary key default gen_random_uuid(),
  host_id    uuid not null references auth.users (id) on delete cascade,
  study_min  int not null check (study_min between 5 and 120),
  break_min  int not null check (break_min between 1 and 60),
  note       text not null default '' check (char_length(note) <= 140),
  state      jsonb not null default '{}'::jsonb check (octet_length(state::text) < 2000),
  state_v    bigint not null default 0,
  created_at timestamptz not null default now(),
  ended_at   timestamptz
);

create table if not exists public.collab_members (
  room_id    uuid not null references public.collab_rooms (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  status     text not null check (status in ('invited', 'joined', 'declined', 'left')),
  updated_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index if not exists collab_members_user on public.collab_members (user_id, status);

/* ---------------------------------------------------------------- row-level security */

alter table public.social_profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.presence enable row level security;
alter table public.support_messages enable row level security;
alter table public.collab_rooms enable row level security;
alter table public.collab_members enable row level security;

drop policy if exists "Own social profile" on public.social_profiles;
create policy "Own social profile" on public.social_profiles for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Own social profile: update" on public.social_profiles;
create policy "Own social profile: update" on public.social_profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- The friend code can't be changed by hand.
revoke update on public.social_profiles from authenticated;
grant select on public.social_profiles to authenticated;
grant update (name, buddy, share_online, share_music, share_stats, stats, updated_at) on public.social_profiles to authenticated;

drop policy if exists "My friendships" on public.friendships;
create policy "My friendships" on public.friendships for select to authenticated
  using ((select auth.uid()) in (user_a, user_b));
drop policy if exists "Unfriend" on public.friendships;
create policy "Unfriend" on public.friendships for delete to authenticated
  using ((select auth.uid()) in (user_a, user_b));
grant select, delete on public.friendships to authenticated;

drop policy if exists "Own presence" on public.presence;
create policy "Own presence" on public.presence for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.presence to authenticated;

drop policy if exists "My support messages" on public.support_messages;
create policy "My support messages" on public.support_messages for select to authenticated
  using ((select auth.uid()) in (from_id, to_id));
drop policy if exists "Mark support seen" on public.support_messages;
create policy "Mark support seen" on public.support_messages for update to authenticated
  using (to_id = (select auth.uid())) with check (to_id = (select auth.uid()));
grant select on public.support_messages to authenticated;
grant update (seen_at) on public.support_messages to authenticated;

-- Rooms and members are read and changed only through the functions below.
revoke all on public.collab_rooms from anon, authenticated;
revoke all on public.collab_members from anon, authenticated;

/* ---------------------------------------------------------------- helpers */

create or replace function public.pg_is_guest() returns boolean
language sql stable set search_path = '' as $$
  select coalesce((nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'is_anonymous')::boolean, false)
$$;

create or replace function public.pg_are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.friendships
    where user_a = least(a, b) and user_b = greatest(a, b) and status = 'accepted')
$$;
revoke all on function public.pg_are_friends(uuid, uuid) from public, anon, authenticated;

create or replace function public.pg_require_account() returns uuid
language plpgsql stable set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if public.pg_is_guest() then raise exception 'guest'; end if;
  return auth.uid();
end $$;

create or replace function public.server_now_ms() returns bigint
language sql stable set search_path = '' as $$ select (extract(epoch from clock_timestamp()) * 1000)::bigint $$;
grant execute on function public.server_now_ms() to authenticated;

/* ---------------------------------------------------------------- my profile */

-- Creates my friend profile the first time (with a fresh friend code) and updates name and buddy.
create or replace function public.social_me(p_name text default null, p_buddy text default null)
returns setof public.social_profiles
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.pg_require_account();
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  c text;
begin
  if not exists (select 1 from public.social_profiles where user_id = me) then
    loop
      c := '';
      for i in 1..8 loop c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1); end loop;
      begin
        insert into public.social_profiles (user_id, code, name, buddy)
        values (me, c, left(coalesce(nullif(trim(p_name), ''), 'Study buddy'), 40), left(coalesce(p_buddy, 'gator'), 20));
        exit;
      exception when unique_violation then
        if exists (select 1 from public.social_profiles where user_id = me) then exit; end if;
      end;
    end loop;
  else
    update public.social_profiles set
      name = case when nullif(trim(p_name), '') is null then name else left(trim(p_name), 40) end,
      buddy = coalesce(left(p_buddy, 20), buddy),
      updated_at = now()
    where user_id = me;
  end if;
  return query select * from public.social_profiles where user_id = me;
end $$;

/* ---------------------------------------------------------------- friends */

create or replace function public.add_friend(p_code text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.pg_require_account();
  them uuid;
  f public.friendships;
begin
  select user_id into them from public.social_profiles
  where code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if them is null then return 'not_found'; end if;
  if them = me then return 'self'; end if;
  select * into f from public.friendships where user_a = least(me, them) and user_b = greatest(me, them);
  if found then
    if f.status = 'accepted' then return 'already'; end if;
    if f.requested_by = them then   -- they asked me first: that's a yes
      update public.friendships set status = 'accepted' where user_a = f.user_a and user_b = f.user_b;
      return 'accepted';
    end if;
    return 'pending';
  end if;
  if (select count(*) from public.friendships where me in (user_a, user_b)) >= 100 then return 'too_many'; end if;
  insert into public.friendships (user_a, user_b, requested_by) values (least(me, them), greatest(me, them), me);
  return 'requested';
end $$;

create or replace function public.respond_friend(p_other uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.pg_require_account();
begin
  if p_accept then
    update public.friendships set status = 'accepted'
    where user_a = least(me, p_other) and user_b = greatest(me, p_other) and status = 'pending' and requested_by = p_other;
  else
    delete from public.friendships where user_a = least(me, p_other) and user_b = greatest(me, p_other);
  end if;
end $$;

-- Everyone I'm friends with (or have a request with), with only what each one shares.
-- p_day is the caller's own date, for "already sent a message today".
create or replace function public.friends_overview(p_day date default null)
returns table (user_id uuid, name text, buddy text, relation text, online boolean, activity jsonb, music jsonb, stats jsonb, supported_today boolean)
language sql stable security definer set search_path = '' as $$
  with me as (select public.pg_require_account() as id),
  rel as (
    select case when f.user_a = me.id then f.user_b else f.user_a end as other,
           case when f.status = 'accepted' then 'friend' when f.requested_by = me.id then 'sent' else 'received' end as relation
    from public.friendships f, me where me.id in (f.user_a, f.user_b)
  )
  select r.other, sp.name, sp.buddy, r.relation,
    (r.relation = 'friend' and sp.share_online and p.seen_at > now() - interval '150 seconds') as online,
    case when r.relation = 'friend' and sp.share_online and p.seen_at > now() - interval '150 seconds' then p.activity end,
    case when r.relation = 'friend' and sp.share_online and sp.share_music and p.seen_at > now() - interval '150 seconds' then p.music end,
    case when r.relation = 'friend' and sp.share_stats then sp.stats end,
    exists (select 1 from public.support_messages s, me where s.from_id = me.id and s.to_id = r.other and s.day = coalesce(p_day, current_date))
  from rel r
  join public.social_profiles sp on sp.user_id = r.other
  left join public.presence p on p.user_id = r.other
  order by r.relation, sp.name
$$;

/* ---------------------------------------------------------------- presence */

-- Called about once a minute while the site is open. Returns the server's clock, so timers can line up.
create or replace function public.heartbeat(p_activity jsonb, p_music jsonb) returns bigint
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.pg_require_account();
begin
  if exists (select 1 from public.social_profiles where user_id = me and share_online) then
    insert into public.presence (user_id, seen_at, activity, music) values (me, now(), p_activity, p_music)
    on conflict (user_id) do update set seen_at = now(), activity = excluded.activity, music = excluded.music;
  else
    delete from public.presence where user_id = me;
  end if;
  return public.server_now_ms();
end $$;

/* ---------------------------------------------------------------- support messages */

create or replace function public.send_support(p_to uuid, p_day date, p_text text, p_buddy text) returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.pg_require_account();
begin
  if not public.pg_are_friends(me, p_to) then return 'not_friends'; end if;
  if p_day not between current_date - 1 and current_date + 1 then return 'bad_day'; end if;
  if char_length(trim(coalesce(p_text, ''))) = 0 then return 'empty'; end if;
  begin
    insert into public.support_messages (from_id, to_id, day, buddy, text)
    values (me, p_to, p_day, left(coalesce(p_buddy, 'gator'), 20), left(trim(p_text), 140));
  exception when unique_violation then return 'already_sent';
  end;
  return 'sent';
end $$;

create or replace function public.support_inbox()
returns table (id uuid, from_name text, buddy text, text text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.id, coalesce(sp.name, 'A friend'), s.buddy, s.text, s.created_at
  from public.support_messages s left join public.social_profiles sp on sp.user_id = s.from_id
  where s.to_id = public.pg_require_account() and s.seen_at is null and s.created_at > now() - interval '3 days'
  order by s.created_at
$$;

/* ---------------------------------------------------------------- study together */

create or replace function public.pg_room_member(p_room uuid, p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select status from public.collab_members where room_id = p_room and user_id = p_user
$$;
revoke all on function public.pg_room_member(uuid, uuid) from public, anon, authenticated;

-- Invite up to 3 friends (groups of 4). The person inviting picks the study and break lengths.
create or replace function public.create_collab(p_friends uuid[], p_study int, p_break int, p_note text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.pg_require_account();
  room uuid;
  f uuid;
begin
  if coalesce(array_length(p_friends, 1), 0) not between 1 and 3 then raise exception 'group_size'; end if;
  foreach f in array p_friends loop
    if not public.pg_are_friends(me, f) then raise exception 'not_friends'; end if;
  end loop;
  -- Leave any room I was in.
  update public.collab_members set status = 'left', updated_at = now() where user_id = me and status in ('joined', 'invited');
  insert into public.collab_rooms (host_id, study_min, break_min, note, state)
  values (me, p_study, p_break, left(coalesce(p_note, ''), 140), jsonb_build_object('phase', 'study', 'status', 'idle', 'round', 1))
  returning id into room;
  insert into public.collab_members (room_id, user_id, status) values (room, me, 'joined');
  insert into public.collab_members (room_id, user_id, status)
  select room, x, 'invited' from (select distinct unnest(p_friends) as x) d where x <> me;
  return room;
end $$;

create or replace function public.collab_invites()
returns table (room_id uuid, host_name text, host_buddy text, study_min int, break_min int, note text, people int, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.id, coalesce(sp.name, 'A friend'), coalesce(sp.buddy, 'gator'), r.study_min, r.break_min, r.note,
    (select count(*)::int from public.collab_members m2 where m2.room_id = r.id and m2.status in ('joined', 'invited')),
    r.created_at
  from public.collab_members m
  join public.collab_rooms r on r.id = m.room_id
  left join public.social_profiles sp on sp.user_id = r.host_id
  where m.user_id = public.pg_require_account() and m.status = 'invited' and r.ended_at is null
    and r.created_at > now() - interval '3 hours'
  order by r.created_at desc
$$;

create or replace function public.respond_collab(p_room uuid, p_accept boolean) returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.pg_require_account();
begin
  if public.pg_room_member(p_room, me) is distinct from 'invited' then return 'not_invited'; end if;
  if exists (select 1 from public.collab_rooms where id = p_room and ended_at is not null) then return 'ended'; end if;
  if not p_accept then
    update public.collab_members set status = 'declined', updated_at = now() where room_id = p_room and user_id = me;
    return 'declined';
  end if;
  if (select count(*) from public.collab_members where room_id = p_room and status = 'joined') >= 4 then return 'full'; end if;
  update public.collab_members set status = 'left', updated_at = now()
  where user_id = me and status = 'joined' and room_id <> p_room;
  update public.collab_members set status = 'joined', updated_at = now() where room_id = p_room and user_id = me;
  return 'joined';
end $$;

create or replace function public.leave_collab(p_room uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.pg_require_account();
begin
  update public.collab_members set status = 'left', updated_at = now() where room_id = p_room and user_id = me;
  if not exists (select 1 from public.collab_members where room_id = p_room and status = 'joined') then
    update public.collab_rooms set ended_at = now() where id = p_room and ended_at is null;
  end if;
end $$;

-- The room I'm in (or a given one): settings, timer state, the people in it, and the server's clock.
create or replace function public.collab_room(p_room uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.pg_require_account();
  r public.collab_rooms;
begin
  if p_room is null then
    select cr.* into r from public.collab_members m join public.collab_rooms cr on cr.id = m.room_id
    where m.user_id = me and m.status = 'joined' and cr.ended_at is null order by m.updated_at desc limit 1;
  else
    select * into r from public.collab_rooms where id = p_room;
    if public.pg_room_member(p_room, me) is distinct from 'joined' then return null; end if;
  end if;
  if r.id is null then return null; end if;
  return jsonb_build_object(
    'id', r.id, 'host', r.host_id, 'studyMin', r.study_min, 'breakMin', r.break_min, 'note', r.note,
    'state', r.state, 'v', r.state_v, 'ended', r.ended_at is not null, 'now', public.server_now_ms(),
    'members', (select coalesce(jsonb_agg(jsonb_build_object('id', m.user_id, 'name', coalesce(sp.name, 'Friend'),
        'buddy', coalesce(sp.buddy, 'gator'), 'status', m.status) order by m.status, sp.name), '[]'::jsonb)
      from public.collab_members m left join public.social_profiles sp on sp.user_id = m.user_id
      where m.room_id = r.id and m.status in ('joined', 'invited')));
end $$;

-- Change the shared timer. p_expected_v must be the version last seen, so two people pressing at once can't clash.
create or replace function public.set_collab_state(p_room uuid, p_state jsonb, p_expected_v bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.pg_require_account();
begin
  if public.pg_room_member(p_room, me) is distinct from 'joined' then return null; end if;
  update public.collab_rooms set state = p_state, state_v = state_v + 1
  where id = p_room and state_v = p_expected_v and ended_at is null;
  return public.collab_room(p_room);
end $$;

/* ---------------------------------------------------------------- who may call what */

do $$
declare fn text;
begin
  foreach fn in array array[
    'social_me(text, text)', 'add_friend(text)', 'respond_friend(uuid, boolean)', 'friends_overview(date)',
    'heartbeat(jsonb, jsonb)', 'send_support(uuid, date, text, text)', 'support_inbox()',
    'create_collab(uuid[], int, int, text)', 'collab_invites()', 'respond_collab(uuid, boolean)',
    'leave_collab(uuid)', 'collab_room(uuid)', 'set_collab_state(uuid, jsonb, bigint)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;
