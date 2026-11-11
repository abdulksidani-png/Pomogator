-- PomoGator migration 8: limits on how much one account can store.
-- Paste all of it into Supabase → SQL Editor and click Run. Safe to run again.
--
-- Every table is already private to its owner. This adds ceilings, so one account (or a script signed in as one)
-- can't fill the database: a maximum number of rows per person in each table, and a maximum size for the big
-- text and JSON fields. The numbers are far above what studying produces. Rows that are already there are left
-- alone ("not valid" = only new and changed rows are checked).

/* ---------------------------------------------------------------- rows per person */

-- Runs once per insert statement and counts only the people who just added rows.
create or replace function public.pg_cap_rows() returns trigger
language plpgsql set search_path = '' as $$
declare
  lim  int := tg_argv[0]::int;
  over uuid;
begin
  execute format(
    'select t.user_id from %I.%I t where t.user_id in (select distinct a.user_id from added a) group by t.user_id having count(*) > $1 limit 1',
    tg_table_schema, tg_table_name) into over using lim;
  if over is not null then
    raise exception 'too_many_rows: % allows % rows per account', tg_table_name, lim using errcode = '54000';
  end if;
  return null;
end $$;

do $$
declare
  t text; n int;
  caps constant jsonb := '{"tasks": 500, "study_sessions": 10000, "quiz_attempts": 40000, "plans": 10000,
                           "documents": 300, "document_pages": 30000, "progress_events": 100000}';
begin
  for t, n in select key, value::int from jsonb_each_text(caps) loop
    if to_regclass('public.' || t) is null then continue; end if;   -- documents tables: only after migration 2
    execute format('drop trigger if exists %I on public.%I', t || '_cap', t);
    execute format('create trigger %I after insert on public.%I referencing new table as added for each statement execute function public.pg_cap_rows(%L)', t || '_cap', t, n);
  end loop;
end $$;

/* ---------------------------------------------------------------- size of each field */

do $$
declare
  r record;
begin
  for r in select * from (values
    ('profiles',        'profiles_settings_size',   'octet_length(settings::text) < 200000'),
    ('profiles',        'profiles_context_size',    'octet_length(context::text) < 200000'),
    ('profiles',        'profiles_app_state_size',  'octet_length(app_state::text) < 800000'),
    ('study_sessions',  'study_sessions_text_size', 'char_length(subject) <= 4000 and char_length(topic) <= 4000 and char_length(goal) <= 4000 and char_length(id) <= 100'),
    ('quiz_attempts',   'quiz_attempts_text_size',  'char_length(concept) <= 1000 and char_length(question) <= 6000 and char_length(chosen) <= 4000 and char_length(answer) <= 4000 and char_length(topic_key) <= 4000 and char_length(id) <= 150 and (options is null or octet_length(options::text) < 20000)'),
    ('plans',           'plans_data_size',          'octet_length(data::text) < 40000'),
    ('tasks',           'tasks_id_size',            'char_length(id) <= 100'),
    ('documents',       'documents_titles_size',    'octet_length(titles::text) < 400000 and char_length(id) <= 100 and (storage_path is null or char_length(storage_path) <= 500)'),
    ('document_pages',  'document_pages_text_size', 'char_length(text) <= 20000 and char_length(title) <= 300'),
    ('progress_events', 'progress_events_text_size','char_length(title) <= 1000 and char_length(id) <= 150')
  ) as x(tbl, name, expr) loop
    if to_regclass('public.' || r.tbl) is null then continue; end if;
    execute format('alter table public.%I drop constraint if exists %I', r.tbl, r.name);
    execute format('alter table public.%I add constraint %I check (%s) not valid', r.tbl, r.name, r.expr);
  end loop;
end $$;
