-- New production tables. Review tables are intentionally retained and never copied.
-- Apply once using the songbook_production_v4_release migration.
begin;
create table public.songbook_editors (
 user_id uuid primary key references auth.users(id) on delete cascade,
 role text not null check(role in ('owner','manager')),
 created_at timestamptz not null default now()
);
create unique index songbook_single_owner on public.songbook_editors(role) where role='owner';
alter table public.songbook_editors enable row level security;
revoke all on public.songbook_editors from anon,authenticated;
grant select,insert,update,delete on public.songbook_editors to authenticated;
create policy sb_prod_editor_read on public.songbook_editors for select to authenticated using(user_id=(select auth.uid()) or exists(select 1 from public.admins a where a.user_id=(select auth.uid())));
create policy sb_prod_editor_admin on public.songbook_editors for all to authenticated using(exists(select 1 from public.admins a where a.user_id=(select auth.uid()))) with check(exists(select 1 from public.admins a where a.user_id=(select auth.uid())));
create table public.songbook_entries (
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
create unique index songbook_entry_identity on public.songbook_entries(lower(regexp_replace(title,'[[:space:][:punct:]]','','g')),lower(regexp_replace(artist,'[[:space:][:punct:]]','','g')));
create table public.songbook_ratings (
 song_id text primary key check(song_id ~ '^(mir-[a-f0-9]{12}|custom-[a-f0-9-]{36})$'),
 proficiency smallint check(proficiency between 1 and 5),
 revision integer not null default 1,updated_at timestamptz not null default now()
);
alter table public.songbook_entries enable row level security;
alter table public.songbook_ratings enable row level security;
revoke all on public.songbook_entries,public.songbook_ratings from anon,authenticated;
grant select on public.songbook_entries,public.songbook_ratings to anon,authenticated;
grant insert,update on public.songbook_entries,public.songbook_ratings to authenticated;
create policy sb_prod_entries_read on public.songbook_entries for select to anon,authenticated using(true);
create policy sb_prod_entries_insert on public.songbook_entries for insert to authenticated with check(exists(select 1 from public.songbook_editors e where e.user_id=(select auth.uid())) or exists(select 1 from public.admins a where a.user_id=(select auth.uid())));
create policy sb_prod_entries_update on public.songbook_entries for update to authenticated using(exists(select 1 from public.songbook_editors e where e.user_id=(select auth.uid())) or exists(select 1 from public.admins a where a.user_id=(select auth.uid()))) with check(exists(select 1 from public.songbook_editors e where e.user_id=(select auth.uid())) or exists(select 1 from public.admins a where a.user_id=(select auth.uid())));
create policy sb_prod_ratings_read on public.songbook_ratings for select to anon,authenticated using(true);
create policy sb_prod_ratings_insert on public.songbook_ratings for insert to authenticated with check(exists(select 1 from public.songbook_editors e where e.user_id=(select auth.uid()) and e.role='owner'));
create policy sb_prod_ratings_update on public.songbook_ratings for update to authenticated using(exists(select 1 from public.songbook_editors e where e.user_id=(select auth.uid()) and e.role='owner')) with check(exists(select 1 from public.songbook_editors e where e.user_id=(select auth.uid()) and e.role='owner'));
create or replace function public.songbook_validate() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
declare value text;
begin
 if TG_OP='UPDATE' then
  if TG_TABLE_NAME='songbook_entries' then
   if NEW.id<>OLD.id then raise exception 'Identity is immutable'; end if;
  elsif TG_TABLE_NAME='songbook_ratings' then
   if NEW.song_id<>OLD.song_id then raise exception 'Identity is immutable'; end if;
  end if;
  NEW.revision=OLD.revision+1;
 else NEW.revision=1; end if;
 NEW.updated_at=now();
 if TG_TABLE_NAME='songbook_entries' then
  NEW.title=trim(NEW.title); NEW.artist=trim(NEW.artist);
  foreach value in array NEW.categories||NEW.aliases loop
   if value is null or char_length(trim(value)) not between 1 and 100 then raise exception 'Invalid category or alias'; end if;
  end loop;
  foreach value in array NEW.video_urls loop
   if value is null or char_length(value)>300 or value !~ '^https://((www[.])?youtube[.]com/watch[?]v=[A-Za-z0-9_-]{11}(&t=[0-9]+s?)?|youtu[.]be/[A-Za-z0-9_-]{11}([?]t=[0-9]+s?)?|vod[.](afreecatv[.]com|sooplive[.]co[.]kr|sooplive[.]com)/player/[0-9]+/?([?]change_second=[0-9]+)?)$' then raise exception 'Invalid video URL'; end if;
  end loop;
 end if;
 return NEW;
end $$;
revoke all on function public.songbook_validate() from public,anon,authenticated;
create trigger sb_prod_entries_validate before insert or update on public.songbook_entries for each row execute function public.songbook_validate();
create trigger sb_prod_ratings_validate before insert or update on public.songbook_ratings for each row execute function public.songbook_validate();
alter table public.songbook_entries add column artwork_url text not null default '', add column music_url text not null default '', add column album_title text not null default '';
alter table public.songbook_entries add constraint sb_prod3_album_length check(char_length(album_title)<=200), add constraint sb_prod3_artwork_url check(artwork_url='' or (char_length(artwork_url)<=1500 and position(chr(92) in artwork_url)=0 and artwork_url ~ '^https://is[0-9]+-ssl[.]mzstatic[.]com/image/thumb/[^[:space:]?#]+$' and music_url<>'')), add constraint sb_prod3_music_url check(music_url='' or (char_length(music_url)<=1500 and position(chr(92) in music_url)=0 and music_url ~ '^https://(music|itunes)[.]apple[.]com/[a-z]{2}/album/[^[:space:]?#]+/[0-9]+([?]i=[0-9]+)?$'));
notify pgrst,'reload schema';
commit;
