-- =============================================================================
--  TECH STORE — 01_schema.sql
--  Tables, enums, indexes and triggers.
--  Run this FIRST in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query).
--  Safe to re-run: every statement is idempotent.
-- =============================================================================

-- gen_random_uuid() lives in pgcrypto. Supabase enables this by default, but we
-- ask for it explicitly so this script also works on a bare Postgres instance.
create extension if not exists "pgcrypto";

-- citext = case-insensitive text. We use it for emails so that
-- "Jad@Example.com" and "jad@example.com" are treated as the same address.
create extension if not exists "citext";


-- -----------------------------------------------------------------------------
--  ENUMS
-- -----------------------------------------------------------------------------

-- The lifecycle of an order. Postgres will reject any value outside this list,
-- so a typo in the API can never write a bogus status into the database.
-- THE CASH-ON-DELIVERY LIFECYCLE
--
--   pending ──> confirmed ──> processing ──> shipped ──> delivered   (terminal)
--      │            │              │             │
--      │            │              │             └──> failed_delivery (terminal)
--      └────────────┴──────────────┴──> cancelled                    (terminal)
--
-- Why 'confirmed' exists: with COD there is no payment proving the order is
-- real. Anyone can type a fake name and address and you would ship to nobody.
-- So a new order sits at 'pending' until you phone or message the customer,
-- then you mark it 'confirmed' and only then does it get packed.
--
-- Why 'failed_delivery' exists separately from 'cancelled': both return stock
-- to the shelf, but they cost you very different amounts. 'cancelled' is a
-- customer changing their mind before you spent anything. 'failed_delivery'
-- means the courier drove there, possibly more than once, and came back with
-- your goods. Keeping them apart is what lets you see that second number.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'order_status') then
    create type order_status as enum (
      'pending',          -- placed by the customer, not yet verified by you
      'confirmed',        -- you contacted the customer and the order is real
      'processing',       -- being packed
      'shipped',          -- handed to the courier, cash not yet collected
      'delivered',        -- customer received it and paid the courier
      'cancelled',        -- called off before delivery; stock returned
      'failed_delivery'   -- courier could not deliver; stock returned
    );
  end if;
end$$;

-- NOTE: there is deliberately no payment_status or payment_reference column.
-- This store is cash on delivery, so the site never touches money: the courier
-- collects it at the door and 'delivered' means the customer paid. Cash
-- reconciliation with your courier happens outside this system.
--
-- If you ever add card payments, add a payment_status enum and column then —
-- an unused column that lies about what it tracks is worse than no column.

-- Why stock moved. Every change to products.stock_quantity is journalled.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'stock_movement_reason') then
    create type stock_movement_reason as enum (
      'order_placed',      -- automatic deduction at checkout
      'order_cancelled',   -- automatic return when an order is cancelled
      'delivery_failed',   -- automatic return when the courier could not deliver
      'restock',           -- admin added inventory
      'manual_adjustment', -- admin corrected a count
      'damaged',           -- write-off
      'returned'           -- customer sent it back
    );
  end if;
end$$;


-- -----------------------------------------------------------------------------
--  SHARED TRIGGER FUNCTION
--  Keeps updated_at honest without the API having to remember to set it.
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;


-- -----------------------------------------------------------------------------
--  CATEGORIES
--  Self-referencing tree: "Laptops" -> "Gaming Laptops" -> "17-inch".
--  parent_id is null for a top-level category.
-- -----------------------------------------------------------------------------
create table if not exists public.categories (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text not null unique,          -- URL-safe: "gaming-laptops"
  description   text,
  image_url     text,                          -- optional category banner
  parent_id     uuid references public.categories(id) on delete set null,
  display_order integer not null default 0,    -- lets you hand-sort the nav menu
  is_active     boolean not null default true, -- soft hide without deleting
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- A category cannot be its own parent. (Deeper cycles are prevented in the
  -- API layer, since a pure SQL check for those needs a recursive trigger.)
  constraint categories_no_self_parent check (parent_id is null or parent_id <> id),
  constraint categories_name_not_blank  check (length(btrim(name)) > 0)
);

create index if not exists idx_categories_parent on public.categories(parent_id);
create index if not exists idx_categories_slug   on public.categories(slug);

