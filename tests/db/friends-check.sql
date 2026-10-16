-- Run after the migrations (on a fresh database). Friends, sharing switches, support messages and study rooms.
-- Every line prints "ok = t"; ON_ERROR_STOP stops on anything unexpected.
\set ON_ERROR_STOP on
insert into auth.users (id, is_anonymous) values
  ('aaaaaaaa-0000-0000-0000-000000000001', false),  -- Ana
  ('aaaaaaaa-0000-0000-0000-000000000002', false),  -- Bo
  ('aaaaaaaa-0000-0000-0000-000000000003', false),  -- Cy (not a friend)
  ('aaaaaaaa-0000-0000-0000-000000000004', true);   -- a guest
set role authenticated;

-- Each makes a friend profile.
set request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-000000000002", "role": "authenticated", "is_anonymous": false}';
select 'profile made with a code', (select char_length(code) = 8 and name = 'Bo' from public.social_me('Bo', 'panther')) as ok;
set request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-000000000003", "role": "authenticated", "is_anonymous": false}';
select 'cy profile', (select name = 'Cy' from public.social_me('Cy', 'robot')) as ok;
set request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-000000000004", "role": "authenticated", "is_anonymous": true}';
do $$ begin perform public.social_me('Guest', null); raise exception 'guest got a profile'; exception when raise_exception then
  if sqlerrm <> 'guest' then raise; end if; end $$;
select 'guests cannot use friends', true as ok;

-- Ana adds Bo by code (lowercase, with a dash); Bo sees a request and accepts.
set request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-000000000001", "role": "authenticated", "is_anonymous": false}';
select public.social_me('Ana', 'gator');
reset role;
select set_config('test.bo_code', (select lower(substr(code, 1, 4) || '-' || substr(code, 5)) from public.social_profiles where name = 'Bo'), false);
set role authenticated;
select 'request sent', public.add_friend(current_setting('test.bo_code')) = 'requested' as ok;
select 'unknown code', public.add_friend('ZZZZZZZZ') = 'not_found' as ok;
select 'pending shows as sent', (select relation = 'sent' and online = false from public.friends_overview() where name = 'Bo') as ok;
select 'cannot see own friend list as someone else', (select count(*) = 1 from public.friendships) as ok;
set request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-000000000002", "role": "authenticated", "is_anonymous": false}';
select 'bo sees the request', (select relation = 'received' from public.friends_overview() where name = 'Ana') as ok;
select public.respond_friend('aaaaaaaa-0000-0000-0000-000000000001', true);
select 'now friends', (select relation = 'friend' from public.friends_overview() where name = 'Ana') as ok;

-- Bo shares online + music, not stats. Ana sees exactly that.
update public.social_profiles set share_music = true, share_stats = false, stats = '{"studyStreak": 4}' where user_id = auth.uid();
select public.heartbeat('{"state": "studying", "sessionMin": 12}', '{"title": "Song", "artist": "Band"}') > 0 as ok;
set request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-000000000001", "role": "authenticated", "is_anonymous": false}';
select 'online with activity and music, no stats', (select online and activity->>'state' = 'studying' and music->>'title' = 'Song' and stats is null
  from public.friends_overview() where name = 'Bo') as ok;
select 'presence table is private', (select count(*) = 0 from public.presence) as ok;
select 'profiles table is private', (select count(*) = 1 from public.social_profiles) as ok;
-- Bo turns off online: hidden.
set request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-000000000002", "role": "authenticated", "is_anonymous": false}';
update public.social_profiles set share_online = false, share_stats = true where user_id = auth.uid();
select public.heartbeat('{"state": "studying"}', null);
set request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-000000000001", "role": "authenticated", "is_anonymous": false}';
select 'offline when not shared, stats now shared', (select not online and activity is null and music is null and (stats->>'studyStreak')::int = 4
  from public.friends_overview() where name = 'Bo') as ok;
do $$ begin
  update public.social_profiles set code = 'HACKED00' where user_id = auth.uid();
  raise exception 'changed code';
exception when insufficient_privilege then null; end $$;
select 'friend code cannot be edited', true as ok;

