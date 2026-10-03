-- Additive automated timeline subsystem. Manual songbook entries, ratings and admins are never overwritten.
-- Cron activation is a separate final step, after deployment and verification.
begin;
create table public.songbook_sync_settings (
 id integer primary key check(id=1), enabled boolean not null default false,
 sync_token text not null default (gen_random_uuid()::text||gen_random_uuid()::text),
 trusted_authors text[] not null default '{}', base_catalog jsonb not null default '[]' check(jsonb_typeof(base_catalog)='array'),
 last_discovered_at timestamptz, backfill_done boolean not null default false,
 lease_id uuid, lease_until timestamptz
);
insert into public.songbook_sync_settings(id) values(1);
create table public.songbook_sync_runs (
 id uuid primary key default gen_random_uuid(), owner text not null unique check(length(owner)<=120),
 started_at timestamptz not null default now(), finished_at timestamptz,
 status text not null default 'running' check(status in ('running','success','partial','failure','abandoned')),
 stats jsonb not null default '{"checked":0,"new_songs":0,"candidates":0,"errors":0}',
 error_code text, notification_status text not null default 'not_due'
);
create table public.songbook_sync_vods (
 id text primary key check(id ~ '^[0-9]{6,12}$'), channel_id text not null check(channel_id='alice427'),
 station_no bigint not null check(station_no=24957466), bbs_no bigint not null check(bbs_no=90135165),
 title text not null check(length(title)<=200), uploaded_at timestamptz not null check(uploaded_at>='2024-12-31T15:00:00Z'),
 duration_seconds integer not null check(duration_seconds between 1 and 172800), public boolean not null,
 next_check_at timestamptz not null, last_checked_at timestamptz, last_run_id uuid references public.songbook_sync_runs(id),
 state text not null default 'waiting' check(state in ('waiting','processed','no_timeline','restricted','failed')),
 root_count integer not null default 0, reply_count integer not null default 0, source_hash text, error_code text
);
create index songbook_sync_due on public.songbook_sync_vods(next_check_at);
create table public.songbook_auto_entries (
 id text primary key check(id ~ '^custom-[a-f0-9-]{36}$'), identity_key text not null unique check(length(identity_key)<=500),
 title text not null check(length(trim(title)) between 1 and 200), artist text not null check(length(trim(artist)) between 1 and 200),
 categories text[] not null default '{기타}', aliases text[] not null default '{}',
 request_status text not null default 'unreviewed' check(request_status='unreviewed'),
 active boolean not null default false, created_at timestamptz not null default now()
);
create table public.songbook_timeline_candidates (
 id text primary key check(id ~ '^[a-f0-9]{64}$'), vod_id text not null references public.songbook_sync_vods(id),
 comment_id text not null check(comment_id ~ '^[0-9]{1,15}$'), seconds integer not null check(seconds between 0 and 172800),
 title text not null check(length(title)<=200), artist text not null check(length(artist)<=200),
 line text not null check(length(line)<=500), reason text not null check(length(reason)<=80),
 song_id text check(song_id ~ '^(mir-[a-f0-9]{12}|custom-[a-f0-9-]{36})$'),
 decision text not null check(decision in ('pending','auto','excluded','approved','rejected')),
 present boolean not null default true, parser_version text not null,
 revision integer not null default 1, first_seen_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 approved_seconds integer check(approved_seconds between 0 and 172800), reviewed_by uuid references auth.users(id), reviewed_at timestamptz
);
create index songbook_timeline_review on public.songbook_timeline_candidates(decision,present,first_seen_at desc);
create index songbook_timeline_vod on public.songbook_timeline_candidates(vod_id);
create table public.songbook_auto_links (
 id text primary key, song_id text not null, vod_id text not null references public.songbook_sync_vods(id),
 seconds integer not null, uploaded_at timestamptz not null,
 url text generated always as ('https://vod.sooplive.com/player/'||vod_id||'?change_second='||seconds::text) stored,
 unique(song_id,vod_id,seconds)
);
create index songbook_auto_links_song on public.songbook_auto_links(song_id,uploaded_at desc);
-- Public output contains just song information and approved video links, never comment authors or collection evidence.
alter table public.songbook_sync_settings enable row level security;
alter table public.songbook_sync_runs enable row level security;
alter table public.songbook_sync_vods enable row level security;
alter table public.songbook_auto_entries enable row level security;
alter table public.songbook_timeline_candidates enable row level security;
alter table public.songbook_auto_links enable row level security;
revoke all on public.songbook_sync_settings,public.songbook_sync_runs,public.songbook_sync_vods,public.songbook_auto_entries,public.songbook_timeline_candidates,public.songbook_auto_links from public,anon,authenticated;
grant all on public.songbook_sync_settings,public.songbook_sync_runs,public.songbook_sync_vods,public.songbook_auto_entries,public.songbook_timeline_candidates,public.songbook_auto_links to service_role;
grant select on public.songbook_sync_runs,public.songbook_sync_vods,public.songbook_timeline_candidates to authenticated;
grant select on public.songbook_auto_entries,public.songbook_auto_links to anon,authenticated;
create policy sb_sync_service on public.songbook_sync_settings for all to service_role using(true) with check(true);
create policy sb_runs_admin on public.songbook_sync_runs for select to authenticated using(exists(select 1 from public.admins where user_id=(select auth.uid())));
create policy sb_vods_admin on public.songbook_sync_vods for select to authenticated using(exists(select 1 from public.admins where user_id=(select auth.uid())));
create policy sb_candidates_admin on public.songbook_timeline_candidates for select to authenticated using(exists(select 1 from public.admins where user_id=(select auth.uid())));
create policy sb_auto_public on public.songbook_auto_entries for select to anon,authenticated using(active);
create policy sb_links_public on public.songbook_auto_links for select to anon,authenticated using(true);
create view public.songbook_auto_media with (security_invoker=true) as
 select song_id as id, array_agg(url order by uploaded_at desc,seconds) filter(where rank<=5) as video_urls, count(*) as total_count
 from (select *,row_number() over(partition by song_id order by uploaded_at desc,seconds,id) as rank from public.songbook_auto_links) q group by song_id;
