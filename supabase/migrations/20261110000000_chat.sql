-- PomoGator migration 7: chat between friends, Do Not Disturb, and a site-wide daily ceiling for AI calls.
-- Paste into Supabase → SQL Editor → Run. Safe to run more than once. Needs migrations 3 and 4.
-- Nothing here changes what older versions of the site rely on: it only adds.

/* ---------------------------------------------------------------- do not disturb */

-- Friends see a small "do not disturb" mark; the person's own browser stops popping up messages and invites.
alter table public.social_profiles add column if not exists dnd boolean not null default false;
grant update (dnd) on public.social_profiles to authenticated;

-- Switch my Do Not Disturb on or off.
create or replace function public.set_dnd(p_on boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.pg_require_account();
begin
  update public.social_profiles set dnd = coalesce(p_on, false), updated_at = now() where user_id = me;
  return coalesce(p_on, false);
end $$;
revoke all on function public.set_dnd(boolean) from public, anon;
grant execute on function public.set_dnd(boolean) to authenticated;

-- The friends list also says who has Do Not Disturb on. (The return type grows, so the function is replaced.)
drop function if exists public.friends_overview(date);
create function public.friends_overview(p_day date default null)
returns table (user_id uuid, name text, buddy text, relation text, online boolean, activity jsonb, music jsonb, stats jsonb, supported_today boolean, dnd boolean)
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
    exists (select 1 from public.support_messages s, me where s.from_id = me.id and s.to_id = r.other
      and s.day = coalesce(p_day, current_date) and s.reply_to is null),
    (r.relation = 'friend' and sp.dnd)
  from rel r
  join public.social_profiles sp on sp.user_id = r.other
  left join public.presence p on p.user_id = r.other
  order by r.relation, sp.name
$$;
revoke all on function public.friends_overview(date) from public, anon;
grant execute on function public.friends_overview(date) to authenticated;

/* ---------------------------------------------------------------- chat */

-- Messages between two friends. They are not kept: anything older than 24 hours is never shown and is deleted
-- the next time anyone sends a message.
create table if not exists public.chat_messages (
  id         uuid primary key default gen_random_uuid(),
  from_id    uuid not null references auth.users (id) on delete cascade,
  to_id      uuid not null references auth.users (id) on delete cascade,
  text       text not null check (char_length(text) between 1 and 500),
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index if not exists chat_messages_to on public.chat_messages (to_id, created_at);
create index if not exists chat_messages_from on public.chat_messages (from_id, created_at);
create index if not exists chat_messages_age on public.chat_messages (created_at);

-- No direct access: everything goes through the functions below, which check the friendship.
alter table public.chat_messages enable row level security;
revoke all on public.chat_messages from anon, authenticated;

create or replace function public.pg_are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.friendships f
    where f.user_a = least(a, b) and f.user_b = greatest(a, b) and f.status = 'accepted')
$$;
revoke all on function public.pg_are_friends(uuid, uuid) from public, anon, authenticated;

-- Send a message to a friend. Returns 'sent', 'not_friends', 'empty' or 'too_fast' (more than 20 in half a minute).
create or replace function public.send_chat(p_to uuid, p_text text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.pg_require_account();
  t text := left(btrim(coalesce(p_text, '')), 500);
begin
  if t = '' then return 'empty'; end if;
  if p_to is null or p_to = me or not public.pg_are_friends(me, p_to) then return 'not_friends'; end if;
  if (select count(*) from public.chat_messages m where m.from_id = me and m.created_at > now() - interval '30 seconds') >= 20 then
    return 'too_fast';
  end if;
  delete from public.chat_messages where created_at < now() - interval '24 hours';
  insert into public.chat_messages (from_id, to_id, text) values (me, p_to, t);
  return 'sent';
end $$;

-- The last 24 hours of messages with one friend, oldest first. Opening the chat marks their messages as read.
create or replace function public.chat_with(p_friend uuid)
returns table (id uuid, mine boolean, text text, created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.pg_require_account();
begin
  update public.chat_messages m set read_at = now()
    where m.to_id = me and m.from_id = p_friend and m.read_at is null;
  return query
    select m.id, m.from_id = me, m.text, m.created_at
    from public.chat_messages m
    where m.created_at > now() - interval '24 hours'
      and ((m.from_id = me and m.to_id = p_friend) or (m.from_id = p_friend and m.to_id = me))
    order by m.created_at, m.id
    limit 300;
end $$;

-- Unread messages for me, per friend: how many, and the newest one (for the popup).
create or replace function public.chat_unread()
returns table (from_id uuid, unread int, last_id uuid, last_text text, last_at timestamptz)
language sql stable security definer set search_path = '' as $$
  with mine as (
    select m.* from public.chat_messages m
    where m.to_id = public.pg_require_account() and m.read_at is null and m.created_at > now() - interval '24 hours'
  )
  select x.from_id, count(*)::int,
    (array_agg(x.id order by x.created_at desc, x.id desc))[1],
    (array_agg(x.text order by x.created_at desc, x.id desc))[1],
    max(x.created_at)
  from mine x group by x.from_id
$$;

do $$
declare fn text;
begin
  foreach fn in array array['send_chat(uuid, text)', 'chat_with(uuid)', 'chat_unread()'] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;

/* ---------------------------------------------------------------- AI: a ceiling for the whole site */

-- How many AI calls everyone has made today (UTC), so the site can stop at a daily total. Only the number
-- is returned, never who made them.
create or replace function public.ai_calls_today() returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(u.calls), 0)::int from public.ai_usage u where u.day = (now() at time zone 'utc')::date
$$;
revoke all on function public.ai_calls_today() from public, anon;
grant execute on function public.ai_calls_today() to authenticated;
