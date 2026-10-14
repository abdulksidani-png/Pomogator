-- Run after the migrations. Two users; each must only ever see their own rows.
\set ON_ERROR_STOP on
insert into auth.users (id, is_anonymous, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', true, '{}'),
  ('22222222-2222-2222-2222-222222222222', false, '{"full_name": "Bea Bee"}');

-- the signup trigger created both profiles
select 'profiles created', count(*) = 2 as ok from public.profiles;
select 'name copied from Google', display_name = 'Bea Bee' as ok from public.profiles where id = '22222222-2222-2222-2222-222222222222';

set role authenticated;
set request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

insert into public.study_sessions (user_id, id, started_at, local_date, planned_min, studied_min, counted, topic, quiz_status, quiz_score, quiz_total)
values ('11111111-1111-1111-1111-111111111111', 's1', now(), current_date, 25, 25, true, 'Krebs', 'done', 2, 3);
insert into public.quiz_attempts (user_id, id, session_id, topic_key, concept, question, correct, created_at) values
  ('11111111-1111-1111-1111-111111111111', 's1:0', 's1', 'bio|krebs', 'NADH yield', 'q', false, now() - interval '3 min'),
  ('11111111-1111-1111-1111-111111111111', 's1:1', 's1', 'bio|krebs', 'nadh yield', 'q', true,  now() - interval '2 min'),
  ('11111111-1111-1111-1111-111111111111', 's1:2', 's1', 'bio|krebs', 'Location',   'q', true,  now() - interval '1 min');
select public.sync_tasks('[{"id":"t1","text":"Read ch. 4","done":false},{"id":"t2","text":"Problem set","done":true}]'::jsonb, 1000);
update public.profiles set settings = '{"studyMin": 30}', settings_v = 5 where id = auth.uid();

select 'concept stats merge case', (select seen = 2 and missed = 1 and streak = 1 from public.concept_stats where lower(concept) = 'nadh yield') as ok;
select 'tasks synced in order', (select string_agg(id, ',' order by position) = 't1,t2' from public.tasks) as ok;
select 'tasks version stored', (select tasks_v = 1000 from public.profiles) as ok;

-- replacing the list removes tasks that are gone
select public.sync_tasks('[{"id":"t2","text":"Problem set","done":true}]'::jsonb, 2000);
select 'deleted task removed', (select count(*) = 1 from public.tasks) as ok;

-- user 2 sees none of user 1's data and cannot write as user 1
set request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';
select 'other user sees no sessions', (select count(*) = 0 from public.study_sessions) as ok;
select 'other user sees no answers', (select count(*) = 0 from public.quiz_attempts) as ok;
select 'other user sees no stats', (select count(*) = 0 from public.concept_stats) as ok;
select 'other user sees only own profile', (select count(*) = 1 from public.profiles) as ok;
update public.profiles set display_name = 'hacked' where id = '11111111-1111-1111-1111-111111111111';
select 'cannot edit another profile', true as ok;
do $$ begin
  insert into public.tasks (user_id, id, text) values ('11111111-1111-1111-1111-111111111111', 'evil', 'x');
  raise exception 'insert as another user was allowed';
exception when insufficient_privilege then null; end $$;
select 'cannot insert as another user', true as ok;

-- signed-out visitors get nothing at all
reset request.jwt.claims;
set role anon;
do $$ begin
  perform 1 from public.profiles;
  raise exception 'anon could read profiles';
exception when insufficient_privilege then null; end $$;
select 'signed-out visitors blocked', true as ok;

reset role;
select 'hack attempt had no effect', (select display_name = '' from public.profiles where id = '11111111-1111-1111-1111-111111111111') as ok;
