-- Additive upgrade for the isolated preview tables only. Applied once via migration.
begin;
alter table public.songbook_preview_entries add column artwork_url text not null default '', add column music_url text not null default '', add column album_title text not null default '';
alter table public.songbook_preview_entries add constraint sb3_album_length check(char_length(album_title)<=200), add constraint sb3_artwork_url check(artwork_url='' or (char_length(artwork_url)<=1500 and position(chr(92) in artwork_url)=0 and artwork_url ~ '^https://is[0-9]+-ssl[.]mzstatic[.]com/image/thumb/[^[:space:]?#]+$' and music_url<>'')), add constraint sb3_music_url check(music_url='' or (char_length(music_url)<=1500 and position(chr(92) in music_url)=0 and music_url ~ '^https://(music|itunes)[.]apple[.]com/[a-z]{2}/album/[^[:space:]?#]+/[0-9]+([?]i=[0-9]+)?$'));
create or replace function public.songbook_preview_validate() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
declare value text;
begin
 if TG_OP='UPDATE' then
  if TG_TABLE_NAME='songbook_preview_entries' then
   if NEW.id<>OLD.id then raise exception 'Identity is immutable'; end if;
  elsif TG_TABLE_NAME='songbook_preview_ratings' then
   if NEW.song_id<>OLD.song_id then raise exception 'Identity is immutable'; end if;
  end if;
  NEW.revision=OLD.revision+1;
 else NEW.revision=1; end if;
 NEW.updated_at=now();
 if TG_TABLE_NAME='songbook_preview_entries' then
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
revoke all on function public.songbook_preview_validate() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
