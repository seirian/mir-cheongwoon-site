-- Separate Shorts cache: never change the general-video or schedule jobs.
create table public.recent_shorts_sync_config (
  id smallint primary key check (id = 1),
  cron_token text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  channel_id text not null check (channel_id ~ '^UC[A-Za-z0-9_-]{22}$'),
  enabled boolean not null default true
);
alter table public.recent_shorts_sync_config enable row level security;
revoke all on public.recent_shorts_sync_config from public, anon, authenticated;
grant all on public.recent_shorts_sync_config to service_role;
-- Verified from official @미르MIR/shorts metadata, not an old log label.
insert into public.recent_shorts_sync_config (id, channel_id) values (1, 'UCNKFX8Kwk0LgX8VqyWFqF3Q');

create table public.recent_shorts (
  video_id text primary key check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  title text not null check (length(btrim(title)) between 1 and 300),
  youtube_url text not null check (youtube_url = 'https://www.youtube.com/shorts/' || video_id),
  position smallint not null unique check (position between 1 and 10),
  synced_at timestamptz not null default now()
);
alter table public.recent_shorts enable row level security;
revoke all on public.recent_shorts from public, anon, authenticated;
grant select on public.recent_shorts to anon, authenticated;
grant all on public.recent_shorts to service_role;
create policy "public read shorts" on public.recent_shorts for select to anon, authenticated using (true);

create table public.recent_shorts_sync_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null check (status in ('running','success','no_change','dry_run','failed')),
  source_rows integer not null default 0,
  video_ids text[] not null default '{}',
  error_code text,
  details jsonb not null default '{}'
);
create index recent_shorts_sync_runs_started_idx on public.recent_shorts_sync_runs(started_at desc);
create unique index recent_shorts_sync_single_running_idx on public.recent_shorts_sync_runs(status) where status='running';
alter table public.recent_shorts_sync_runs enable row level security;
revoke all on public.recent_shorts_sync_runs from public, anon, authenticated;
grant select on public.recent_shorts_sync_runs to authenticated;
grant all on public.recent_shorts_sync_runs to service_role;
grant usage, select on sequence public.recent_shorts_sync_runs_id_seq to service_role;
create policy "admins read shorts sync runs" on public.recent_shorts_sync_runs for select to authenticated
  using (exists (select 1 from public.admins a where a.user_id = (select auth.uid())));

create function public.replace_recent_shorts(p_run_id bigint, p_videos jsonb)
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
    delete from public.recent_shorts;
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

-- 15:00 UTC = 00:00 KST. A named job is unique; tokens never enter source code.
select cron.schedule('recent-shorts-sync-midnight-kst', '0 15 * * *', $cron$
  select net.http_post(
    url := 'https://nohboljeugjmtwnvtayu.supabase.co/functions/v1/recent-shorts-sync',
    headers := jsonb_build_object('Content-Type','application/json','x-recent-shorts-sync-token',
      (select cron_token from public.recent_shorts_sync_config where id=1)),
    body := jsonb_build_object('trigger','cron'), timeout_milliseconds := 30000
  );
$cron$);
