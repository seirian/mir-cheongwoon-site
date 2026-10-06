-- Approved platform search rollout. Preserve NOT NULL, title rules, identity index and RLS.
-- Empty string means unknown artist; never save a channel name or a display placeholder.
begin;
set local lock_timeout = '5s';
alter table public.songbook_entries drop constraint songbook_entries_artist_check;
alter table public.songbook_entries add constraint songbook_entries_artist_check
 check(char_length(trim(artist)) between 0 and 200);
notify pgrst, 'reload schema';
commit;
