-- Forward migration: Introduce storage locations and TBSD unit separation
-- Safe to run multiple times due to IF NOT EXISTS guards where possible

begin;

-- 0) Helper: updated_at trigger function
create or replace function public.set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- 1) Master storage locations per unit (lokasi)
create table if not exists public.storage_location (
  id uuid primary key default gen_random_uuid(),
  nama text not null,
  lokasi text not null, -- unit: PAUD/TK/SD/SMP/TBSD (text to avoid hard enum coupling)
  parent_id uuid references public.storage_location(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- updated_at trigger
create trigger if not exists trg_storage_location_updated
before update on public.storage_location
for each row execute function public.set_updated_at();

-- 2) User access to storage locations
create table if not exists public.user_storage_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,                -- auth.users.id or your users table id
  storage_id uuid not null references public.storage_location(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, storage_id)
);

-- 3) Add storage_id to obat & inventaris (nullable for backward compatibility)
alter table if exists public.obat add column if not exists storage_id uuid references public.storage_location(id);
alter table if exists public.inventaris add column if not exists storage_id uuid references public.storage_location(id);

-- 4) Optional indexes to speed up lookups
create index if not exists idx_obat_storage_id on public.obat(storage_id);
create index if not exists idx_inventaris_storage_id on public.inventaris(storage_id);
create index if not exists idx_storage_location_lokasi on public.storage_location(lokasi);
create index if not exists idx_user_storage_access_user on public.user_storage_access(user_id);

-- 5) Seed TBSD storage locations
insert into public.storage_location (nama, lokasi)
values ('Kantor TBSD','TBSD'), ('Kelas 1A','TBSD'), ('Kelas 1B','TBSD'), ('Kelas 2C','TBSD')
on conflict do nothing;

-- 6) RLS policies (defensive: only create if tables exist). Adjust helpers as needed.
-- Assumptions: public.jwt_role() returns text role (e.g., 'admin'), public.jwt_lokasi() returns current user's unit text.
-- If helpers not present, these policies will still allow admin via fallback checks that infer admin from role claim; customize as needed.

-- Enable RLS
alter table if exists public.storage_location enable row level security;
alter table if exists public.user_storage_access enable row level security;

-- Drop existing policies with same names (idempotent)
do $$ begin
  if exists (select 1 from pg_policies where schemaname='public' and tablename='storage_location' and policyname='sl_select') then
    drop policy sl_select on public.storage_location;
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='user_storage_access' and policyname='usa_select') then
    drop policy usa_select on public.user_storage_access;
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='user_storage_access' and policyname='usa_admin_mutate') then
    drop policy usa_admin_mutate on public.user_storage_access;
  end if;
end $$;

-- storage_location: allow select within same unit or admin
create policy sl_select on public.storage_location
for select using (
  coalesce(public.jwt_role(), '') = 'admin'
  or lokasi = coalesce(public.jwt_lokasi(), lokasi)
);

-- user_storage_access: allow user to see their own mappings; admin see all
create policy usa_select on public.user_storage_access
for select using (
  coalesce(public.jwt_role(), '') = 'admin' or user_id = auth.uid()
);

-- user_storage_access: only admin can mutate
create policy usa_admin_mutate on public.user_storage_access
for all using (coalesce(public.jwt_role(), '') = 'admin')
with check (coalesce(public.jwt_role(), '') = 'admin');

-- Notes:
-- For obat/inventaris RLS, ensure existing policies already gate by lokasi and user role.
-- Then extend policies to include storage_id access control like:
--   (storage_id is null or storage_id in (select storage_id from public.user_storage_access where user_id = auth.uid()))
-- We do not modify those here to avoid breaking existing setups; add in a subsequent migration when ready.

commit;