grant select on public.songbook_auto_media to anon,authenticated,service_role;

create or replace function public.songbook_sync_begin(p_owner text,p_backfill boolean default false) returns jsonb
language plpgsql security invoker set search_path=pg_catalog as $$
declare cfg public.songbook_sync_settings; rid uuid; old public.songbook_sync_runs;
begin
 select * into cfg from public.songbook_sync_settings where id=1 for update;
 if not cfg.enabled then return jsonb_build_object('status','disabled'); end if;
 if p_backfill and cfg.backfill_done then return jsonb_build_object('status','already_backfilled'); end if;
 select * into old from public.songbook_sync_runs where owner=p_owner;
 if found and old.status<>'running' then return jsonb_build_object('status','already_finished'); end if;
 if cfg.lease_until>now() then
  if old.id=cfg.lease_id then return jsonb_build_object('status','running','run_id',old.id); end if;
  return jsonb_build_object('status','busy');
 end if;
 update public.songbook_sync_runs set status='abandoned',finished_at=now(),error_code='lease_expired' where id=cfg.lease_id and status='running';
 if old.id is not null then
  update public.songbook_sync_runs set status='running',finished_at=null,error_code=null where id=old.id;rid:=old.id;
 else insert into public.songbook_sync_runs(owner) values(p_owner) returning id into rid;end if;
 update public.songbook_sync_settings set lease_id=rid,lease_until=now()+case when p_backfill then interval '45 minutes' else interval '3 minutes' end where id=1;
 return jsonb_build_object('status','running','run_id',rid);
end $$;

