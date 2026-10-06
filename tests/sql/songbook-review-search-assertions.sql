-- Disposable PostgreSQL only. Does not touch live song or review data.
begin;
create function pg_temp.assert_true(v boolean,label text) returns void language plpgsql as $$begin if v is not true then raise exception 'ASSERT: %',label;end if;end$$;
insert into public.songbook_sync_vods(id,channel_id,station_no,bbs_no,title,uploaded_at,duration_seconds,public,next_check_at)
values('209999999','alice427',24957466,90135165,'search fixture','2026-01-01',7200,true,now());
insert into public.songbook_timeline_candidates(id,vod_id,comment_id,seconds,title,artist,line,reason,decision,parser_version,first_seen_at)
select lpad(to_hex(n),64,'0'),'209999999',n::text,n,
 case when n=25 then '영물이다' when n=24 then 'Ｗｉｓｐ！' when n=23 then '50%_*"(),\ 테스트' else '검색곡 '||n end,
 case when n=25 then '이오몽' else '검증 가수' end,
 case when n=22 then '원문에서만 찾는 노래' else '타임라인 테스트' end,
 'artist_metadata_required','pending','fixture',now()-n*interval '1 minute' from generate_series(1,25)n;
insert into public.songbook_timeline_candidates(id,vod_id,comment_id,seconds,title,artist,line,reason,decision,parser_version)
select lpad(to_hex(100+n),64,'0'),'209999999',(100+n)::text,n,'영물이다','이오몽','test','clear_timeline',d,'fixture'
from unnest(array['auto','approved','rejected','excluded']) with ordinality t(d,n);
insert into public.songbook_timeline_candidates(id,vod_id,comment_id,seconds,title,artist,line,reason,decision,parser_version,present)
values(repeat('f',64),'209999999','300',0,'영물이다','이오몽','withdrawn','clear_timeline','pending','fixture',false);
select pg_temp.assert_true((select not prosecdef and provolatile='s' from pg_proc where oid='public.songbook_review_search(text,text,integer,integer)'::regprocedure),'invoker stable');
set local role anon;
do $$begin
 begin perform public.songbook_review_search('pending','영물이다');raise exception 'anonymous leak';exception when insufficient_privilege then null;end;
end$$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
do $$begin
 begin perform public.songbook_review_search('pending','영물이다');raise exception 'member leak';exception when insufficient_privilege then null;end;
end$$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select pg_temp.assert_true((public.songbook_review_search('pending','영물이다 이오몽')->>'count')::int=1,'find match beyond first three pages; withdrawn excluded');
select pg_temp.assert_true((public.songbook_review_search('pending','')->>'count')::int=25,'blank full tab');
select pg_temp.assert_true(jsonb_array_length(public.songbook_review_search('pending','',2)->'rows')=8,'third page full');
select pg_temp.assert_true(jsonb_array_length(public.songbook_review_search('pending','',3)->'rows')=1,'last page');
select pg_temp.assert_true((public.songbook_review_search('pending','',99)->>'count')::int=25 and jsonb_array_length(public.songbook_review_search('pending','',99)->'rows')=0,'empty page retains exact count for clamp');
select pg_temp.assert_true((public.songbook_review_search('pending','WiSp!')->>'count')::int=1,'case/fullwidth normalization');
select pg_temp.assert_true((public.songbook_review_search('pending','검증가수')->>'count')::int=24,'ignore stored whitespace');
select pg_temp.assert_true((public.songbook_review_search('pending','원문에서만')->>'count')::int=1,'original line searchable');
select pg_temp.assert_true((public.songbook_review_search('pending','209999999')->>'count')::int=25,'VOD ID searchable');
select pg_temp.assert_true((public.songbook_review_search('pending','%')->>'count')::int=1,'percent literal');
select pg_temp.assert_true((public.songbook_review_search('pending','_*"(),\')->>'count')::int=1,'other special chars literal');
select pg_temp.assert_true((public.songbook_review_search('pending',$payload$'); drop table public.admins; --$payload$)->>'count')::int=0,'SQL text cannot execute');
select pg_temp.assert_true((public.songbook_review_search('pending','없는곡')->>'count')::int=0,'no result');
select pg_temp.assert_true((public.songbook_review_search(d,'영물이다')->>'count')::int=1,'tab scope: '||d) from unnest(array['auto','approved','rejected','excluded'])d;
select pg_temp.assert_true(not((public.songbook_review_search('pending','영물이다')->'rows'->0)?'reviewed_by'),'no extra private columns');
do $$begin
 begin perform public.songbook_review_search('bad','q');raise exception 'accepted bad tab';exception when invalid_parameter_value then null;end;
 begin perform public.songbook_review_search('pending',repeat('가',201));raise exception 'accepted long query';exception when invalid_parameter_value then null;end;
 begin perform public.songbook_review_search('pending','q',-1);raise exception 'accepted page';exception when invalid_parameter_value then null;end;
 begin perform public.songbook_review_search('pending','q',0,51);raise exception 'accepted limit';exception when invalid_parameter_value then null;end;
end$$;
reset role;
select pg_temp.assert_true((select count(*)=30 from public.songbook_timeline_candidates),'search never mutates candidates');
select pg_temp.assert_true((select count(*)=0 from public.songbook_auto_links),'search never publishes');
rollback;
\echo 'PASS: complete-tab search, exact counts, literal matching, pagination, validation, read-only and RLS'
