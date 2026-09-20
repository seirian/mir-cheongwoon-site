-- Keep schedules created directly on yeop.net permanently separate from spreadsheet sync.
-- Manual rows are protected by both source ownership and manual_override.
update public.schedule_events
set
  source_type = 'manual',
  source_key = null,
  manual_override = true
where source_type = 'manual';

alter table public.schedule_events
  drop constraint if exists schedule_events_source_type_check,
  drop constraint if exists schedule_events_source_ownership_check;

alter table public.schedule_events
  add constraint schedule_events_source_type_check
    check (source_type in ('manual', 'google_sheet')),
  add constraint schedule_events_source_ownership_check
    check (
      (
        source_type = 'manual'
        and source_key is null
        and manual_override = true
      )
      or
      (
        source_type = 'google_sheet'
        and source_key ~ '^sheet-[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      )
    );
