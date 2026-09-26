-- Disposable CI database only. Never run this bootstrap on Supabase/production.
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema extensions;
create extension pgcrypto with schema extensions;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
grant usage on schema public,auth,extensions to anon,authenticated,service_role;
create table public.admins(user_id uuid primary key);
grant select on public.admins to authenticated;
create schema cron;
create table cron.job(jobname text primary key, schedule text, command text);
create function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as $$
  insert into cron.job values (job_name,schedule,command);
  select 1::bigint;
$$;
-- Sentinels for unrelated features; the migration must not touch them.
create table public.recent_videos(video_id text);
insert into public.recent_videos values ('untouched');
create table public.schedule_events(title text);
insert into public.schedule_events values ('untouched');
