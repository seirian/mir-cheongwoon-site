create schema if not exists private;

create table if not exists public.member_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique
    check (username ~ '^[a-z0-9_.-]{4,24}$'),
  email text not null unique,
  created_at timestamptz not null default now()
);

alter table public.member_profiles enable row level security;

revoke all on table public.member_profiles from anon, authenticated;
grant select on table public.member_profiles to authenticated;

drop policy if exists "members can read own profile" on public.member_profiles;
create policy "members can read own profile"
on public.member_profiles
for select
to authenticated
using (user_id = (select auth.uid()));

create or replace function private.handle_new_member_profile()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  requested_username text;
begin
  requested_username := lower(trim(coalesce(new.raw_user_meta_data->>'username', '')));
  if requested_username = '' then
    requested_username := 'member_' || substr(replace(new.id::text, '-', ''), 1, 12);
  end if;

  if requested_username !~ '^[a-z0-9_.-]{4,24}$' then
    raise exception 'invalid_username';
  end if;

  insert into public.member_profiles(user_id, username, email)
  values (new.id, requested_username, lower(new.email))
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function private.handle_new_member_profile() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_member_profile on auth.users;
create trigger on_auth_user_created_member_profile
after insert on auth.users
for each row execute function private.handle_new_member_profile();

insert into public.member_profiles(user_id, username, email)
select
  u.id,
  'legacy_' || substr(replace(u.id::text, '-', ''), 1, 12),
  lower(u.email)
from auth.users u
where u.email is not null
  and not exists (select 1 from public.member_profiles p where p.user_id = u.id)
on conflict do nothing;
