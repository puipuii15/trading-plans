-- Jalankan SEKALI di Supabase: SQL Editor → New query → paste semua → Run

create table if not exists public.trades (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  code        text not null,
  start_date  date,
  end_date    date,
  lot         integer,
  buy         numeric not null,
  buy2        numeric,
  exit_price  numeric,
  status      text not null default 'New',
  tp1         numeric,
  tp2         numeric,
  cl          numeric,
  rnd         boolean not null default true,
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists trades_user_idx on public.trades(user_id, created_at desc);

create table if not exists public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  tp1 numeric not null default 5,
  tp2 numeric not null default 10,
  cl  numeric not null default 4
);

-- Row Level Security: tiap akun HANYA bisa lihat & ubah datanya sendiri
alter table public.trades enable row level security;
alter table public.user_settings enable row level security;

drop policy if exists "own trades" on public.trades;
create policy "own trades" on public.trades
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own settings" on public.user_settings;
create policy "own settings" on public.user_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Update: kolom realisasi (aman dijalankan ulang)
alter table public.trades add column if not exists buy_real numeric;
alter table public.trades add column if not exists sell_date date;
