-- StudyBuddy migration 3: a daily allowance of AI calls per person.
-- Paste into Supabase → SQL Editor → Run. Safe to run more than once.

create table if not exists public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null,
  calls   integer not null default 0,
  primary key (user_id, day)
);

alter table public.ai_usage enable row level security;

-- People can see their own count but not change it; only use_ai() below adds to it.
drop policy if exists "Own AI usage" on public.ai_usage;
create policy "Own AI usage" on public.ai_usage
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.ai_usage from anon;
revoke insert, update, delete on public.ai_usage from authenticated;
grant select on public.ai_usage to authenticated;

-- Count one AI call for the signed-in person (guests included) and return today's total.
create or replace function public.use_ai() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  n integer;
begin
  if me is null then raise exception 'not signed in' using errcode = '28000'; end if;
  insert into public.ai_usage as u (user_id, day, calls)
  values (me, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, day) do update set calls = u.calls + 1
  returning calls into n;
  return n;
end $$;

revoke execute on function public.use_ai() from public, anon;
grant execute on function public.use_ai() to authenticated;
