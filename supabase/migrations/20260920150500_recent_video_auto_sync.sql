-- Automatically sync the latest two videos from MIR's YouTube Videos tab.
-- Runs every day at 00:00 KST (15:00 UTC), matching the schedule sync cadence.
create extension if not exists pgcrypto;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create table if not exists public.recent_videos (
  video_id text primary key check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  title text not null check (char_length(title) between 1 and 300),
  youtube_url text not null unique,
  position smallint not null check (position between 1 and 2),
  synced_at timestamptz not null default now()
);

create index if not exists recent_videos_position_idx
  on public.recent_videos(position);

alter table public.recent_videos enable row level security;
revoke all on table public.recent_videos from anon, authenticated;
grant select on table public.recent_videos to anon, authenticated;

drop policy if exists "public can read recent videos" on public.recent_videos;
create policy "public can read recent videos"
on public.recent_videos
for select
to anon, authenticated
using (true);

create table if not exists public.recent_video_sync_config (
  id smallint primary key check (id = 1),
  cron_token text not null,
  channel_url text not null,
  channel_id text not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.recent_video_sync_config enable row level security;
revoke all on table public.recent_video_sync_config from anon, authenticated;

drop policy if exists "client access denied to recent video sync config"
  on public.recent_video_sync_config;
create policy "client access denied to recent video sync config"
on public.recent_video_sync_config
for all
to anon, authenticated
using (false)
with check (false);

insert into public.recent_video_sync_config (
  id,
  cron_token,
  channel_url,
  channel_id,
  enabled
)
values (
  1,
  encode(gen_random_bytes(32), 'hex'),
  'https://www.youtube.com/@%EB%AF%B8%EB%A5%B4MIR/videos',
  'UCqIYzvK_99z-Lh46mQY0NzA',
  true
)
on conflict (id) do update set
  channel_url = excluded.channel_url,
  channel_id = excluded.channel_id,
  enabled = true,
  updated_at = now();

create table if not exists public.recent_video_sync_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null check (
    status in ('running','success','no_change','dry_run','failed')
  ),
  source_rows integer not null default 0,
  video_ids text[] not null default '{}',
  error_code text,
  details jsonb not null default '{}'::jsonb
);

create index if not exists recent_video_sync_runs_started_at_idx
  on public.recent_video_sync_runs(started_at desc);

create unique index if not exists recent_video_sync_single_running_idx
  on public.recent_video_sync_runs ((status))
  where status = 'running';

alter table public.recent_video_sync_runs enable row level security;
revoke all on table public.recent_video_sync_runs from anon, authenticated;
grant select on table public.recent_video_sync_runs to authenticated;

drop policy if exists "admins can read recent video sync runs"
  on public.recent_video_sync_runs;
create policy "admins can read recent video sync runs"
on public.recent_video_sync_runs
for select
to authenticated
using (
  exists (
    select 1
    from public.admins a
    where a.user_id = (select auth.uid())
  )
);

do $$
declare
  existing_job_id bigint;
begin
  select jobid
    into existing_job_id
    from cron.job
   where jobname = 'recent-video-sync-midnight-kst'
   limit 1;

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
end
$$;

select cron.schedule(
  'recent-video-sync-midnight-kst',
  '0 15 * * *',
  $cron$
  select net.http_post(
    url := 'https://nohboljeugjmtwnvtayu.supabase.co/functions/v1/recent-video-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-recent-video-sync-token', (
        select cron_token
        from public.recent_video_sync_config
        where id = 1
      )
    ),
    body := jsonb_build_object('trigger', 'cron'),
    timeout_milliseconds := 20000
  );
  $cron$
);