create or replace function public.songbook_sync_inventory(p_run uuid,p_vods jsonb,p_discovered_at timestamptz default null) returns integer
language plpgsql security invoker set search_path=pg_catalog as $$
declare v jsonb; n integer:=0; was_public boolean;
begin
 if not exists(select 1 from public.songbook_sync_settings where id=1 and enabled and lease_id=p_run and lease_until>now()) then raise exception 'sync_lease'; end if;
 if jsonb_typeof(p_vods)<>'array' or jsonb_array_length(p_vods)>1000 then raise exception 'inventory_limit'; end if;
 for v in select value from jsonb_array_elements(p_vods) loop
  if (v->>'uploaded_at')::timestamptz>now()+interval '5 minutes' then raise exception 'future_vod'; end if;
  select public into was_public from public.songbook_sync_vods where id=v->>'id';
  insert into public.songbook_sync_vods(id,channel_id,station_no,bbs_no,title,uploaded_at,duration_seconds,public,next_check_at)
  values(v->>'id',v->>'channel_id',(v->>'station_no')::bigint,(v->>'bbs_no')::bigint,v->>'title',(v->>'uploaded_at')::timestamptz,(v->>'duration_seconds')::integer,(v->>'public')::boolean,(v->>'uploaded_at')::timestamptz+interval '7 days')
  on conflict(id) do update set title=excluded.title,duration_seconds=excluded.duration_seconds,public=excluded.public;
  if was_public is distinct from (v->>'public')::boolean then perform public.songbook_sync_rebuild(v->>'id');end if;
  n:=n+1;
 end loop;
 if p_discovered_at is not null then update public.songbook_sync_settings set last_discovered_at=least(now(),p_discovered_at) where id=1;end if;
 return n;
end $$;

create or replace function public.songbook_sync_rebuild(p_vod text) returns void
language plpgsql security invoker set search_path=pg_catalog as $$
begin
 delete from public.songbook_auto_links where vod_id=p_vod;
 insert into public.songbook_auto_links(id,song_id,vod_id,seconds,uploaded_at)
 select md5(c.song_id||'|'||c.vod_id||'|'||coalesce(c.approved_seconds,c.seconds)::text),c.song_id,c.vod_id,coalesce(c.approved_seconds,c.seconds),v.uploaded_at
 from public.songbook_timeline_candidates c join public.songbook_sync_vods v on v.id=c.vod_id
 where c.vod_id=p_vod and c.present and c.decision in ('auto','approved') and c.song_id is not null and v.public
 and v.uploaded_at+interval '7 days'<=now() and coalesce(c.approved_seconds,c.seconds)<v.duration_seconds
 group by c.song_id,c.vod_id,coalesce(c.approved_seconds,c.seconds),v.uploaded_at;
 update public.songbook_auto_entries a set active=exists(select 1 from public.songbook_auto_links l where l.song_id=a.id)
 where a.active is distinct from exists(select 1 from public.songbook_auto_links l where l.song_id=a.id);
end $$;

