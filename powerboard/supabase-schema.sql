-- TurboToken Paper Trading Schema
-- Run this in your Supabase SQL Editor

-- Create paper_trades table
create table if not exists public.paper_trades (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  token_symbol text not null,
  token_address text,
  side text not null check (side in ('LONG', 'SHORT')),
  size_sol numeric not null check (size_sol > 0),
  entry_price numeric not null check (entry_price > 0),
  current_price numeric not null check (current_price > 0),
  slippage_pct numeric not null default 1.0,
  priority_fee_sol numeric not null default 0.005,
  close_price numeric,
  closed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Add new columns to existing tables (run these if table already exists)
alter table public.paper_trades add column if not exists slippage_pct numeric not null default 1.0;
alter table public.paper_trades add column if not exists priority_fee_sol numeric not null default 0.005;
alter table public.paper_trades add column if not exists close_price numeric;
alter table public.paper_trades add column if not exists closed_at timestamptz;

-- Enable Row Level Security
alter table public.paper_trades enable row level security;

-- Drop existing policies if they exist (for re-running this script)
drop policy if exists "Users can view own paper trades" on public.paper_trades;
drop policy if exists "Users can insert own paper trades" on public.paper_trades;
drop policy if exists "Users can update own paper trades" on public.paper_trades;
drop policy if exists "Users can delete own paper trades" on public.paper_trades;

-- Create RLS policies
create policy "Users can view own paper trades"
on public.paper_trades
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert own paper trades"
on public.paper_trades
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update own paper trades"
on public.paper_trades
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own paper trades"
on public.paper_trades
for delete
to authenticated
using (auth.uid() = user_id);
