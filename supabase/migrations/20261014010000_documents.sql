-- StudyBuddy schema, part 2: documents, their pages, slide progress and goals.
-- Run after part 1 (20261014000000_core.sql), in the Supabase SQL Editor.

create table public.documents (
  user_id       uuid not null references auth.users (id) on delete cascade,
  id            text not null,
  name          text not null check (char_length(name) <= 200),
  kind          text not null check (kind in ('pdf', 'pptx', 'docx', 'text', 'image')),
  size_bytes    bigint not null default 0,
  page_count    integer not null default 0,
  titles        jsonb not null default '[]'::jsonb,   -- one title per page, for outlines and goals
  furthest_page integer not null default 0,           -- furthest page reached in any session
  storage_path  text,                                 -- the original file, in the private "documents" bucket
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.document_pages (
  user_id     uuid not null references auth.users (id) on delete cascade,
  document_id text not null,
  page_index  integer not null,
  title       text not null default '',
  text        text not null default '',
  primary key (user_id, document_id, page_index),
  foreign key (user_id, document_id) references public.documents (user_id, id) on delete cascade
);

-- Slide progress for each session. Screen tracking stores only what it read (page, title, confidence),
-- never the screen images themselves.
create table public.progress_events (
  user_id     uuid not null references auth.users (id) on delete cascade,
  id          text not null,
  session_id  text not null,
  at          timestamptz not null,
  page_index  integer,
  title       text not null default '',
  source      text not null check (source in ('screen', 'manual')),
  confidence  real,
  primary key (user_id, id),
  foreign key (user_id, session_id) references public.study_sessions (user_id, id) on delete cascade
);
create index progress_events_session on public.progress_events (user_id, session_id);

alter table public.study_sessions
  add column document_id     text,
  add column start_page      integer,
  add column end_page        integer,
  add column goal_page       integer,
  add column goal_met        boolean,
  add column progress_source text check (progress_source in ('screen', 'manual', 'assumed'));

alter table public.documents       enable row level security;
alter table public.document_pages  enable row level security;
alter table public.progress_events enable row level security;

create policy "Own documents" on public.documents
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Own document pages" on public.document_pages
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Own progress" on public.progress_events
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.documents, public.document_pages, public.progress_events from anon;
grant select, insert, update, delete on public.documents, public.document_pages, public.progress_events to authenticated;

create trigger documents_touch before update on public.documents for each row execute function public.touch_updated_at();

-- Private file storage for original uploads: each person can only reach their own folder ({user id}/...).
insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 52428800)
on conflict (id) do nothing;

create policy "Own files: read" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Own files: add" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Own files: replace" on storage.objects for update to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Own files: delete" on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