create or replace function public.songbook_sync_apply(p_run uuid,p_vod text,p_candidates jsonb,p_hash text,p_roots integer,p_replies integer,p_next timestamptz) returns jsonb
language plpgsql security invoker set search_path=pg_catalog as $$
declare v public.songbook_sync_vods; c jsonb; created integer:=0; n integer; sid text; keys text[]:='{}';
begin
 if not exists(select 1 from public.songbook_sync_settings where id=1 and enabled and lease_id=p_run and lease_until>now()) then raise exception 'sync_lease'; end if;
 select * into v from public.songbook_sync_vods where id=p_vod for update;
 if not found or not v.public or v.uploaded_at+interval '7 days'>now() then raise exception 'vod_not_eligible'; end if;
 if jsonb_typeof(p_candidates)<>'array' or jsonb_array_length(p_candidates)>500 or p_hash !~ '^[a-f0-9]{64}$' or p_next<=now() or p_next>now()+interval '32 days' then raise exception 'scan_contract';end if;
 -- A complete, unchanged retry is idempotent, including administrator decisions and revisions.
 if v.source_hash=p_hash and v.last_run_id=p_run then return jsonb_build_object('status','no_change','new_songs',0);end if;
 for c in select value from jsonb_array_elements(p_candidates) loop
  if (c->>'vod_id')<>p_vod or (c->>'seconds')::integer>=v.duration_seconds or c->>'decision' not in ('pending','auto','excluded') then raise exception 'candidate_contract'; end if;
  sid:=nullif(c->>'song_id','');
  if c->>'decision'='auto' and sid is null then
   if c->'new_song' is null or length(trim(c->>'artist'))=0 then raise exception 'missing_identity';end if;
   sid:=c->'new_song'->>'id';
   insert into public.songbook_auto_entries(id,identity_key,title,artist) values(sid,c->'new_song'->>'identity_key',c->>'title',c->>'artist') on conflict(identity_key) do nothing;
   get diagnostics n=row_count;created:=created+n;
   select id into sid from public.songbook_auto_entries where identity_key=c->'new_song'->>'identity_key';
  end if;
  keys:=array_append(keys,c->>'id');
  insert into public.songbook_timeline_candidates(id,vod_id,comment_id,seconds,title,artist,line,reason,song_id,decision,parser_version)
  values(c->>'id',p_vod,c->>'comment_id',(c->>'seconds')::integer,c->>'title',c->>'artist',c->>'line',c->>'reason',sid,c->>'decision',c->>'parser_version')
  on conflict(id) do update set present=true,line=excluded.line,
   reason=case when songbook_timeline_candidates.decision in ('approved','rejected') then songbook_timeline_candidates.reason else excluded.reason end,
   song_id=case when songbook_timeline_candidates.decision in ('approved','rejected') then songbook_timeline_candidates.song_id else excluded.song_id end,
   decision=case when songbook_timeline_candidates.decision in ('approved','rejected') then songbook_timeline_candidates.decision else excluded.decision end,
   revision=songbook_timeline_candidates.revision+1,updated_at=now(),parser_version=excluded.parser_version
  where not songbook_timeline_candidates.present or songbook_timeline_candidates.line is distinct from excluded.line or
   (songbook_timeline_candidates.decision not in ('approved','rejected') and (songbook_timeline_candidates.decision is distinct from excluded.decision or songbook_timeline_candidates.song_id is distinct from excluded.song_id));
 end loop;
 update public.songbook_timeline_candidates set present=false,revision=revision+1,updated_at=now() where vod_id=p_vod and present and not(id=any(keys));
 perform public.songbook_sync_rebuild(p_vod);
 update public.songbook_sync_vods set last_checked_at=now(),next_check_at=p_next,last_run_id=p_run,state=case when jsonb_array_length(p_candidates)=0 then 'no_timeline' else 'processed' end,root_count=p_roots,reply_count=p_replies,source_hash=p_hash,error_code=null where id=p_vod;
 update public.songbook_sync_runs set stats=jsonb_build_object('checked',coalesce((stats->>'checked')::int,0)+1,'new_songs',coalesce((stats->>'new_songs')::int,0)+created,'candidates',coalesce((stats->>'candidates')::int,0)+jsonb_array_length(p_candidates),'errors',coalesce((stats->>'errors')::int,0)) where id=p_run;
 return jsonb_build_object('status','processed','new_songs',created,'candidates',jsonb_array_length(p_candidates));
end $$;

create or replace function public.songbook_sync_fail(p_run uuid,p_vod text,p_error text) returns void
language plpgsql security invoker set search_path=pg_catalog as $$
begin
 if not exists(select 1 from public.songbook_sync_settings where id=1 and lease_id=p_run and lease_until>now()) then raise exception 'sync_lease';end if;
 update public.songbook_sync_vods set state='failed',error_code=left(p_error,120),next_check_at=now()+interval '1 day',last_checked_at=now(),last_run_id=p_run where id=p_vod;
 update public.songbook_sync_runs set stats=jsonb_set(stats,'{errors}',to_jsonb(coalesce((stats->>'errors')::int,0)+1)) where id=p_run;
 -- Failed/incomplete responses do NOT withdraw previously accepted evidence or erase the catalog.
end $$;

