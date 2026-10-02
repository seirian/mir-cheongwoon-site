-- Reference schema for an EMPTY isolated review environment, not an idempotent production upgrade.
-- Already applied through Supabase migration history:
-- songbook_preview_v2_editor_and_ratings + songbook_preview_v2_validate_table_identity.
-- Never automatically run this file against the existing project.
begin;
create table public.songbook_preview_editors (
 user_id uuid primary key references auth.users(id) on delete cascade,
 role text not null check(role in ('owner','manager')),
 created_at timestamptz not null default now()
);
create unique index songbook_preview_single_owner on public.songbook_preview_editors(role) where role='owner';
alter table public.songbook_preview_editors enable row level security;
revoke all on public.songbook_preview_editors from anon,authenticated;
grant select,insert,update,delete on public.songbook_preview_editors to authenticated;
create policy sb2_editor_read on public.songbook_preview_editors for select to authenticated using(user_id=(select auth.uid()) or exists(select 1 from public.admins a where a.user_id=(select auth.uid())));
create policy sb2_editor_admin on public.songbook_preview_editors for all to authenticated using(exists(select 1 from public.admins a where a.user_id=(select auth.uid()))) with check(exists(select 1 from public.admins a where a.user_id=(select auth.uid())));
create table public.songbook_preview_entries (
 id text primary key check(id ~ '^(mir-[a-f0-9]{12}|custom-[a-f0-9-]{36})$'),
 title text not null check(char_length(trim(title)) between 1 and 200),
 artist text not null check(char_length(trim(artist)) between 1 and 200),
 categories text[] not null check(cardinality(categories) between 1 and 10),
 aliases text[] not null default '{}' check(cardinality(aliases)<=20),
 video_urls text[] not null default '{}' check(cardinality(video_urls)<=10),
 difficulty smallint check(difficulty between 1 and 5),
 request_status text not null default 'unreviewed' check(request_status in ('unreviewed','available','unavailable')),
 revision integer not null default 1,updated_at timestamptz not null default now()
);
create unique index songbook_preview_entry_identity on public.songbook_preview_entries(lower(regexp_replace(title,'[[:space:][:punct:]]','','g')),lower(regexp_replace(artist,'[[:space:][:punct:]]','','g')));
create table public.songbook_preview_ratings (
 song_id text primary key check(song_id ~ '^(mir-[a-f0-9]{12}|custom-[a-f0-9-]{36})$'),
 proficiency smallint check(proficiency between 1 and 5),
 revision integer not null default 1,updated_at timestamptz not null default now()
);
alter table public.songbook_preview_entries enable row level security;
alter table public.songbook_preview_ratings enable row level security;
revoke all on public.songbook_preview_entries,public.songbook_preview_ratings from anon,authenticated;
grant select on public.songbook_preview_entries,public.songbook_preview_ratings to anon,authenticated;
grant insert,update on public.songbook_preview_entries,public.songbook_preview_ratings to authenticated;
create policy sb2_entries_read on public.songbook_preview_entries for select to anon,authenticated using(true);
create policy sb2_entries_insert on public.songbook_preview_entries for insert to authenticated with check(exists(select 1 from public.songbook_preview_editors e where e.user_id=(select auth.uid())) or exists(select 1 from public.admins a where a.user_id=(select auth.uid())));
create policy sb2_entries_update on public.songbook_preview_entries for update to authenticated using(exists(select 1 from public.songbook_preview_editors e where e.user_id=(select auth.uid())) or exists(select 1 from public.admins a where a.user_id=(select auth.uid()))) with check(exists(select 1 from public.songbook_preview_editors e where e.user_id=(select auth.uid())) or exists(select 1 from public.admins a where a.user_id=(select auth.uid())));
create policy sb2_ratings_read on public.songbook_preview_ratings for select to anon,authenticated using(true);
create policy sb2_ratings_insert on public.songbook_preview_ratings for insert to authenticated with check(exists(select 1 from public.songbook_preview_editors e where e.user_id=(select auth.uid()) and e.role='owner'));
create policy sb2_ratings_update on public.songbook_preview_ratings for update to authenticated using(exists(select 1 from public.songbook_preview_editors e where e.user_id=(select auth.uid()) and e.role='owner')) with check(exists(select 1 from public.songbook_preview_editors e where e.user_id=(select auth.uid()) and e.role='owner'));
create function public.songbook_preview_validate() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
declare value text;
begin
 if TG_OP='UPDATE' then
  if TG_TABLE_NAME='songbook_preview_entries' then
   if NEW.id<>OLD.id then raise exception 'Identity is immutable';end if;
  elsif TG_TABLE_NAME='songbook_preview_ratings' then
   if NEW.song_id<>OLD.song_id then raise exception 'Identity is immutable';end if;
  end if;
  NEW.revision=OLD.revision+1;
 else NEW.revision=1;end if;
 NEW.updated_at=now();
 if TG_TABLE_NAME='songbook_preview_entries' then
  NEW.title=trim(NEW.title);NEW.artist=trim(NEW.artist);
  foreach value in array NEW.categories||NEW.aliases loop
   if value is null or char_length(trim(value)) not between 1 and 100 then raise exception 'Invalid category or alias';end if;
  end loop;
  foreach value in array NEW.video_urls loop
   if value is null or char_length(value)>300 or value !~ '^https://((www\.)?youtube\.com/watch\?v=[A-Za-z0-9_-]{11}(&t=[0-9]+s?)?|youtu\.be/[A-Za-z0-9_-]{11}(\?t=[0-9]+s?)?|vod\.(afreecatv\.com|sooplive\.co\.kr|sooplive\.com)/player/[0-9]+/?)$' then raise exception 'Invalid video URL';end if;
  end loop;
 end if;
 return NEW;
end $$;
revoke all on function public.songbook_preview_validate() from public,anon,authenticated;
create trigger sb2_entries_validate before insert or update on public.songbook_preview_entries for each row execute function public.songbook_preview_validate();
create trigger sb2_ratings_validate before insert or update on public.songbook_preview_ratings for each row execute function public.songbook_preview_validate();
notify pgrst,'reload schema';
commit;
