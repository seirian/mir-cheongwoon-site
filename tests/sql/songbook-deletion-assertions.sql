-- Disposable PostgreSQL only. All fixture data rolls back.
begin;
create function pg_temp.ok(v boolean,label text) returns void language plpgsql as $$begin if v is not true then raise exception 'ASSERT: %',label;end if;end$$;
select pg_temp.ok((select count(*)=0 from public.songbook_deletions),'migration deletes no existing songs');
update public.songbook_sync_settings set base_catalog='[{"id":"mir-000000000001","title":"기본곡","artist":"기본가수"}]',enabled=true where id=1;
insert into public.songbook_entries(id,title,artist,categories,difficulty) values('custom-00000000-0000-4000-8000-000000000001','수동곡','','{가요}',4);
insert into public.songbook_ratings(song_id,proficiency) values('custom-00000000-0000-4000-8000-000000000001',5);
insert into public.songbook_auto_entries(id,identity_key,title,artist,active) values('custom-00000000-0000-4000-8000-000000000002','자동곡|가수','자동곡','가수',true);
insert into public.songbook_sync_vods(id,channel_id,station_no,bbs_no,title,uploaded_at,duration_seconds,public,next_check_at)
 values('209999999','alice427',24957466,90135165,'fixture',now()-interval '10 days',7200,true,now());
insert into public.songbook_timeline_candidates(id,vod_id,comment_id,seconds,title,artist,line,reason,song_id,decision,parser_version)
 values(repeat('d',64),'209999999','1',120,'자동곡','가수','🎵자동곡','clear_timeline','custom-00000000-0000-4000-8000-000000000002','auto','fixture');
select public.songbook_sync_rebuild('209999999');
set local role anon;
do $$begin
 begin perform public.songbook_delete('mir-000000000001',0);raise exception 'anonymous deleted';exception when insufficient_privilege then null;end;
 begin perform public.songbook_deleted_list(0);raise exception 'anonymous archive';exception when insufficient_privilege then null;end;
 begin perform * from public.songbook_deletions;raise exception 'audit leaked';exception when insufficient_privilege then null;end;
end$$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
do $$begin
 begin perform public.songbook_delete('mir-000000000001',0);raise exception 'member deleted';exception when insufficient_privilege then null;end;
 begin perform public.songbook_restore('mir-000000000001','00000000-0000-4000-8000-000000000099');raise exception 'member restored';exception when insufficient_privilege then null;end;
 begin perform public.songbook_deleted_list(0);raise exception 'member archive';exception when insufficient_privilege then null;end;
end$$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
do $$begin
 begin perform public.songbook_delete('custom-00000000-0000-4000-8000-000000000001',0);raise exception 'stale deletion';exception when serialization_failure then null;end;
 begin perform public.songbook_delete('mir-ffffffffffff',0);raise exception 'unknown deletion';exception when invalid_parameter_value then null;end;
 begin insert into public.songbook_deletions(song_id,title,artist) values('mir-000000000001','forged','');raise exception 'direct deletion';exception when insufficient_privilege then null;end;
end$$;
select pg_temp.ok((public.songbook_delete('custom-00000000-0000-4000-8000-000000000001',1)->>'status')='deleted','manual deletion');
select public.songbook_delete('custom-00000000-0000-4000-8000-000000000001',1);
select pg_temp.ok((select count(*)=0 from public.songbook_entries),'manual hidden in server reads');
select pg_temp.ok((select count(*)=0 from public.songbook_ratings),'deleted proficiency hidden');
select pg_temp.ok((public.songbook_deleted_list()->>'count')::int=1,'idempotent duplicate click');
select set_config('test.delete_token',public.songbook_deleted_list()->'rows'->0->>'delete_token',true);
select public.songbook_delete('mir-000000000001',0);
select pg_temp.ok((select count(song_id)=2 from public.songbook_deletions),'base tombstone publicly available');
select public.songbook_delete('custom-00000000-0000-4000-8000-000000000002',0);
select pg_temp.ok((select count(*)=0 from public.songbook_auto_entries),'automatic song hidden');
select pg_temp.ok((select count(*)=0 from public.songbook_auto_links),'automatic videos hidden');
select pg_temp.ok((select count(*)=0 from public.songbook_auto_media),'aggregated media hidden');
reset role;
select pg_temp.ok((select count(*)=1 from public.songbook_entries),'manual record retained');
select pg_temp.ok((select proficiency=5 from public.songbook_ratings),'rating retained');
select pg_temp.ok((select decision='auto' from public.songbook_timeline_candidates),'existing review decision retained');
-- A normal scheduled re-scan/rebuild can still complete; deleted output stays hidden.
set local role service_role;
select public.songbook_sync_rebuild('209999999');
select pg_temp.ok((select count(*)=1 from public.songbook_auto_links),'raw evidence retained across rebuild');
do $$begin
 begin perform public.songbook_sync_review('00000000-0000-4000-8000-000000000001',repeat('d',64),1,'approved','{"id":"custom-00000000-0000-4000-8000-000000000002","create":false}',120);raise exception 'approved deleted song';exception when object_not_in_prerequisite_state then null;end;
end$$;
reset role;
set local role anon;
select pg_temp.ok((select count(*)=0 from public.songbook_auto_media),'rebuild cannot republish deleted song');
reset role;
-- Even a privileged stale source write is rejected by the guard; no source data is physically removed.
do $$begin
 begin update public.songbook_entries set title='stale editor' where id='custom-00000000-0000-4000-8000-000000000001';raise exception 'updated deleted';exception when object_not_in_prerequisite_state then null;end;
end$$;
set local role authenticated;
select public.songbook_restore('custom-00000000-0000-4000-8000-000000000001',current_setting('test.delete_token')::uuid);
select pg_temp.ok((select difficulty=4 and artist='' from public.songbook_entries),'manual restored unchanged');
select pg_temp.ok((select proficiency=5 from public.songbook_ratings),'proficiency restored unchanged');
select public.songbook_delete('custom-00000000-0000-4000-8000-000000000001',1);
do $$begin
 begin perform public.songbook_restore('custom-00000000-0000-4000-8000-000000000001',current_setting('test.delete_token')::uuid);raise exception 'stale restore';exception when serialization_failure then null;end;
end$$;
select pg_temp.ok((public.songbook_deleted_list()->>'count')::int=3,'stale restore cannot undo newer deletion');
select pg_temp.ok((public.songbook_deleted_list(1)->>'count')::int=3 and jsonb_array_length(public.songbook_deleted_list(1)->'rows')=0,'empty page retains exact count');
reset role;
select pg_temp.ok((select not backfill_done and enabled from public.songbook_sync_settings),'schedule configuration untouched by deletion');
rollback;
\echo 'PASS: static/manual/auto deletion, no fallback, RLS and private audit, revisions, restore, scheduled rebuild safety'
