-- =============================================================================
--  MIGRATION — prepaid schema  ->  cash on delivery
--
--  ONLY RUN THIS if you already ran the ORIGINAL 01_schema.sql (the one with
--  payment_status). Setting up a fresh database? Skip this file entirely —
--  01_schema.sql already has everything.
--
--  Run the steps IN ORDER, and run STEP 1 ON ITS OWN first.
--  PostgreSQL will not let you add a value to an enum and use that value in the
--  same transaction, so step 1 has to be committed before step 3 can run.
--  In the Supabase SQL Editor each "Run" is its own transaction, so: paste
--  step 1, run it, then paste the rest and run that.
-- =============================================================================


-- =============================================================================
--  STEP 1 — RUN THIS ALONE, THEN STOP AND RUN IT.
-- =============================================================================

alter type order_status add value if not exists 'confirmed'       after 'pending';
alter type order_status add value if not exists 'failed_delivery' after 'cancelled';
alter type stock_movement_reason add value if not exists 'delivery_failed';


-- =============================================================================
--  STEP 2 — everything below can be run together, after step 1 has committed.
-- =============================================================================

-- --- 2a. Money breakdown -----------------------------------------------------
-- Existing orders had a single total with no delivery line. Backfill so the
-- subtotal equals what was actually charged and delivery reads as zero, which
-- is the truth for orders taken before you had a delivery fee.
alter table public.orders add column if not exists subtotal     numeric(12,2) not null default 0;
alter table public.orders add column if not exists delivery_fee numeric(12,2) not null default 0;

update public.orders set subtotal = total_amount where subtotal = 0 and total_amount > 0;

-- --- 2b. COD operations ------------------------------------------------------
alter table public.orders add column if not exists confirmed_at      timestamptz;
alter table public.orders add column if not exists delivery_attempts integer not null default 0;
alter table public.orders add column if not exists last_attempt_at   timestamptz;

-- --- 2c. Phone becomes required ----------------------------------------------
-- Any historic order with no phone gets a placeholder, otherwise the NOT NULL
-- constraint cannot be applied. Search for these afterwards and fill them in
-- if the orders are still live.
update public.orders
   set customer_phone = 'UNKNOWN — added during COD migration'
 where customer_phone is null or btrim(customer_phone) = '';

alter table public.orders alter column customer_phone set not null;

-- --- 2d. Drop the payment columns --------------------------------------------
-- This store never touches money: the courier collects it and 'delivered'
-- means the customer paid. A column that lies about what it tracks is worse
-- than no column.
--
-- If you have live data you want to keep, comment these two lines out and
-- archive them first:  create table orders_payment_archive as
--                        select id, payment_status, payment_reference from orders;
alter table public.orders drop column if exists payment_status;
alter table public.orders drop column if exists payment_reference;

drop type if exists payment_status;

-- --- 2e. Constraints ---------------------------------------------------------
alter table public.orders drop constraint if exists orders_subtotal_not_negative;
alter table public.orders add  constraint orders_subtotal_not_negative check (subtotal >= 0);

alter table public.orders drop constraint if exists orders_delivery_not_negative;
alter table public.orders add  constraint orders_delivery_not_negative check (delivery_fee >= 0);

alter table public.orders drop constraint if exists orders_attempts_not_negative;
alter table public.orders add  constraint orders_attempts_not_negative check (delivery_attempts >= 0);

alter table public.orders drop constraint if exists orders_phone_not_blank;
alter table public.orders add  constraint orders_phone_not_blank check (length(btrim(customer_phone)) > 0);

-- --- 2f. The admin's daily queue ---------------------------------------------
create index if not exists idx_orders_pending on public.orders(created_at) where status = 'pending';

-- --- 2g. Store settings ------------------------------------------------------
create table if not exists public.store_settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_at  timestamptz not null default now()
);

drop trigger if exists trg_store_settings_updated_at on public.store_settings;
create trigger trg_store_settings_updated_at
  before update on public.store_settings
  for each row execute function public.set_updated_at();

insert into public.store_settings (key, value, description) values
  ('delivery_fee', '0',
   'Flat delivery charge added to every order, in your store currency. Collected in cash with the order total.'),
  ('free_delivery_threshold', '0',
   'If the items subtotal is at or above this amount, delivery is free. Set to 0 to always charge the delivery fee.'),
  ('currency', '"USD"',
   'ISO currency code used when formatting prices in emails.'),
  ('cod_enabled', 'true',
   'Whether cash on delivery is accepted. Set false to pause checkout entirely.')
on conflict (key) do nothing;

alter table public.store_settings enable row level security;
-- No policies: settings are readable only through your Express API, which uses
-- the service_role key. The storefront gets what it needs from /api/store-info.

-- =============================================================================
--  STEP 3 — reload the functions.
--  Run db/02_functions.sql again. It is all CREATE OR REPLACE, so it safely
--  overwrites the old prepaid versions with the COD ones.
-- =============================================================================

-- Verify afterwards:
--   select column_name from information_schema.columns
--    where table_name = 'orders' order by ordinal_position;
--   select unnest(enum_range(null::order_status));
--   select key, value from store_settings;
