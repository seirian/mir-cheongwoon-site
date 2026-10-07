-- Additive production fields for the approved third usability review.
-- No song/status/rating/deletion data or existing RLS policy is replaced.
begin;
set local lock_timeout='5s';
alter table public.songbook_entries
 add column public_note text not null default '' check(char_length(public_note)<=140),
 add column video_kinds jsonb not null default '{}'::jsonb
 check(jsonb_typeof(video_kinds)='object' and octet_length(video_kinds::text)<=8000);

create function public.songbook_usage_validate() returns trigger
language plpgsql security invoker set search_path=pg_catalog as $$
declare address text; kind jsonb; clean jsonb:='{}'::jsonb;
begin
 if new.video_kinds is null or jsonb_typeof(new.video_kinds)<>'object' or octet_length(new.video_kinds::text)>8000 then
  raise exception 'invalid_video_kinds' using errcode='22023';
 end if;
 for address,kind in select key,value from jsonb_each(new.video_kinds) loop
  if jsonb_typeof(kind)<>'string' or (kind#>>'{}') not in ('','original','mir','broadcast','other') then
   raise exception 'invalid_video_kind' using errcode='22023';
  end if;
  -- Older clients can remove a link without knowing this new column. Drop only orphan labels.
  if address=any(new.video_urls) then clean=clean||jsonb_build_object(address,kind);end if;
 end loop;
 new.video_kinds=clean;
 return new;
end $$;
revoke all on function public.songbook_usage_validate() from public,anon,authenticated,service_role;
create trigger sb_usage_validate before insert or update on public.songbook_entries
 for each row execute function public.songbook_usage_validate();
comment on column public.songbook_entries.public_note is 'Public request guidance, not a private admin memo; existing site-admin-only writes.';
comment on column public.songbook_entries.video_kinds is 'Optional administrator-assigned video purpose. First YouTube ordering remains derived, never proof of official/performance identity.';
notify pgrst,'reload schema';
commit;
