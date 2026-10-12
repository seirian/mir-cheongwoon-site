-- Fanart-only state and two-phase notification ledger. No user/content table changes.
create table if not exists public.fanart_recovery_state (
  batch_date date primary key,
  checked_at timestamptz not null default now(),
  outcome text not null check (outcome in ('waiting','success','failure')),
  details jsonb not null default '{}'::jsonb
);
create table if not exists public.fanart_recovery_notifications (
  batch_date date not null,
  phase text not null check (phase in ('initial','final')),
  outcome text not null check (outcome in ('waiting','success','failure')),
  delivery text not null check (delivery in ('sending','sent','failed','unknown')),
  attempt integer not null default 1 check (attempt between 1 and 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  message_id text,
  details jsonb not null default '{}'::jsonb,
  primary key (batch_date, phase)
);
alter table public.fanart_recovery_state enable row level security;
alter table public.fanart_recovery_notifications enable row level security;
revoke all on public.fanart_recovery_state, public.fanart_recovery_notifications from public, anon, authenticated;
grant select, insert, update on public.fanart_recovery_state, public.fanart_recovery_notifications to service_role;

-- Today's old initial message may already have been sent. Do not send it a second time.
-- A legacy failure is still eligible for the NEW recovery policy, not a final result.
do $seed$
begin
  if to_regclass('public.daily_batch_report_runs') is not null then
    insert into public.fanart_recovery_notifications(batch_date, phase, outcome, delivery, updated_at, details)
    select report_date, 'initial', case when status='success' then 'success' else 'waiting' end,
      'sent', coalesce(notified_at, checked_at), jsonb_build_object('legacy_initial',true)
    from public.daily_batch_report_runs
    where report_mode='fanart' and notification_status='sent'
      and report_date=(now() at time zone 'Asia/Seoul')::date
    on conflict (batch_date, phase) do nothing;
  end if;
end;
$seed$;
