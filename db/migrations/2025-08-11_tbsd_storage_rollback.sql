-- Rollback migration: remove storage locations and related structures
-- WARNING: This will drop columns and tables introduced in forward migration.

begin;

-- 1) Drop policies if exist
do $$ begin
  if exists (select 1 from pg_policies where schemaname='public' and tablename='user_storage_access' and policyname='usa_admin_mutate') then
    drop policy usa_admin_mutate on public.user_storage_access;
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='user_storage_access' and policyname='usa_select') then
    drop policy usa_select on public.user_storage_access;
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='storage_location' and policyname='sl_select') then
    drop policy sl_select on public.storage_location;
  end if;
end $$;

-- 2) Remove columns from obat & inventaris
alter table if exists public.obat drop column if exists storage_id;
alter table if exists public.inventaris drop column if exists storage_id;

-- 3) Drop tables
drop table if exists public.user_storage_access cascade;
drop table if exists public.storage_location cascade;

commit;
