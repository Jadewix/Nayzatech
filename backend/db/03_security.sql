-- =============================================================================
--  TECH STORE — 03_security.sql
--  Row Level Security + Storage bucket. Run this THIRD.
--
--  READ THIS PART CAREFULLY — it is the difference between a store and a leak.
--
--  Supabase gives you two API keys:
--
--    anon key          Safe to ship in your React bundle. Anyone who opens
--                      devtools can read it. RLS policies are the ONLY thing
--                      standing between this key and your data.
--
--    service_role key   Bypasses RLS completely. It can read, edit and delete
--                      every row in every table. This key lives ONLY in your
--                      Express server's .env file. If it ever appears in
--                      frontend code, a git commit, or a screenshot, rotate it
--                      immediately in the Supabase dashboard.
--
--  This backend uses the service_role key, so RLS does not restrict it. We
--  still enable RLS on every table, because "the backend is the only thing that
--  talks to the database" is a promise that gets broken later — someone adds a
--  quick Supabase call in React to save time. When that happens, these policies
--  make sure the worst case is reading a public product list, not downloading
--  every customer's home address.
-- =============================================================================

-- Enable RLS everywhere. With RLS on and no policy, the anon key gets nothing.
alter table public.categories           enable row level security;
alter table public.products             enable row level security;
alter table public.category_spec_fields enable row level security;
alter table public.orders               enable row level security;
alter table public.order_items          enable row level security;
alter table public.contact_submissions  enable row level security;
alter table public.inventory_movements  enable row level security;


-- -----------------------------------------------------------------------------
--  PUBLIC CATALOGUE: readable by anyone, writable by nobody.
--  Only active rows — a draft product is invisible until you publish it.
-- -----------------------------------------------------------------------------
drop policy if exists "public can read active categories" on public.categories;
create policy "public can read active categories"
  on public.categories for select
  to anon, authenticated
  using (is_active = true);

drop policy if exists "public can read active products" on public.products;
create policy "public can read active products"
  on public.products for select
  to anon, authenticated
  using (is_active = true);

drop policy if exists "public can read spec fields" on public.category_spec_fields;
create policy "public can read spec fields"
  on public.category_spec_fields for select
  to anon, authenticated
  using (true);


-- -----------------------------------------------------------------------------
--  PRIVATE DATA: no policies at all.
--
--  orders, order_items, contact_submissions and inventory_movements deliberately
--  have RLS enabled and ZERO policies. That means the anon key can do nothing
--  with them — not read, not write. All access goes through your Express API,
--  which authenticates admins with the x-admin-key header.
--
--  Customers look up their own order by its UUID via GET /api/orders/:id. A v4
--  UUID is unguessable, so the order id doubles as a capability token — the
--  same pattern parcel-tracking links use.
-- -----------------------------------------------------------------------------


-- -----------------------------------------------------------------------------
--  STORAGE BUCKET for product images.
--
--  Public bucket: image URLs work in <img src> with no signed-URL dance, which
--  is what you want for a storefront. Uploads still require the service_role
--  key, so only your Express server can put files in it.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880,  -- 5 MB per file
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Anyone can VIEW an image (that is the point of a storefront)...
drop policy if exists "public can view product images" on storage.objects;
create policy "public can view product images"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'product-images');

-- ...but nobody using the anon key can upload, overwrite or delete one.
-- No insert/update/delete policies exist, so only service_role can write.


-- =============================================================================
--  OPTIONAL: uncomment if you later switch admin auth from an API key to
--  Supabase Auth. It reads a custom JWT claim set on your admin user.
-- =============================================================================
-- create or replace function public.is_admin()
-- returns boolean
-- language sql
-- stable
-- as $$
--   select coalesce((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean, false);
-- $$;
--
-- create policy "admins manage products"
--   on public.products for all
--   to authenticated
--   using (public.is_admin()) with check (public.is_admin());
