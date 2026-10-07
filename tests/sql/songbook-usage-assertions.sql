-- ISOLATED TEST DATABASE ONLY. All records roll back. Never run against production.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
insert into public.songbook_entries(id,title,artist,categories,video_urls,public_note,video_kinds)
values('custom-20000000-0000-4000-8000-000000000071','사용성 통합 테스트','가수',array['가요','기타'],array['https://www.youtube.com/watch?v=abcdefghijk&t=60'],'듀엣 시 가능','{"https://www.youtube.com/watch?v=abcdefghijk&t=60":"original"}');
do $$begin
 if not exists(select 1 from public.songbook_entries where id='custom-20000000-0000-4000-8000-000000000071' and request_status='unreviewed' and public_note='듀엣 시 가능' and video_kinds->>'https://www.youtube.com/watch?v=abcdefghijk&t=60'='original') then raise exception 'roundtrip_failed';end if;
 begin update public.songbook_entries set public_note=repeat('가',141) where id='custom-20000000-0000-4000-8000-000000000071';raise exception 'note_limit_not_enforced';exception when check_violation then null;end;
 begin update public.songbook_entries set video_kinds='[]' where id='custom-20000000-0000-4000-8000-000000000071';raise exception 'object_type_not_enforced';exception when sqlstate '22023' then null;end;
 begin update public.songbook_entries set video_kinds='{"https://www.youtube.com/watch?v=abcdefghijk&t=60":"bad"}' where id='custom-20000000-0000-4000-8000-000000000071';raise exception 'kind_not_enforced';exception when sqlstate '22023' then null;end;
end $$;
-- A pre-migration client updates old columns without erasing new fields.
update public.songbook_entries set artist='변경 가수' where id='custom-20000000-0000-4000-8000-000000000071';
do $$begin
 if not exists(select 1 from public.songbook_entries where id='custom-20000000-0000-4000-8000-000000000071' and public_note='듀엣 시 가능' and video_kinds<>'{}'::jsonb and revision=2) then raise exception 'old_client_erased_metadata';end if;
end $$;
reset role;set local role anon;
do $$begin
 if not exists(select 1 from public.songbook_entries where id='custom-20000000-0000-4000-8000-000000000071' and public_note='듀엣 시 가능') then raise exception 'public_read_failed';end if;
 begin update public.songbook_entries set public_note='unauthorized' where id='custom-20000000-0000-4000-8000-000000000071';raise exception 'anonymous_write_not_denied';exception when insufficient_privilege then null;end;
end $$;
reset role;set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
do $$declare n integer;begin
 update public.songbook_entries set public_note='unauthorized' where id='custom-20000000-0000-4000-8000-000000000071';get diagnostics n=row_count;if n<>0 then raise exception 'ordinary_member_write_succeeded';end if;
 begin insert into public.songbook_entries(id,title,artist,categories,public_note) values('custom-20000000-0000-4000-8000-000000000072','회원 삽입','',array['가요'],'bad');raise exception 'ordinary_member_insert_succeeded';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
update public.songbook_entries set video_urls='{}' where id='custom-20000000-0000-4000-8000-000000000071';
do $$begin
 if not exists(select 1 from public.songbook_entries where id='custom-20000000-0000-4000-8000-000000000071' and video_kinds='{}'::jsonb and public_note='듀엣 시 가능') then raise exception 'old_client_link_removal_failed';end if;
end $$;
reset role;rollback;
select 'PASS: public usage metadata, bounded validation, legacy updates/link removal, anonymous/member denial and unchanged admin RLS';
