-- Run only in the disposable CI PostgreSQL database, after the production schema and new subsystem.
begin;
create function pg_temp.assert_true(v boolean,label text) returns void language plpgsql as $$begin if v is not true then raise exception 'ASSERT: %',label;end if;end$$;
select pg_temp.assert_true((select enabled=false from public.songbook_sync_settings),'default disabled');
select pg_temp.assert_true((public.songbook_sync_begin('disabled',false)->>'status')='disabled','disabled protects data');
update public.songbook_sync_settings set enabled=true where id=1;
select public.songbook_sync_begin('fixture',true)->>'run_id' as rid \gset
select pg_temp.assert_true((public.songbook_sync_begin('other',true)->>'status')='busy','global lease');
select pg_temp.assert_true((public.songbook_sync_begin('fixture',true)->>'run_id')=:'rid','lease idempotency');
select set_config('test.run_id',:'rid',true);
select public.songbook_sync_inventory(:'rid',jsonb_build_array(jsonb_build_object('id','208100000','channel_id','alice427','station_no',24957466,'bbs_no',90135165,'title','test vod','uploaded_at',now()-interval '10 days','duration_seconds',10000,'public',true),jsonb_build_object('id','208100001','channel_id','alice427','station_no',24957466,'bbs_no',90135165,'title','new vod','uploaded_at',now()-interval '6 days','duration_seconds',10000,'public',true)));
select set_config('test.candidate',jsonb_build_object('id',repeat('a',64),'vod_id','208100000','comment_id','12','seconds',120,'title','새 곡','artist','가수','line','00:02:00 새 곡 - 가수 🎵','reason','clear_timeline','decision','auto','parser_version','1.0.0','new_song',jsonb_build_object('id','custom-10000000-0000-4000-8000-000000000001','identity_key','새곡|가수'))::text,true);
select public.songbook_sync_apply(:'rid','208100000',jsonb_build_array(current_setting('test.candidate')::jsonb),repeat('1',64),1,0,now()+interval '1 day');
select pg_temp.assert_true((select count(*)=1 from public.songbook_auto_entries where active),'automatic new song published');
select pg_temp.assert_true((select url='https://vod.sooplive.com/player/208100000?change_second=120' from public.songbook_auto_links),'correct timestamp');
select pg_temp.assert_true((select count(*)=0 from public.songbook_entries),'manual table untouched');
select pg_temp.assert_true((select count(*)=0 from public.songbook_ratings),'proficiency untouched');
select public.songbook_sync_apply(:'rid','208100000',jsonb_build_array(current_setting('test.candidate')::jsonb),repeat('1',64),1,0,now()+interval '1 day');
select pg_temp.assert_true((select (stats->>'checked')::int=1 from public.songbook_sync_runs where id=:'rid'),'retry does not double count');
select pg_temp.assert_true((select count(*)=1 from public.songbook_auto_links),'retry does not duplicate links');
select public.songbook_sync_fail(:'rid','208100000','upstream_unavailable');
select pg_temp.assert_true((select count(*)=1 from public.songbook_auto_links),'failure never withdraws known good evidence');
select public.songbook_sync_apply(:'rid','208100000',jsonb_build_array(current_setting('test.candidate')::jsonb,jsonb_build_object('id',repeat('b',64),'vod_id','208100000','comment_id','13','seconds',130,'title','미정곡','artist','','line','00:02:10 구간 목록','reason','section_timestamp_only','decision','pending','parser_version','1.0.0')),repeat('2',64),2,0,now()+interval '1 day');
select pg_temp.assert_true((select count(*)=1 from public.songbook_auto_links),'pending hidden');
do $$begin
 begin perform public.songbook_sync_review('00000000-0000-4000-8000-000000000001',repeat('b',64),1,'approved','{"id":"mir-000000000001","create":false}',null);raise exception 'should reject missing time';exception when raise_exception then if SQLERRM='should reject missing time' then raise;end if;end;
 begin perform public.songbook_sync_review('00000000-0000-4000-8000-000000000002',repeat('b',64),1,'approved','{"id":"mir-000000000001","create":false}',150);raise exception 'should reject member';exception when raise_exception then if SQLERRM='should reject member' then raise;end if;end;
 begin perform public.songbook_sync_apply(current_setting('test.run_id')::uuid,'208100001','[]',repeat('3',64),0,0,now()+interval '1 day');raise exception 'should reject early';exception when raise_exception then if SQLERRM='should reject early' then raise;end if;end;
end $$;
select public.songbook_sync_review('00000000-0000-4000-8000-000000000001',repeat('b',64),1,'approved','{"id":"mir-000000000001","create":false}',180);
select pg_temp.assert_true((select seconds=180 from public.songbook_auto_links where song_id='mir-000000000001'),'approved timestamp replaces section anchor');
select public.songbook_sync_review('00000000-0000-4000-8000-000000000001',repeat('a',64),1,'rejected','{}');
select pg_temp.assert_true((select count(*)=0 from public.songbook_auto_entries where active),'rejection deactivates source-only song');
select public.songbook_sync_apply(:'rid','208100000',jsonb_build_array(current_setting('test.candidate')::jsonb),repeat('4',64),1,0,now()+interval '1 day');
select pg_temp.assert_true((select decision='rejected' from public.songbook_timeline_candidates where id=repeat('a',64)),'administrator rejection persists on recollection');
select pg_temp.assert_true((select present=false from public.songbook_timeline_candidates where id=repeat('b',64)),'complete response withdraws removed comment');
select pg_temp.assert_true((select count(*)=0 from public.songbook_auto_links),'withdrawn comment no longer public');
set local role anon;
do $$begin
 begin perform * from public.songbook_sync_settings;raise exception 'anon config exposed';exception when insufficient_privilege then null;end;
 begin perform * from public.songbook_timeline_candidates;raise exception 'anon evidence exposed';exception when insufficient_privilege then null;end;
 begin perform public.songbook_sync_begin('attacker',true);raise exception 'anon service RPC';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_true((select count(*)=0 from public.songbook_timeline_candidates),'member evidence RLS');
do $$begin
 begin perform public.songbook_sync_review('00000000-0000-4000-8000-000000000001',repeat('a',64),1,'rejected','{}');raise exception 'spoofed admin';exception when insufficient_privilege then null;end;
 begin insert into public.songbook_auto_entries(id,identity_key,title,artist) values('custom-20000000-0000-4000-8000-000000000001','evil','evil','evil');raise exception 'member import';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select pg_temp.assert_true((select count(*)=2 from public.songbook_timeline_candidates),'existing admin can review queue');
reset role;
select public.songbook_sync_review('00000000-0000-4000-8000-000000000001',repeat('a',64),2,'approved','{"id":"custom-10000000-0000-4000-8000-000000000001","create":false}',120);
select pg_temp.assert_true((select count(*)=1 from public.songbook_auto_links),'reapprove shows link');
select public.songbook_sync_inventory(:'rid',jsonb_build_array(jsonb_build_object('id','208100000','channel_id','alice427','station_no',24957466,'bbs_no',90135165,'title','restricted','uploaded_at',now()-interval '10 days','duration_seconds',10000,'public',false)));
select pg_temp.assert_true((select count(*)=0 from public.songbook_auto_links),'restricted video withdrawn');
select public.songbook_sync_finish(:'rid',null,true);
select pg_temp.assert_true((select lease_id is null from public.songbook_sync_settings),'lease released');
rollback;
\echo 'PASS: timeline delay, idempotency, admin review, visibility, manual protection and RLS'
