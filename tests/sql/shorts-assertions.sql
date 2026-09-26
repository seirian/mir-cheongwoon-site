-- Read permissions work; configs/tokens, cache writes and RPC are not public.
set role anon;
select count(*) from public.recent_shorts;
do $$ begin
  begin perform 1 from public.recent_shorts_sync_config; raise exception 'config leaked'; exception when insufficient_privilege then null; end;
  begin delete from public.recent_shorts; raise exception 'anon deleted cache'; exception when insufficient_privilege then null; end;
  begin perform public.replace_recent_shorts(1,'[]'); raise exception 'anon invoked RPC'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set role authenticated;
do $$ begin
  if exists(select 1 from public.recent_shorts_sync_runs) then raise exception 'non-admin log leak'; end if;
  begin perform 1 from public.recent_shorts_sync_config; raise exception 'config leaked'; exception when insufficient_privilege then null; end;
  begin perform public.replace_recent_shorts(1,'[]'); raise exception 'non-admin invoked RPC'; exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Inject a database error after DELETE to prove that replacement rolls back atomically.
create function public.test_reject_short() returns trigger language plpgsql as $$ begin
  if new.title='__fail__' then raise exception 'injected_insert_failure'; end if;
  return new;
end $$;
create trigger test_reject before insert on public.recent_shorts for each row execute function public.test_reject_short();
set role service_role;
do $$
declare r bigint; payload jsonb; result jsonb; snapshot jsonb;
begin
  select jsonb_agg(jsonb_build_object('video_id','short'||lpad(i::text,6,'0'),'title','테스트 '||i) order by i)
    into payload from generate_series(1,10) i;
  insert into public.recent_shorts_sync_runs(status,details) values ('running','{"dry_run":false}') returning id into r;
  result := public.replace_recent_shorts(r,payload);
  if result->>'status'<>'success' or (select count(*) from public.recent_shorts)<>10 then raise exception 'initial cache failed'; end if;
  insert into public.recent_shorts_sync_runs(status,details) values ('running','{"dry_run":false}') returning id into r;
  result := public.replace_recent_shorts(r,payload);
  if result->>'status'<>'no_change' then raise exception 'idempotency failed'; end if;
  select jsonb_agg(e order by n desc) into payload from jsonb_array_elements(payload) with ordinality t(e,n);
  insert into public.recent_shorts_sync_runs(status,details) values ('running','{"dry_run":false}') returning id into r;
  result := public.replace_recent_shorts(r,payload);
  if (select video_id from public.recent_shorts where position=1)<>'short000010' then raise exception 'order failed'; end if;
  select jsonb_agg(to_jsonb(s) order by position) into snapshot from public.recent_shorts s;
  insert into public.recent_shorts_sync_runs(status,details) values ('running','{"dry_run":false}') returning id into r;
  begin
    insert into public.recent_shorts_sync_runs(status) values ('running');
    raise exception 'concurrency guard failed';
  exception when unique_violation then null; end;
  begin
    perform public.replace_recent_shorts(r,'[]'); raise exception 'empty payload accepted';
  exception when others then if sqlerrm <> 'invalid_shorts_count' then raise; end if; end;
  begin
    perform public.replace_recent_shorts(r,payload || jsonb_build_array(payload->0)); raise exception 'eleven accepted';
  exception when others then if sqlerrm <> 'invalid_shorts_count' then raise; end if; end;
  begin
    perform public.replace_recent_shorts(r,jsonb_build_array(payload->0,payload->0)); raise exception 'duplicates accepted';
  exception when others then if sqlerrm <> 'invalid_shorts_rows' then raise; end if; end;
  begin
    perform public.replace_recent_shorts(r,'[{"video_id":"bad","title":"test"}]'); raise exception 'invalid id accepted';
  exception when others then if sqlerrm <> 'invalid_shorts_rows' then raise; end if; end;
  begin
    perform public.replace_recent_shorts(r,'[{"video_id":"short999999","title":"__fail__"}]'); raise exception 'injected failure ignored';
  exception when others then if sqlerrm <> 'injected_insert_failure' then raise; end if; end;
  if snapshot is distinct from (select jsonb_agg(to_jsonb(s) order by position) from public.recent_shorts s) then raise exception 'cache lost on failure'; end if;
  if (select status from public.recent_shorts_sync_runs where id=r)<>'running' then raise exception 'failed transaction marked successful'; end if;
  update public.recent_shorts_sync_runs set status='failed' where id=r;
  raise notice 'PASS: initial load, no_change, reorder, count cap, validation, concurrency and failure rollback';
end $$;
reset role;
drop trigger test_reject on public.recent_shorts;
drop function public.test_reject_short();
do $$ begin
  if (select schedule from cron.job where jobname='recent-shorts-sync-midnight-kst')<>'0 15 * * *' then raise exception 'wrong cron schedule'; end if;
  if (select count(*) from public.recent_videos where video_id='untouched')<>1 or
     (select count(*) from public.schedule_events where title='untouched')<>1 then raise exception 'unrelated data changed'; end if;
  raise notice 'PASS: public read, private configuration, service-only RPC, KST midnight schedule, unrelated tables unchanged';
end $$;
