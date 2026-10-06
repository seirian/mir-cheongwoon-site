-- Ephemeral CI database only. Everything written below is rolled back.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
insert into public.songbook_entries(id,title,artist,categories,video_urls)
values ('custom-11111111-2222-4333-8444-555555555551','가수 미확인 검증곡','','{가요}',
'{https://www.youtube.com/watch?v=abcdefghijk&t=62}');
do $$ begin
 if not exists(select 1 from public.songbook_entries where id='custom-11111111-2222-4333-8444-555555555551' and artist='' and revision=1 and request_status='unreviewed') then raise exception 'empty artist did not persist'; end if;
 begin
  insert into public.songbook_entries(id,title,artist,categories) values('custom-11111111-2222-4333-8444-555555555552','가수 미확인 검증곡','','{가요}');
  raise exception 'duplicate identity accepted';
 exception when unique_violation then null; end;
 begin
  update public.songbook_entries set artist=null where id='custom-11111111-2222-4333-8444-555555555551';
  raise exception 'null artist accepted';
 exception when not_null_violation then null; end;
 begin
  update public.songbook_entries set artist=repeat('가',201) where id='custom-11111111-2222-4333-8444-555555555551';
  raise exception 'oversized artist accepted';
 exception when check_violation then null; end;
 begin
  update public.songbook_entries set title='' where id='custom-11111111-2222-4333-8444-555555555551';
  raise exception 'blank title accepted';
 exception when check_violation then null; end;
 begin
  update public.songbook_entries set categories='{}' where id='custom-11111111-2222-4333-8444-555555555551';
  raise exception 'no category accepted';
 exception when check_violation then null; end;
end $$;
update public.songbook_entries set artist='확인한 가수', difficulty=4 where id='custom-11111111-2222-4333-8444-555555555551' and revision=1;
do $$ begin
 if not exists(select 1 from public.songbook_entries where id='custom-11111111-2222-4333-8444-555555555551' and artist='확인한 가수' and revision=2 and video_urls[1] like '%&t=62') then raise exception 'artist update lost metadata/revision'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
do $$ begin
 begin
  insert into public.songbook_entries(id,title,artist,categories) values('custom-11111111-2222-4333-8444-555555555553','일반 회원 차단','','{가요}');
  raise exception 'member wrote empty artist song';
 exception when insufficient_privilege then null; end;
 update public.songbook_entries set artist='' where id='custom-11111111-2222-4333-8444-555555555551';
 if found then raise exception 'member changed artist'; end if;
end $$;
reset role;
set local role anon;
do $$ begin
 if not exists(select 1 from public.songbook_entries where id='custom-11111111-2222-4333-8444-555555555551' and artist='확인한 가수') then raise exception 'anonymous read failed'; end if;
 begin
  insert into public.songbook_entries(id,title,artist,categories) values('custom-11111111-2222-4333-8444-555555555554','방문자 차단','','{가요}');
  raise exception 'anonymous insert accepted';
 exception when insufficient_privilege then null; end;
end $$;
rollback;
