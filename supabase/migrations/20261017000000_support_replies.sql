-- PomoGator migration 5: reply to a friend's support message.
-- Paste all of it into Supabase → SQL Editor and click Run (after migration 4). Safe to run again.
--
-- A reply goes back to the friend who sent the message, delivered by your study buddy like any message.
-- Replies don't count toward the one-message-a-day limit, each message can get one reply, and replies can't be replied to.

alter table public.support_messages add column if not exists reply_to uuid references public.support_messages (id) on delete cascade;

-- One message per friend per day, not counting replies; one reply per message.
alter table public.support_messages drop constraint if exists support_messages_from_id_to_id_day_key;
create unique index if not exists support_messages_daily on public.support_messages (from_id, to_id, day) where reply_to is null;
create unique index if not exists support_messages_one_reply on public.support_messages (reply_to) where reply_to is not null;

create or replace function public.reply_support(p_message uuid, p_text text, p_buddy text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.pg_require_account();
  m public.support_messages;
begin
  select * into m from public.support_messages where id = p_message;
  if m.id is null or m.to_id <> me then return 'not_yours'; end if;
  if m.reply_to is not null then return 'is_reply'; end if;
  if not public.pg_are_friends(me, m.from_id) then return 'not_friends'; end if;
  if char_length(trim(coalesce(p_text, ''))) = 0 then return 'empty'; end if;
  begin
    insert into public.support_messages (from_id, to_id, day, buddy, text, reply_to)
    values (me, m.from_id, current_date, left(coalesce(p_buddy, 'gator'), 20), left(trim(p_text), 140), m.id);
  exception when unique_violation then return 'already_replied';
  end;
  update public.support_messages set seen_at = coalesce(seen_at, now()) where id = m.id;
  return 'sent';
end $$;
revoke all on function public.reply_support(uuid, text, text) from public, anon;
grant execute on function public.reply_support(uuid, text, text) to authenticated;

-- The inbox now says which messages are replies.
drop function if exists public.support_inbox();
create function public.support_inbox()
returns table (id uuid, from_name text, buddy text, text text, created_at timestamptz, is_reply boolean)
language sql stable security definer set search_path = '' as $$
  select s.id, coalesce(sp.name, 'A friend'), s.buddy, s.text, s.created_at, s.reply_to is not null
  from public.support_messages s left join public.social_profiles sp on sp.user_id = s.from_id
  where s.to_id = public.pg_require_account() and s.seen_at is null and s.created_at > now() - interval '3 days'
  order by s.created_at
$$;
revoke all on function public.support_inbox() from public, anon;
grant execute on function public.support_inbox() to authenticated;

-- "Already sent today" doesn't count replies.
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
    exists (select 1 from public.support_messages s, me where s.from_id = me.id and s.to_id = r.other
      and s.day = coalesce(p_day, current_date) and s.reply_to is null)
  from rel r
  join public.social_profiles sp on sp.user_id = r.other
  left join public.presence p on p.user_id = r.other
  order by r.relation, sp.name
$$;