drop trigger if exists trg_categories_updated_at on public.categories;
create trigger trg_categories_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
--  PRODUCTS
--
--  PRODUCT SPECS DECISION: specs is a JSONB column rather than a separate
--  key/value table. A laptop needs {"cpu","ram_gb","screen_size"}, a phone case
--  needs {"compatible_models","material"}, and a USB cable needs almost nothing.
--  Forcing all three into one rigid table means either 40 mostly-null columns or
--  a slow entity-attribute-value join on every listing page. JSONB with a GIN
--  index gives you flexible attributes AND fast filtering.
--
--  The companion table `category_spec_fields` (below) describes which spec keys
--  belong to which category, so your React admin form and filter sidebar can be
--  generated from data instead of hardcoded per category.
-- -----------------------------------------------------------------------------
create table if not exists public.products (
  id              uuid primary key default gen_random_uuid(),
  category_id     uuid references public.categories(id) on delete set null,
  name            text not null,
  slug            text not null unique,
  sku             text not null unique,          -- your internal stock code
  brand           text,
  base_price      numeric(12,2) not null,        -- numeric, never float: money must not round badly
  sale_price      numeric(12,2),                 -- optional discounted price; null = not on sale
  stock_quantity  integer not null default 0,
  low_stock_threshold integer not null default 5, -- powers a "low stock" admin filter
  description     text,
  short_description text,                        -- one-liner for product cards
  image_url       text,                          -- primary image (Supabase Storage public URL)
  gallery_urls    text[] not null default '{}',  -- additional images, in display order
  specs           jsonb not null default '{}'::jsonb,
  weight_grams    integer,                       -- for shipping calculations later
  is_active       boolean not null default true, -- false = hidden from the storefront
  is_featured     boolean not null default false,-- surfaces on the homepage
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint products_price_positive      check (base_price >= 0),
  constraint products_sale_price_valid    check (sale_price is null or (sale_price >= 0 and sale_price <= base_price)),
  constraint products_stock_not_negative  check (stock_quantity >= 0),
  constraint products_specs_is_object     check (jsonb_typeof(specs) = 'object'),
  constraint products_name_not_blank      check (length(btrim(name)) > 0)
);

create index if not exists idx_products_category on public.products(category_id);
create index if not exists idx_products_slug     on public.products(slug);
create index if not exists idx_products_sku      on public.products(sku);
create index if not exists idx_products_active   on public.products(is_active) where is_active = true;
create index if not exists idx_products_featured on public.products(is_featured) where is_featured = true;

-- GIN index makes JSONB containment queries fast, e.g.
--   select * from products where specs @> '{"ram_gb": 16}';
create index if not exists idx_products_specs on public.products using gin (specs jsonb_path_ops);

-- Full-text search across name + brand + description, so /api/products?search=thinkpad
-- does not have to fall back to a slow ILIKE '%...%' scan on a large catalogue.
create index if not exists idx_products_search on public.products
  using gin (to_tsvector('english',
    coalesce(name, '') || ' ' || coalesce(brand, '') || ' ' || coalesce(description, '')));

drop trigger if exists trg_products_updated_at on public.products;
create trigger trg_products_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
--  CATEGORY SPEC FIELDS
--  Metadata, not product data. It tells the frontend: "for the Laptops category,
--  show a RAM filter that is a number in GB, and a CPU filter that is a dropdown."
--  Add a row here and a new filter appears in React with no code change.
-- -----------------------------------------------------------------------------
create table if not exists public.category_spec_fields (
  id            uuid primary key default gen_random_uuid(),
  category_id   uuid not null references public.categories(id) on delete cascade,
  spec_key      text not null,                       -- matches a key inside products.specs
  label         text not null,                       -- "RAM"
  unit          text,                                -- "GB"
  data_type     text not null default 'text',        -- text | number | boolean | list
  is_filterable boolean not null default true,       -- show in the filter sidebar
  options       jsonb not null default '[]'::jsonb,  -- allowed values for dropdowns
  display_order integer not null default 0,

  constraint category_spec_fields_type_valid
    check (data_type in ('text', 'number', 'boolean', 'list')),
  constraint category_spec_fields_unique unique (category_id, spec_key)
);

create index if not exists idx_spec_fields_category on public.category_spec_fields(category_id);


