-- Migration 6: who sent a support message, and who hosts a study invite, so each person can show their own
-- nickname for that friend (nicknames are private and live in the browser's synced settings, not here).
-- Safe to run more than once. Needs migrations 4 and 5.

drop function if exists public.support_inbox();
create function public.support_inbox()
returns table (id uuid, from_name text, buddy text, text text, created_at timestamptz, is_reply boolean, from_id uuid)
language sql stable security definer set search_path = '' as $$
  select s.id, coalesce(sp.name, 'A friend'), s.buddy, s.text, s.created_at, s.reply_to is not null, s.from_id
  from public.support_messages s left join public.social_profiles sp on sp.user_id = s.from_id
  where s.to_id = public.pg_require_account() and s.seen_at is null and s.created_at > now() - interval '3 days'
  order by s.created_at
$$;
revoke all on function public.support_inbox() from public, anon;
grant execute on function public.support_inbox() to authenticated;

drop function if exists public.collab_invites();
create function public.collab_invites()
returns table (room_id uuid, host_name text, host_buddy text, study_min int, break_min int, note text, people int, created_at timestamptz, host_id uuid)
language sql stable security definer set search_path = '' as $$
  select r.id, coalesce(sp.name, 'A friend'), coalesce(sp.buddy, 'gator'), r.study_min, r.break_min, r.note,
    (select count(*)::int from public.collab_members m2 where m2.room_id = r.id and m2.status in ('joined', 'invited')),
    r.created_at, r.host_id
  from public.collab_members m
  join public.collab_rooms r on r.id = m.room_id
  left join public.social_profiles sp on sp.user_id = r.host_id
  where m.user_id = public.pg_require_account() and m.status = 'invited' and r.ended_at is null
    and r.created_at > now() - interval '3 hours'
  order by r.created_at desc
$$;
revoke all on function public.collab_invites() from public, anon;
grant execute on function public.collab_invites() to authenticated;