-- Support messages: once per friend per day, friends only.
select 'support sent', public.send_support('aaaaaaaa-0000-0000-0000-000000000002', current_date, 'You got this!', 'gator') = 'sent' as ok;
select 'only one a day', public.send_support('aaaaaaaa-0000-0000-0000-000000000002', current_date, 'Again', 'gator') = 'already_sent' as ok;
select 'marked as sent today', (select supported_today from public.friends_overview(current_date) where name = 'Bo') as ok;
select 'not to strangers', public.send_support('aaaaaaaa-0000-0000-0000-000000000003', current_date, 'Hi', 'gator') = 'not_friends' as ok;
set request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-000000000002", "role": "authenticated", "is_anonymous": false}';
select 'bo gets it from Ana', (select from_name = 'Ana' and text = 'You got this!' and buddy = 'gator' and from_id is not null from public.support_inbox()) as ok;
-- Bo replies (once); a reply doesn't use up Bo's own message for today, and can't be replied to.
select set_config('test.msg', (select id::text from public.support_inbox()), false);
select 'reply sent', public.reply_support(current_setting('test.msg')::uuid, 'Thank you! 💛', 'panther') = 'sent' as ok;
select 'one reply per message', public.reply_support(current_setting('test.msg')::uuid, 'Again', 'panther') = 'already_replied' as ok;
select 'bo can still send his own message today', public.send_support('aaaaaaaa-0000-0000-0000-000000000001', current_date, 'Go Ana!', 'panther') = 'sent' as ok;
set request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-000000000001", "role": "authenticated", "is_anonymous": false}';
select 'ana gets the reply and the message', (select count(*) = 2 and bool_or(is_reply and text = 'Thank you! 💛') from public.support_inbox()) as ok;
select 'replies cannot be replied to', public.reply_support((select id from public.support_inbox() where is_reply), 'x', 'gator') = 'is_reply' as ok;
select 'not my message to reply to', public.reply_support(current_setting('test.msg')::uuid, 'x', 'gator') = 'not_yours' as ok;
update public.support_messages set seen_at = now() where to_id = auth.uid();
set request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-000000000002", "role": "authenticated", "is_anonymous": false}';
select 'seen messages leave the inbox', (select count(*) = 0 from public.support_inbox()) as ok;
do $$ begin
  update public.support_messages set text = 'edited' where to_id = auth.uid();
  raise exception 'edited text';
exception when insufficient_privilege then null; end $$;
select 'message text cannot be edited', true as ok;

-- Study together: only with friends; up to 3 invited; shared state with versions.
set request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-000000000001", "role": "authenticated", "is_anonymous": false}';
do $$ begin
  perform public.create_collab(array['aaaaaaaa-0000-0000-0000-000000000003']::uuid[], 25, 5, '');
  raise exception 'room with a stranger';
exception when raise_exception then if sqlerrm <> 'not_friends' then raise; end if; end $$;
select 'no rooms with strangers', true as ok;
select set_config('test.room', public.create_collab(array['aaaaaaaa-0000-0000-0000-000000000002']::uuid[], 30, 7, 'Chem cram')::text, false);
select 'host is in the room', (select (public.collab_room() ->> 'breakMin')::int = 7) as ok;
do $$ begin perform count(*) from public.collab_rooms; raise exception 'read rooms directly';
exception when insufficient_privilege then null; end $$;
select 'rooms are only reachable through the functions', true as ok;
set request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-000000000003", "role": "authenticated", "is_anonymous": false}';
select 'strangers cannot read the room', public.collab_room(current_setting('test.room')::uuid) is null as ok;
select 'strangers cannot change it', public.set_collab_state(current_setting('test.room')::uuid, '{"status": "running"}', 0) is null as ok;
set request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-000000000002", "role": "authenticated", "is_anonymous": false}';
select 'bo is invited, with the agreed break', (select host_name = 'Ana' and host_id is not null and break_min = 7 and note = 'Chem cram' and people = 2 from public.collab_invites()) as ok;
select 'bo joins', public.respond_collab(current_setting('test.room')::uuid, true) = 'joined' as ok;
select 'bo starts the timer', (public.set_collab_state(current_setting('test.room')::uuid, '{"phase": "study", "status": "running", "endAt": 123}', 0) ->> 'v')::int = 1 as ok;
set request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-000000000001", "role": "authenticated", "is_anonymous": false}';
select 'ana sees it', (select (r -> 'state' ->> 'endAt')::int = 123 and jsonb_array_length(r -> 'members') = 2 from (select public.collab_room() as r) x) as ok;
select 'stale version is ignored', (public.set_collab_state(current_setting('test.room')::uuid, '{"status": "paused"}', 0) -> 'state' ->> 'status') = 'running' as ok;
select public.leave_collab(current_setting('test.room')::uuid);
set request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-000000000002", "role": "authenticated", "is_anonymous": false}';
select public.leave_collab(current_setting('test.room')::uuid);
select 'room ends when everyone leaves', public.collab_room() is null as ok;

-- Unfriend, then delete an account: everything of theirs goes.
select public.respond_friend('aaaaaaaa-0000-0000-0000-000000000001', false);
select 'unfriended', (select count(*) = 0 from public.friends_overview()) as ok;
select public.delete_my_account();
reset role;
select 'account and its rows deleted', (select count(*) = 0 from auth.users where id = 'aaaaaaaa-0000-0000-0000-000000000002')
  and (select count(*) = 0 from public.social_profiles where user_id = 'aaaaaaaa-0000-0000-0000-000000000002')
  and (select count(*) = 0 from public.support_messages where to_id = 'aaaaaaaa-0000-0000-0000-000000000002') as ok;
