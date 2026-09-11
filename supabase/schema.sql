-- Supabase SQL Editor에서 1회 실행하세요.
-- 갤러리 / 사진 메타데이터 / 관리자 권한 / Storage 정책을 생성합니다.

create extension if not exists pgcrypto;

create table if not exists public.galleries (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  event_date date,
  description text,
  cover_path text,
  created_at timestamptz not null default now()
);

create table if not exists public.gallery_images (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null references public.galleries(id) on delete cascade,
  file_path text not null unique,
  caption text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.galleries enable row level security;
alter table public.gallery_images enable row level security;
alter table public.admins enable row level security;

-- 방문자는 공개 갤러리를 조회만 할 수 있습니다.
create policy "public can read galleries"
on public.galleries for select
to anon, authenticated
using (true);

create policy "public can read gallery images"
on public.gallery_images for select
to anon, authenticated
using (true);

-- 본인이 관리자 테이블에 등록되어 있는지 본인 행만 확인할 수 있습니다.
create policy "user can read own admin flag"
on public.admins for select
to authenticated
using (user_id = auth.uid());

-- 관리자만 갤러리/사진 메타데이터를 변경합니다.
create policy "admins can insert galleries"
on public.galleries for insert
to authenticated
with check (exists (select 1 from public.admins a where a.user_id = auth.uid()));

create policy "admins can update galleries"
on public.galleries for update
to authenticated
using (exists (select 1 from public.admins a where a.user_id = auth.uid()))
with check (exists (select 1 from public.admins a where a.user_id = auth.uid()));

create policy "admins can delete galleries"
on public.galleries for delete
to authenticated
using (exists (select 1 from public.admins a where a.user_id = auth.uid()));

create policy "admins can insert images"
on public.gallery_images for insert
to authenticated
with check (exists (select 1 from public.admins a where a.user_id = auth.uid()));

create policy "admins can update images"
on public.gallery_images for update
to authenticated
using (exists (select 1 from public.admins a where a.user_id = auth.uid()))
with check (exists (select 1 from public.admins a where a.user_id = auth.uid()));

create policy "admins can delete images"
on public.gallery_images for delete
to authenticated
using (exists (select 1 from public.admins a where a.user_id = auth.uid()));

-- 공개 이미지 버킷 생성 (공연 사진은 누구나 조회 가능)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gallery', 'gallery', true, 10485760, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "public can view gallery storage"
on storage.objects for select
to public
using (bucket_id = 'gallery');

create policy "admins can upload gallery storage"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'gallery'
  and exists (select 1 from public.admins a where a.user_id = auth.uid())
);

create policy "admins can update gallery storage"
on storage.objects for update
to authenticated
using (
  bucket_id = 'gallery'
  and exists (select 1 from public.admins a where a.user_id = auth.uid())
)
with check (
  bucket_id = 'gallery'
  and exists (select 1 from public.admins a where a.user_id = auth.uid())
);

create policy "admins can delete gallery storage"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'gallery'
  and exists (select 1 from public.admins a where a.user_id = auth.uid())
);

-- 초기 관리자 등록 방법
-- 1) Supabase Dashboard > Authentication > Users 에서 관리자 계정을 생성합니다.
-- 2) 해당 사용자의 UUID를 복사한 뒤 아래 SQL의 UUID를 바꿔 실행합니다.
-- insert into public.admins(user_id) values ('관리자-USER-UUID');