-- -----------------------------------------------------------------------------
--  ORDERS
--
--  shipping_address is JSONB rather than a flat text blob. Structured data means
--  you can print a proper label, sort by city, or plug in a shipping-rate API
--  later. The API validates its shape with zod before it ever reaches Postgres.
--  Expected shape:
--    { "line1","line2","city","region","postal_code","country" }
-- -----------------------------------------------------------------------------
create table if not exists public.orders (
  id               uuid primary key default gen_random_uuid(),
  order_number     text not null unique,          -- human-friendly: TS-20260824-00042
  customer_name    text not null,
  customer_email   citext not null,
  -- Phone is REQUIRED for cash on delivery, unlike a prepaid store. You cannot
  -- confirm the order or have the courier call from the street without it.
  customer_phone   text not null,
  shipping_address jsonb not null,

  -- MONEY BREAKDOWN
  -- Three separate columns rather than one total, because the courier needs to
  -- know exactly what to collect and you need to see what you actually earned
  -- on the goods once delivery is stripped out.
  subtotal         numeric(12,2) not null default 0,  -- items only
  delivery_fee     numeric(12,2) not null default 0,  -- snapshotted at checkout
  total_amount     numeric(12,2) not null default 0,  -- THE CASH TO COLLECT AT THE DOOR

  status           order_status not null default 'pending',

  -- COD OPERATIONS
  confirmed_at      timestamptz,                    -- when you verified the order is real
  delivery_attempts integer not null default 0,     -- how many times the courier tried
  last_attempt_at   timestamptz,

  notes            text,                          -- customer's delivery instructions
  admin_notes      text,                          -- internal, never returned publicly
  stock_restored   boolean not null default false,-- guards against double-restocking
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint orders_subtotal_not_negative check (subtotal >= 0),
  constraint orders_delivery_not_negative check (delivery_fee >= 0),
  constraint orders_total_not_negative    check (total_amount >= 0),
  constraint orders_attempts_not_negative check (delivery_attempts >= 0),
  constraint orders_address_is_object     check (jsonb_typeof(shipping_address) = 'object'),
  constraint orders_phone_not_blank       check (length(btrim(customer_phone)) > 0),
  constraint orders_email_looks_valid     check (customer_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
);

create index if not exists idx_orders_email   on public.orders(customer_email);
create index if not exists idx_orders_status  on public.orders(status);
create index if not exists idx_orders_created on public.orders(created_at desc);
create index if not exists idx_orders_number  on public.orders(order_number);
-- The admin's daily work queue: new orders awaiting a confirmation call.
create index if not exists idx_orders_pending on public.orders(created_at) where status = 'pending';

drop trigger if exists trg_orders_updated_at on public.orders;
create trigger trg_orders_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

-- Order numbers come from a sequence so they are sequential and never collide,
-- even if two customers check out in the same millisecond.
create sequence if not exists public.order_number_seq start 1;

create or replace function public.generate_order_number()
returns text
language sql
volatile
as $$
  select 'TS-' || to_char(now(), 'YYYYMMDD') || '-' ||
         lpad(nextval('public.order_number_seq')::text, 5, '0');
$$;

alter table public.orders alter column order_number set default public.generate_order_number();


-- -----------------------------------------------------------------------------
--  ORDER ITEMS
--
--  price_at_purchase, product_name and product_sku are SNAPSHOTS taken at
--  checkout. If you raise a laptop's price next month, or rename it, or delete
--  it entirely, this order still shows what the customer actually bought and
--  paid. Never join to products to render a historical receipt.
-- -----------------------------------------------------------------------------
create table if not exists public.order_items (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references public.orders(id) on delete cascade,
  -- on delete set null (not cascade): deleting a product must never silently
  -- erase a line from a real order's history.
  product_id        uuid references public.products(id) on delete set null,
  product_name      text not null,
  product_sku       text not null,
  product_image_url text,
  quantity          integer not null,
  price_at_purchase numeric(12,2) not null,
  -- Generated column: Postgres computes it, so a line total can never disagree
  -- with its own quantity x price.
  line_total        numeric(12,2) generated always as (quantity * price_at_purchase) stored,
  created_at        timestamptz not null default now(),

  constraint order_items_quantity_positive check (quantity > 0),
  constraint order_items_price_not_negative check (price_at_purchase >= 0)
);

create index if not exists idx_order_items_order   on public.order_items(order_id);
create index if not exists idx_order_items_product on public.order_items(product_id);


-- -----------------------------------------------------------------------------
--  INVENTORY MOVEMENTS
--  An append-only audit log. When the numbers look wrong at 2am, this table
--  tells you exactly what changed the count, when, and why.
-- -----------------------------------------------------------------------------
create table if not exists public.inventory_movements (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null references public.products(id) on delete cascade,
  order_id       uuid references public.orders(id) on delete set null,
  quantity_delta integer not null,          -- negative = sold, positive = restocked
  quantity_after integer not null,          -- stock level immediately after the change
  reason         stock_movement_reason not null,
  note           text,
  created_at     timestamptz not null default now()
);

create index if not exists idx_inventory_product on public.inventory_movements(product_id, created_at desc);
create index if not exists idx_inventory_order   on public.inventory_movements(order_id);


-- -----------------------------------------------------------------------------
--  CONTACT SUBMISSIONS
-- -----------------------------------------------------------------------------
create table if not exists public.contact_submissions (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      citext not null,
  subject    text,
  message    text not null,
  is_read    boolean not null default false,
  ip_address text,   -- stored for abuse tracing / rate limiting
  user_agent text,
  created_at timestamptz not null default now(),

  constraint contact_message_not_blank check (length(btrim(message)) > 0),
  constraint contact_email_looks_valid check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
);

create index if not exists idx_contact_unread  on public.contact_submissions(is_read) where is_read = false;
create index if not exists idx_contact_created on public.contact_submissions(created_at desc);


-- -----------------------------------------------------------------------------
--  STORE SETTINGS
--
--  A tiny key/value table for things you want to change without redeploying —
--  the delivery fee above all.
--
--  WHY THIS IS A TABLE AND NOT AN ENVIRONMENT VARIABLE
--  An env var means editing .env and restarting the server (on a hosting
--  platform, a full redeploy) every time you adjust the delivery charge. A
--  table means you change it from the admin panel and the next order picks it
--  up immediately.
--
--  It also means the fee is read INSIDE the checkout transaction, straight from
--  the database — so the browser can never send its own delivery fee and pay
--  less than you charge.
-- -----------------------------------------------------------------------------
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

-- Defaults. Change these from the admin panel, not by editing this file.
insert into public.store_settings (key, value, description) values
  ('delivery_fee', '0',
   'Flat delivery charge added to every order, in your store currency. Collected in cash with the order total.'),
  ('free_delivery_threshold', '0',
   'If the items subtotal is at or above this amount, delivery is free. Set to 0 to always charge the delivery fee.'),
  ('currency', '"USD"',
   'ISO currency code used when formatting prices in emails.'),
  ('cod_enabled', 'true',
   'Whether cash on delivery is accepted. Set false to pause checkout entirely.')
on conflict (key) do nothing;   -- never overwrite a value you have already set

-- Reads the delivery fee that applies to a given items subtotal.
-- Used inside create_order, and exposed to the storefront so the cart can show
-- the charge before the customer commits.
create or replace function public.get_delivery_fee(p_subtotal numeric)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_fee       numeric(12,2);
  v_threshold numeric(12,2);
begin
  select coalesce((value #>> '{}')::numeric, 0) into v_fee
    from public.store_settings where key = 'delivery_fee';

  select coalesce((value #>> '{}')::numeric, 0) into v_threshold
    from public.store_settings where key = 'free_delivery_threshold';

  v_fee       := coalesce(v_fee, 0);
  v_threshold := coalesce(v_threshold, 0);

  -- A threshold of 0 means "no free delivery", not "everything is free".
  if v_threshold > 0 and p_subtotal >= v_threshold then
    return 0;
  end if;

  return v_fee;
end;
$$;


-- -----------------------------------------------------------------------------
--  CONVENIENCE VIEW
--  Products with their category name already joined, so listing endpoints do not
--  need to hand-write the join every time.
-- -----------------------------------------------------------------------------
create or replace view public.products_with_category as
select
  p.*,
  c.name as category_name,
  c.slug as category_slug,
  (p.stock_quantity > 0)                        as in_stock,
  (p.stock_quantity <= p.low_stock_threshold)   as is_low_stock,
  coalesce(p.sale_price, p.base_price)          as effective_price
from public.products p
left join public.categories c on c.id = p.category_id;