create or replace function public.songbook_sync_finish(p_run uuid,p_error text default null,p_backfill boolean default false) returns jsonb
language plpgsql security invoker set search_path=pg_catalog as $$
declare r public.songbook_sync_runs;
begin
 if not exists(select 1 from public.songbook_sync_settings where id=1 and lease_id=p_run) then raise exception 'sync_lease'; end if;
 update public.songbook_sync_runs set finished_at=now(),error_code=left(p_error,120),status=case when p_error is not null then 'failure' when (stats->>'errors')::int>0 then 'partial' else 'success' end where id=p_run and status='running' returning * into r;
 if not found then select * into r from public.songbook_sync_runs where id=p_run;end if;
 update public.songbook_sync_settings set lease_id=null,lease_until=null,
  backfill_done=backfill_done or (p_backfill and p_error is null and not exists(select 1 from public.songbook_sync_vods where public and uploaded_at+interval '7 days'<=now() and (last_checked_at is null or state='failed')))
 where id=1;
 return to_jsonb(r);
end $$;

-- Service-only RPC; the Edge handler verifies an existing site's administrator before passing p_admin.
create or replace function public.songbook_sync_review(p_admin uuid,p_id text,p_revision integer,p_decision text,p_song jsonb,p_seconds integer default null) returns jsonb
language plpgsql security invoker set search_path=pg_catalog as $$
declare c public.songbook_timeline_candidates; sid text; v public.songbook_sync_vods;
begin
 if not exists(select 1 from public.admins where user_id=p_admin) then raise exception 'admin_required';end if;
 if p_decision not in ('approved','rejected') then raise exception 'invalid_decision';end if;
 select * into c from public.songbook_timeline_candidates where id=p_id for update;
 if not found or c.revision<>p_revision or not c.present then raise exception 'candidate_changed';end if;
 select * into v from public.songbook_sync_vods where id=c.vod_id;
 if not v.public or v.uploaded_at+interval '7 days'>now() then raise exception 'vod_not_eligible';end if;
 sid:=c.song_id;
 if p_decision='approved' then
  if p_seconds is null or p_seconds<0 or p_seconds>=v.duration_seconds then raise exception 'invalid_song_time';end if;
  sid:=p_song->>'id';
  if coalesce((p_song->>'create')::boolean,false) then
   insert into public.songbook_auto_entries(id,identity_key,title,artist) values(sid,p_song->>'identity_key',p_song->>'title',p_song->>'artist') on conflict(identity_key) do nothing;
   select id into sid from public.songbook_auto_entries where identity_key=p_song->>'identity_key';
  end if;
  if sid is null or sid !~ '^(mir-[a-f0-9]{12}|custom-[a-f0-9-]{36})$' then raise exception 'song_required';end if;
 end if;
 update public.songbook_timeline_candidates set decision=p_decision,song_id=sid,approved_seconds=case when p_decision='approved' then p_seconds else approved_seconds end,reviewed_by=p_admin,reviewed_at=now(),updated_at=now(),revision=revision+1 where id=c.id;
 perform public.songbook_sync_rebuild(c.vod_id);
 return jsonb_build_object('status',p_decision,'song_id',sid);
end $$;

revoke all on function public.songbook_sync_begin(text,boolean),public.songbook_sync_inventory(uuid,jsonb,timestamptz),public.songbook_sync_rebuild(text),public.songbook_sync_apply(uuid,text,jsonb,text,integer,integer,timestamptz),public.songbook_sync_fail(uuid,text,text),public.songbook_sync_finish(uuid,text,boolean),public.songbook_sync_review(uuid,text,integer,text,jsonb,integer) from public,anon,authenticated;
grant execute on function public.songbook_sync_begin(text,boolean),public.songbook_sync_inventory(uuid,jsonb,timestamptz),public.songbook_sync_rebuild(text),public.songbook_sync_apply(uuid,text,jsonb,text,integer,integer,timestamptz),public.songbook_sync_fail(uuid,text,text),public.songbook_sync_finish(uuid,text,boolean),public.songbook_sync_review(uuid,text,integer,text,jsonb,integer) to service_role;
notify pgrst,'reload schema';
commit;
