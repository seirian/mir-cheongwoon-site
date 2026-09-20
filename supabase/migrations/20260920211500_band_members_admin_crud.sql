-- DB-backed Cheongwoon Band member management with direct admin editing.
create extension if not exists pgcrypto;

create table if not exists public.band_members (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  position text not null default 'Position' check (char_length(trim(position)) between 1 and 80),
  comment text not null default '' check (char_length(comment) <= 1000),
  image_path text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists band_members_sort_order_idx
  on public.band_members(sort_order, created_at);

alter table public.band_members enable row level security;

revoke all on table public.band_members from anon, authenticated;
grant select on table public.band_members to anon, authenticated;
grant insert, update, delete on table public.band_members to authenticated;

drop policy if exists "public can read band members" on public.band_members;
create policy "public can read band members"
on public.band_members
for select
to anon, authenticated
using (true);

drop policy if exists "admins can insert band members" on public.band_members;
create policy "admins can insert band members"
on public.band_members
for insert
to authenticated
with check (
  exists (
    select 1 from public.admins a
    where a.user_id = (select auth.uid())
  )
);

drop policy if exists "admins can update band members" on public.band_members;
create policy "admins can update band members"
on public.band_members
for update
to authenticated
using (
  exists (
    select 1 from public.admins a
    where a.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.admins a
    where a.user_id = (select auth.uid())
  )
);

drop policy if exists "admins can delete band members" on public.band_members;
create policy "admins can delete band members"
on public.band_members
for delete
to authenticated
using (
  exists (
    select 1 from public.admins a
    where a.user_id = (select auth.uid())
  )
);

-- Seed current hard-coded members only when no member rows exist.
insert into public.band_members (name, position, comment, sort_order)
select seed.name, seed.position, seed.comment, seed.sort_order
from (
  values
    ('Ray', 'GUITAR', '청운밴드 기타리스트 Ray입니다', 10),
    ('SweetBerry', 'BASS', '청운밴드 베이시스트 SweetBerry입니다', 20),
    ('맹감자', 'KEYBOARD', '청운밴드 키보드 맹감자입니다', 30),
    ('멤버 04', 'Position', '멤버 소개와 한 줄 코멘트를 입력하세요.', 40),
    ('멤버 05', 'Position', '멤버 소개와 한 줄 코멘트를 입력하세요.', 50),
    ('멤버 06', 'Position', '멤버 소개와 한 줄 코멘트를 입력하세요.', 60),
    ('멤버 07', 'Position', '멤버 소개와 한 줄 코멘트를 입력하세요.', 70),
    ('멤버 08', 'Position', '멤버 소개와 한 줄 코멘트를 입력하세요.', 80)
) as seed(name, position, comment, sort_order)
where not exists (select 1 from public.band_members);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'band-members',
  'band-members',
  true,
  10485760,
  array['image/jpeg','image/png','image/webp','image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public can view band member storage" on storage.objects;
create policy "public can view band member storage"
on storage.objects
for select
to public
using (bucket_id = 'band-members');

drop policy if exists "admins can upload band member storage" on storage.objects;
create policy "admins can upload band member storage"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'band-members'
  and exists (
    select 1 from public.admins a
    where a.user_id = (select auth.uid())
  )
);

drop policy if exists "admins can update band member storage" on storage.objects;
create policy "admins can update band member storage"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'band-members'
  and exists (
    select 1 from public.admins a
    where a.user_id = (select auth.uid())
  )
)
with check (
  bucket_id = 'band-members'
  and exists (
    select 1 from public.admins a
    where a.user_id = (select auth.uid())
  )
);

drop policy if exists "admins can delete band member storage" on storage.objects;
create policy "admins can delete band member storage"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'band-members'
  and exists (
    select 1 from public.admins a
    where a.user_id = (select auth.uid())
  )
);
