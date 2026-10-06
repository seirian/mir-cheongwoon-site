-- Logical deletion across static, manual and automatic catalogs. No existing song is deleted by this migration.
begin;
create table public.songbook_deletions (
 song_id text primary key check(song_id ~ '^(mir-[a-f0-9]{12}|custom-[a-f0-9-]{36})$'),
 title text not null, artist text not null,
 deleted_at timestamptz not null default now(),
 deleted_by uuid references auth.users(id) on delete set null,
 delete_token uuid not null default gen_random_uuid()
);
alter table public.songbook_deletions enable row level security;
revoke all on public.songbook_deletions from public,anon,authenticated,service_role;
-- Only IDs are public, so the static catalog can also be filtered. Audit fields remain private.
grant select(song_id) on public.songbook_deletions to anon,authenticated;
grant select on public.songbook_deletions to service_role;
create policy sb_deletions_ids on public.songbook_deletions for select to anon,authenticated,service_role using(true);

alter policy sb_prod_entries_read on public.songbook_entries using(not exists(select 1 from public.songbook_deletions d where d.song_id=songbook_entries.id));
alter policy sb_prod_ratings_read on public.songbook_ratings using(not exists(select 1 from public.songbook_deletions d where d.song_id=songbook_ratings.song_id));
alter policy sb_auto_public on public.songbook_auto_entries using(active and not exists(select 1 from public.songbook_deletions d where d.song_id=songbook_auto_entries.id));
alter policy sb_links_public on public.songbook_auto_links using(not exists(select 1 from public.songbook_deletions d where d.song_id=songbook_auto_links.song_id));

-- Narrow admin-only RPCs: caller identity is read from auth.uid(), never from a supplied user ID.
create function public.songbook_delete(p_song_id text,p_expected_revision integer) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare actor uuid:=(select auth.uid()); item jsonb; rev integer;
begin
 if actor is null or not exists(select 1 from public.admins where user_id=actor) then
  raise exception 'administrator_required' using errcode='42501';end if;
 if p_song_id is null or p_song_id !~ '^(mir-[a-f0-9]{12}|custom-[a-f0-9-]{36})$'
  or p_expected_revision is null or p_expected_revision<0 then raise exception 'invalid_song' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('songbook-delete:'||p_song_id,0));
 if exists(select 1 from public.songbook_deletions where song_id=p_song_id) then
  return jsonb_build_object('status','deleted','song_id',p_song_id);end if;
 select to_jsonb(e),e.revision into item,rev from public.songbook_entries e where id=p_song_id for update;
 if coalesce(rev,0)<>p_expected_revision then raise exception 'song_changed' using errcode='40001';end if;
 if item is null then select to_jsonb(a) into item from public.songbook_auto_entries a where id=p_song_id and active;end if;
 if item is null then
  select s into item from public.songbook_sync_settings cfg cross join lateral jsonb_array_elements(cfg.base_catalog) s
  where cfg.id=1 and s->>'id'=p_song_id limit 1;
 end if;
 if item is null then raise exception 'song_not_found' using errcode='22023';end if;
 insert into public.songbook_deletions(song_id,title,artist,deleted_by)
 values(p_song_id,item->>'title',coalesce(item->>'artist',''),actor);
 return jsonb_build_object('status','deleted','song_id',p_song_id);
end $$;

create function public.songbook_restore(p_song_id text,p_delete_token uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if (select auth.uid()) is null or not exists(select 1 from public.admins where user_id=(select auth.uid())) then
  raise exception 'administrator_required' using errcode='42501';end if;
 if p_song_id is null or p_delete_token is null then raise exception 'invalid_song' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('songbook-delete:'||p_song_id,0));
 delete from public.songbook_deletions where song_id=p_song_id and delete_token=p_delete_token;
 if not found then raise exception 'deletion_changed' using errcode='40001';end if;
 return jsonb_build_object('status','restored','song_id',p_song_id);
end $$;

create function public.songbook_deleted_list(p_page integer default 0) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare result jsonb;
begin
 if (select auth.uid()) is null or not exists(select 1 from public.admins where user_id=(select auth.uid())) then
  raise exception 'administrator_required' using errcode='42501';end if;
 if p_page is null or p_page<0 or p_page>=10000 then raise exception 'invalid_page' using errcode='22023';end if;
 select jsonb_build_object('count',(select count(*) from public.songbook_deletions),
  'rows',coalesce((select jsonb_agg(to_jsonb(d) order by d.deleted_at desc,d.song_id) from (
   select song_id,title,artist,deleted_at,delete_token from public.songbook_deletions order by deleted_at desc,song_id offset p_page*20 limit 20
  ) d),'[]'::jsonb)) into result;
 return result;
end $$;
revoke all on function public.songbook_delete(text,integer),public.songbook_restore(text,uuid),public.songbook_deleted_list(integer) from public,anon,authenticated,service_role;
grant execute on function public.songbook_delete(text,integer),public.songbook_restore(text,uuid),public.songbook_deleted_list(integer) to authenticated;

-- Stale editors must not successfully modify a deleted song. Raw data is retained for recovery.
create function public.songbook_deleted_write_guard() returns trigger
language plpgsql security invoker set search_path=pg_catalog as $$
declare sid text;
begin
 if TG_TABLE_NAME='songbook_entries' then sid:=NEW.id;else sid:=NEW.song_id;end if;
 perform pg_advisory_xact_lock(hashtextextended('songbook-delete:'||sid,0));
 if exists(select 1 from public.songbook_deletions where song_id=sid) then raise exception 'song_deleted' using errcode='55000';end if;
 return NEW;
end $$;
create trigger sb_deleted_write_guard before insert or update on public.songbook_entries for each row execute function public.songbook_deleted_write_guard();
create trigger sb_deleted_write_guard before insert or update on public.songbook_ratings for each row execute function public.songbook_deleted_write_guard();

-- Keep scheduled scans and prior decisions intact, but do not acknowledge a new approval into a deleted song.
create function public.songbook_deleted_review_guard() returns trigger
language plpgsql security invoker set search_path=pg_catalog as $$
begin
 if NEW.decision='approved' and (TG_OP='INSERT' or NEW.reviewed_at is distinct from OLD.reviewed_at or NEW.song_id is distinct from OLD.song_id)
  and exists(select 1 from public.songbook_deletions where song_id=NEW.song_id) then
  raise exception 'song_deleted' using errcode='55000';
 end if;
 return NEW;
end $$;
create trigger sb_deleted_review_guard before insert or update on public.songbook_timeline_candidates for each row execute function public.songbook_deleted_review_guard();
revoke all on function public.songbook_deleted_write_guard(),public.songbook_deleted_review_guard() from public,anon,authenticated,service_role;
comment on table public.songbook_deletions is 'Admin-controlled logical deletion; public IDs suppress static songs and RLS suppresses manual/automatic output. Sources are retained for restore and ingestion identity matching.';
notify pgrst,'reload schema';
commit;
