-- PostgREST's authenticator preloads safeupdate in production.
-- Scope cache replacement to its constrained 1..10 slots; never disable safeupdate.
create or replace function public.replace_recent_shorts(p_run_id bigint, p_videos jsonb)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_count integer;
  v_incoming jsonb;
  v_existing jsonb;
  v_changed boolean;
  v_now timestamptz := now();
begin
  if jsonb_typeof(p_videos) is distinct from 'array' then raise exception 'invalid_shorts_payload'; end if;
  v_count := jsonb_array_length(p_videos);
  if v_count not between 1 and 10 then raise exception 'invalid_shorts_count'; end if;
  if exists (select 1 from jsonb_array_elements(p_videos) e
    where jsonb_typeof(e->'video_id') is distinct from 'string'
       or coalesce(e->>'video_id','') !~ '^[A-Za-z0-9_-]{11}$'
       or jsonb_typeof(e->'title') is distinct from 'string'
       or length(btrim(coalesce(e->>'title',''))) not between 1 and 300)
    or (select count(distinct e->>'video_id') from jsonb_array_elements(p_videos) e) <> v_count
  then raise exception 'invalid_shorts_rows'; end if;

  perform 1 from public.recent_shorts_sync_runs where id=p_run_id and status='running'
    and details->>'dry_run'='false' for update;
  if not found then raise exception 'shorts_run_not_active'; end if;
  select jsonb_agg(jsonb_build_object('video_id',e->>'video_id','title',btrim(e->>'title'),
    'youtube_url','https://www.youtube.com/shorts/' || (e->>'video_id'),'position',n) order by n)
    into v_incoming from jsonb_array_elements(p_videos) with ordinality as t(e,n);
  select coalesce(jsonb_agg(jsonb_build_object('video_id',video_id,'title',title,
    'youtube_url',youtube_url,'position',position) order by position),'[]'::jsonb)
    into v_existing from public.recent_shorts;
  v_changed := v_incoming is distinct from v_existing;
  if v_changed then
    delete from public.recent_shorts where position between 1 and 10;
    insert into public.recent_shorts(video_id,title,youtube_url,position,synced_at)
      select e->>'video_id',e->>'title',e->>'youtube_url',(e->>'position')::smallint,v_now
      from jsonb_array_elements(v_incoming) e;
  end if;
  update public.recent_shorts_sync_runs set
    status=case when v_changed then 'success' else 'no_change' end,
    finished_at=v_now, source_rows=v_count,
    video_ids=array(select e->>'video_id' from jsonb_array_elements(v_incoming) e),
    details=details || jsonb_build_object('changed',v_changed)
    where id=p_run_id;
  return jsonb_build_object('status',case when v_changed then 'success' else 'no_change' end,
    'changed',v_changed,'source_rows',v_count);
end;
$$;
revoke all on function public.replace_recent_shorts(bigint,jsonb) from public, anon, authenticated;
grant execute on function public.replace_recent_shorts(bigint,jsonb) to service_role;
notify pgrst, 'reload schema';
