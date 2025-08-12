-- Backup snapshots before TBSD & storage changes
-- Run this once before applying migrations

begin;

-- Snapshot tables
create table if not exists public.obat_backup_2025_08_11 as table public.obat;
create table if not exists public.inventaris_backup_2025_08_11 as table public.inventaris;
create table if not exists public.riwayat_obat_backup_2025_08_11 as table public.riwayat_obat;

-- Optional: indexes for faster lookups on backups
-- create index if not exists idx_obat_bak_id on public.obat_backup_2025_08_11(id);
-- create index if not exists idx_inventaris_bak_id on public.inventaris_backup_2025_08_11(id);
-- create index if not exists idx_riwayat_obat_bak_id on public.riwayat_obat_backup_2025_08_11(id);

commit;
