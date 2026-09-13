-- =============================================================================
--  TECH STORE — 08_dashboard_stats.sql
--  Run this in the Supabase SQL Editor. Safe to run more than once.
--
--  THE PROBLEM
--  -----------
--  GET /api/admin/dashboard counted the shop in JavaScript:
--
--      supabase.from('orders').select('status, total_amount, created_at')
--
--  No filter, no limit. Every order row ever placed was pulled across the wire
--  into Node on every dashboard load, then summed with a for-loop.
--
--  That is slow at ten thousand orders. What makes it a bug rather than a
--  slowdown is what happens first: PostgREST caps how many rows it will return.
--  Past that cap the request still succeeds — it just silently returns the
--  first N rows. The dashboard would keep showing a revenue figure, keep
--  looking healthy, and quietly stop counting the newest orders. Wrong numbers
--  that look right are worse than an error, because nobody investigates them.
--
--  THE FIX
--  -------
--  Count in the database, which is what it is for. One round trip returns nine
--  numbers instead of every row, the cost stops depending on order volume, and
--  there is no row cap to silently truncate a COUNT.
--
--  Same principle as create_order and set_order_status: arithmetic the shop
--  depends on belongs in SQL, not in a JavaScript loop over fetched rows.
-- =============================================================================

create or replace function public.get_dashboard_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with product_stats as (
    select
      count(*)                                              as total,
      count(*) filter (where is_active)                     as active,
      count(*) filter (where is_active and not in_stock)    as sold_out
    from public.products
  ),
  order_stats as (
    select
      count(*)                                                 as total,
      count(*) filter (where status = 'pending')               as awaiting_confirmation,
      count(*) filter (where status = 'shipped')               as out_for_delivery,
      count(*) filter (where status = 'failed_delivery')       as failed_deliveries,
      -- Revenue counts DELIVERED orders only. With cash on delivery the money
      -- does not exist until the courier hands it over; anything earlier in
      -- the pipeline is a hope, not a sale.
      coalesce(sum(total_amount) filter (where status = 'delivered'), 0)
        as lifetime_revenue,
      coalesce(sum(total_amount) filter (
        where status = 'delivered'
          and created_at >= now() - interval '30 days'
      ), 0) as revenue_30d
    from public.orders
  ),
  status_counts as (
    select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) as by_status
    from (
      select status::text as status, count(*) as n
      from public.orders
      group by status
    ) grouped
  )
  select jsonb_build_object(
    'products', jsonb_build_object(
      'total',    p.total,
      'active',   p.active,
      'sold_out', p.sold_out
    ),
    'orders', jsonb_build_object(
      'total',                 o.total,
      'by_status',             s.by_status,
      'awaiting_confirmation', o.awaiting_confirmation,
      'out_for_delivery',      o.out_for_delivery,
      'failed_deliveries',     o.failed_deliveries
    ),
    'revenue', jsonb_build_object(
      'lifetime',     round(o.lifetime_revenue, 2),
      'last_30_days', round(o.revenue_30d, 2),
      'basis',        'delivered_orders_only'
    )
  )
  from product_stats p, order_stats o, status_counts s;
$$;

comment on function public.get_dashboard_stats is
  'Whole-shop counters for the admin dashboard, aggregated in Postgres so the '
  'cost does not grow with order volume and no row cap can truncate a total.';

-- Supporting index -----------------------------------------------------------
--
-- The revenue figures filter on status AND created_at together. idx_orders_status
-- and idx_orders_created each cover half of that; this covers both, so the
-- 30-day revenue sum stays an index scan rather than a full table scan once the
-- orders table is large.
create index if not exists idx_orders_status_created
  on public.orders(status, created_at desc);
