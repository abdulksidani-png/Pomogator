-- StudyBuddy schema, part 1: profiles, tasks, study sessions, quiz attempts, plans.
-- Run this once in the Supabase SQL Editor (or with `supabase db push`).
-- Every table is private to its owner through Row Level Security.

------------------------------------------------------------------------------
-- Profiles: one row per user (guests included). Settings, the study panel and
-- the in-progress timer/quiz state are stored as JSON "slices", each with a
-- version (milliseconds) so the newest copy wins when two devices disagree.
------------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text not null default '' check (char_length(display_name) <= 80),
  timezone      text not null default 'UTC',
  week_start    smallint not null default 1 check (week_start in (0, 1)),      -- 0 = Sunday, 1 = Monday
  rollover_hour smallint not null default 0 check (rollover_hour between 0 and 6), -- hour a new day starts
  streak_freeze boolean not null default false,
  settings      jsonb not null default '{}'::jsonb,
  context       jsonb not null default '{}'::jsonb,
  app_state     jsonb not null default '{}'::jsonb,
  settings_v    bigint not null default 0,
  context_v     bigint not null default 0,
  app_state_v   bigint not null default 0,
  tasks_v       bigint not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.tasks (
  user_id    uuid not null references auth.users (id) on delete cascade,
  id         text not null,
  text       text not null check (char_length(text) <= 300),
  done       boolean not null default false,
  position   integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

------------------------------------------------------------------------------
-- Study sessions and the quiz answers that belong to them.
------------------------------------------------------------------------------
create table public.study_sessions (
  user_id     uuid not null references auth.users (id) on delete cascade,
  id          text not null,
  started_at  timestamptz not null,
  ended_at    timestamptz,
  local_date  date not null,                 -- the day it counts for, in the user's time zone and rollover
  planned_min numeric(5, 1) not null,
  studied_min numeric(6, 1),
  counted     boolean not null default false, -- reached at least half of the planned time
  subject     text not null default '',
  topic       text not null default '',
  level       text not null default 'intro',
  goal        text not null default '',
  quiz_status text check (quiz_status in ('done', 'partial', 'skipped', 'too-short', 'unavailable', 'no-topic')),
  quiz_score  smallint,
  quiz_total  smallint,
  break_min   smallint,
  break_kind  text check (break_kind in ('short', 'long')),
  updated_at  timestamptz not null default now(),
  primary key (user_id, id)
);
create index study_sessions_user_date on public.study_sessions (user_id, local_date);

create table public.quiz_attempts (
  user_id       uuid not null references auth.users (id) on delete cascade,
  id            text not null,
  session_id    text not null,
  topic_key     text not null default '',
  concept       text not null,
  question      text not null,
  chosen        text not null default '',
  answer        text not null default '',
  correct       boolean not null,
  options       jsonb,
  correct_index smallint,
  chosen_index  smallint,
  source_page   integer,
  created_at    timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, session_id) references public.study_sessions (user_id, id) on delete cascade
);
create index quiz_attempts_concept on public.quiz_attempts (user_id, topic_key, lower(concept));

create table public.plans (
  user_id    uuid not null references auth.users (id) on delete cascade,
  session_id text not null,
  data       jsonb not null,
  applied    boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, session_id),
  foreign key (user_id, session_id) references public.study_sessions (user_id, id) on delete cascade
);

------------------------------------------------------------------------------
-- Concept stats, computed from quiz answers. "streak" counts right answers
-- since the last miss; a concept counts as mastered once it reaches 2.
------------------------------------------------------------------------------
create view public.concept_stats with (security_invoker = true) as
select
  user_id,
  topic_key,
  min(concept)                                   as concept,
  count(*)                                       as seen,
  count(*) filter (where not correct)            as missed,
  count(*) filter (where correct and created_at > coalesce(last_miss, '-infinity'::timestamptz)) as streak,
  max(created_at)                                as last_seen
from (
  select a.*,
         max(a.created_at) filter (where not a.correct)
           over (partition by a.user_id, a.topic_key, lower(a.concept)) as last_miss
  from public.quiz_attempts a
) s
group by user_id, topic_key, lower(concept);

------------------------------------------------------------------------------
-- Row Level Security: people only ever see and change their own rows.
------------------------------------------------------------------------------
alter table public.profiles       enable row level security;
alter table public.tasks          enable row level security;
alter table public.study_sessions enable row level security;
alter table public.quiz_attempts  enable row level security;
alter table public.plans          enable row level security;

create policy "Own profile" on public.profiles
  for all to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "Own tasks" on public.tasks
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Own sessions" on public.study_sessions
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Own quiz answers" on public.quiz_attempts
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Own plans" on public.plans
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Signed-out visitors (the "anon" role) get nothing. Guests sign in anonymously,
-- which gives them the "authenticated" role and their own user id.
revoke all on public.profiles, public.tasks, public.study_sessions, public.quiz_attempts, public.plans, public.concept_stats from anon;
grant select, insert, update, delete on public.profiles, public.tasks, public.study_sessions, public.quiz_attempts, public.plans to authenticated;
grant select on public.concept_stats to authenticated;

------------------------------------------------------------------------------
-- Housekeeping triggers.
------------------------------------------------------------------------------
create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger tasks_touch before update on public.tasks for each row execute function public.touch_updated_at();
create trigger study_sessions_touch before update on public.study_sessions for each row execute function public.touch_updated_at();

-- Every new user, guests included, gets a profile row.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), 80))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

------------------------------------------------------------------------------
-- Replace the signed-in user's whole to-do list in one call.
-- items: [{"id": "...", "text": "...", "done": false}, ...] in display order.
------------------------------------------------------------------------------
create function public.sync_tasks(items jsonb, version bigint) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if jsonb_typeof(items) <> 'array' then
    raise exception 'items must be an array' using errcode = '22023';
  end if;

  delete from public.tasks t
  where t.user_id = uid
    and t.id not in (select x ->> 'id' from jsonb_array_elements(items) as x);

  insert into public.tasks (user_id, id, text, done, position)
  select uid, x ->> 'id', left(x ->> 'text', 300), coalesce((x ->> 'done')::boolean, false), (ord - 1)::integer
  from jsonb_array_elements(items) with ordinality as e(x, ord)
  where coalesce(x ->> 'id', '') <> ''
  on conflict (user_id, id) do update
    set text = excluded.text, done = excluded.done, position = excluded.position;

  update public.profiles set tasks_v = greatest(tasks_v, version) where id = uid;
end $$;

revoke execute on function public.sync_tasks(jsonb, bigint) from public, anon;
grant execute on function public.sync_tasks(jsonb, bigint) to authenticated;
