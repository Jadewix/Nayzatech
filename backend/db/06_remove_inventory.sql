-- =============================================================================
--  TECH STORE — 06_remove_inventory.sql
--  Removes stock-quantity tracking. Run this AFTER 01–04 (and 05 if you used it).
--
--  WHAT CHANGES
--  ------------
--  This store does not count units. It only needs to answer one question about
--  a product: can someone order it right now, yes or no. So:
--
--      products.stock_quantity      (integer)  ->  products.in_stock (boolean)
--      products.low_stock_threshold (integer)  ->  gone
--      inventory_movements          (table)    ->  gone
--      adjust_stock()               (function) ->  gone
--
--  `in_stock` is not a new idea in the API — the products_with_category view
--  already exposed a computed `in_stock` derived from the count. It simply
--  becomes a stored column instead of a derived one, so every response the
--  storefront already reads keeps the same shape.
--
--  WHAT THIS GIVES UP, DELIBERATELY
--  --------------------------------
--  create_order used to hold a row lock (`select ... for update`) so that two
--  simultaneous checkouts for the last unit could not both succeed. That was
--  real and it was tested — 8 concurrent checkouts for 1 unit produced exactly
--  1 success. It is being removed because it protects a number this store no
--  longer keeps. With a boolean there is nothing to oversell: two customers
--  ordering the same in-stock item both succeed, which is the intended
--  behaviour. Restocking on cancellation and failed delivery goes away for the
--  same reason — there is no count to give back.
--
--  If you ever want unit counts again, the old logic is in git history and in
--  02_functions.sql; do not try to reconstruct it by hand.
--
--  THIS IS A ONE-WAY CHANGE. It drops columns and a table. Take a Supabase
--  backup first if the data matters.
--
--  Paste the whole file into the Supabase SQL Editor and run it once.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
--  1. The view reads stock_quantity, so it has to go before the column does.
--     It is recreated in step 4.
-- -----------------------------------------------------------------------------
drop view if exists public.products_with_category;


-- -----------------------------------------------------------------------------
--  2. products: add the boolean, carry the current truth across, drop the counts.
--
--     The backfill runs before the drop, so a product sitting at 0 units today
--     comes out the other side marked sold out rather than silently back on sale.
-- -----------------------------------------------------------------------------
alter table public.products
  add column if not exists in_stock boolean not null default true;

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'products'
       and column_name = 'stock_quantity'
  ) then
    execute 'update public.products set in_stock = (stock_quantity > 0)';
  end if;
end
$$;

alter table public.products drop constraint if exists products_stock_not_negative;
alter table public.products drop column if exists stock_quantity;
alter table public.products drop column if exists low_stock_threshold;

comment on column public.products.in_stock is
  'Can this be ordered right now. false = shown on the storefront as sold out, with Add to cart disabled. To hide a product entirely, use is_active instead.';

-- Sold-out products are filtered on every catalogue page, so index the flag the
-- same way is_active is indexed.
create index if not exists idx_products_in_stock
  on public.products(in_stock) where in_stock = true;


-- -----------------------------------------------------------------------------
--  3. orders: stock_restored guarded against double-restocking. Nothing restocks
--     any more, so the guard has nothing to guard.
-- -----------------------------------------------------------------------------
alter table public.orders drop column if exists stock_restored;


-- -----------------------------------------------------------------------------
--  4. Recreate the view.
--
--     `in_stock` now arrives through p.* as a real column, and is_low_stock is
--     gone with the threshold it was computed from.
-- -----------------------------------------------------------------------------
create or replace view public.products_with_category as
select
  p.*,
  c.name as category_name,
  c.slug as category_slug,
  coalesce(p.sale_price, p.base_price) as effective_price
from public.products p
left join public.categories c on c.id = p.category_id;


-- -----------------------------------------------------------------------------
--  5. create_order — same contract, same price protection, no stock.
--
--     STILL TRUE, and still the most important thing in this function: prices
--     and the delivery fee are read from the database inside the transaction.
--     The browser sends product ids and quantities only. Nothing here trusts a
--     number that came from a request body.
--
--     GONE: the FOR UPDATE lock, the deduction, and the inventory_movements
--     entry. An item is orderable if it is active and in_stock; that check needs
--     no lock because the answer does not change by being read.
-- -----------------------------------------------------------------------------
create or replace function public.create_order(
  p_customer_name    text,
  p_customer_email   text,
  p_shipping_address jsonb,
  p_items            jsonb,
  p_customer_phone   text default null,
  p_notes            text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_item     jsonb;
  v_product  record;
  v_qty      integer;
  v_price    numeric(12,2);
  v_total    numeric(12,2) := 0;
  v_delivery_fee numeric(12,2) := 0;
  v_result   jsonb;
begin
  ---------------------------------------------------------------------------
  -- 1. Validate the payload shape before touching any table.
  ---------------------------------------------------------------------------
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'ORDER_EMPTY: an order must contain at least one item';
  end if;

  if jsonb_array_length(p_items) > 100 then
    raise exception 'ORDER_TOO_LARGE: an order cannot contain more than 100 line items';
  end if;

  ---------------------------------------------------------------------------
  -- 2. Create the order shell. total_amount is filled in at the end, once we
  --    know the real prices — we never trust a total sent by the browser.
  ---------------------------------------------------------------------------
  -- Cash on delivery cannot work without a phone number: you need it to confirm
  -- the order is real, and the courier needs it to call from the street.
  if p_customer_phone is null or btrim(p_customer_phone) = '' then
    raise exception 'PHONE_REQUIRED: a contact phone number is required for cash on delivery';
  end if;

  -- Respect the kill switch, so you can pause checkout without taking the site
  -- down (holidays, courier on strike).
  if not coalesce((select (value #>> '{}')::boolean from public.store_settings
                    where key = 'cod_enabled'), true) then
    raise exception 'CHECKOUT_CLOSED: we are not accepting orders right now. Please try again later.';
  end if;

  insert into public.orders (
    customer_name, customer_email, customer_phone,
    shipping_address, notes, subtotal, delivery_fee, total_amount, status
  )
  values (
    btrim(p_customer_name), lower(btrim(p_customer_email)), btrim(p_customer_phone),
    p_shipping_address, nullif(btrim(p_notes), ''), 0, 0, 0, 'pending'
  )
  returning id into v_order_id;

  ---------------------------------------------------------------------------
  -- 3. Walk every line item: verify it can be sold, snapshot it onto the order.
  --
  --    order_items keeps its own copy of the name, SKU, image and price. That
  --    is why deleting a product later does not corrupt old receipts.
  ---------------------------------------------------------------------------
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'quantity')::integer;

    if v_qty is null or v_qty <= 0 then
      raise exception 'INVALID_QUANTITY: quantity must be a positive whole number';
    end if;

    select id, name, sku, image_url, base_price, sale_price, is_active, in_stock
      into v_product
      from public.products
     where id = (v_item->>'product_id')::uuid;

    if not found then
      raise exception 'PRODUCT_NOT_FOUND: no product with id %', v_item->>'product_id';
    end if;

    if not v_product.is_active then
      raise exception 'PRODUCT_UNAVAILABLE: "%" is no longer available', v_product.name;
    end if;

    if not v_product.in_stock then
      raise exception 'PRODUCT_SOLD_OUT: "%" is sold out', v_product.name;
    end if;

    -- Price comes from the DATABASE, never from the request body. This is what
    -- stops someone editing the JSON in devtools and buying a laptop for $1.
    v_price := coalesce(v_product.sale_price, v_product.base_price);

    insert into public.order_items (
      order_id, product_id, product_name, product_sku,
      product_image_url, quantity, price_at_purchase
    )
    values (
      v_order_id, v_product.id, v_product.name, v_product.sku,
      v_product.image_url, v_qty, v_price
    );

    v_total := v_total + (v_price * v_qty);
  end loop;

  ---------------------------------------------------------------------------
  -- 4. Add delivery and write the authoritative totals.
  --
  --    The fee is read from store_settings HERE, inside the transaction —
  --    never taken from the request. It is then SNAPSHOTTED onto the order:
  --    raising your delivery fee next month must not silently change what an
  --    existing customer was told to have ready at the door.
  ---------------------------------------------------------------------------
  v_delivery_fee := public.get_delivery_fee(v_total);

  update public.orders
     set subtotal     = v_total,
         delivery_fee = v_delivery_fee,
         total_amount = v_total + v_delivery_fee
   where id = v_order_id;

  ---------------------------------------------------------------------------
  -- 5. Return the complete order so the caller can send the confirmation email.
  ---------------------------------------------------------------------------
  select to_jsonb(o) || jsonb_build_object(
           'items',
           coalesce((
             select jsonb_agg(to_jsonb(oi) order by oi.created_at)
               from public.order_items oi
              where oi.order_id = o.id
           ), '[]'::jsonb)
         )
    into v_result
    from public.orders o
   where o.id = v_order_id;

  return v_result;
end;
$$;

comment on function public.create_order is
  'Atomically creates an order with server-side prices and delivery fee. Rejects inactive or sold-out products.';


-- -----------------------------------------------------------------------------
--  6. set_order_status — the state machine survives untouched. Only the
--     restocking branch is gone.
--
--     The lifecycle itself is unchanged and still matters:
--
--       pending -> confirmed -> processing -> shipped -> delivered
--                                               |
--                                               +-> failed_delivery
--       (pending/confirmed/processing) -> cancelled
--
--     `pending` still exists because COD has no payment proving an order is
--     real. Someone phones the customer, then marks it confirmed.
--
--     All three end states are still terminal. They no longer restock, so the
--     old "cannot be reopened because inventory would drift" reasoning is moot,
--     but they stay final: an order that was cancelled or failed is a closed
--     record. If the customer wants it after all, place a new order.
-- -----------------------------------------------------------------------------
create or replace function public.set_order_status(
  p_order_id uuid,
  p_status   order_status,
  p_note     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order   record;
  v_allowed order_status[];
begin
  select id, status
    into v_order
    from public.orders
   where id = p_order_id
   for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND: no order with id %', p_order_id;
  end if;

  if v_order.status = p_status then
    raise exception 'STATUS_UNCHANGED: this order is already "%"', p_status;
  end if;

  ---------------------------------------------------------------------------
  -- The state machine, written out explicitly. Anything not listed is illegal.
  ---------------------------------------------------------------------------
  v_allowed := case v_order.status
    when 'pending'         then array['confirmed', 'cancelled']::order_status[]
    when 'confirmed'       then array['processing', 'cancelled']::order_status[]
    when 'processing'      then array['shipped', 'cancelled']::order_status[]
    -- Note: a single failed attempt does NOT belong here. Use
    -- record_delivery_attempt() for that; it keeps the order 'shipped' so the
    -- courier can try again. Move to 'failed_delivery' only when giving up.
    when 'shipped'         then array['delivered', 'failed_delivery', 'cancelled']::order_status[]
    else array[]::order_status[]   -- delivered / cancelled / failed_delivery are final
  end;

  if not (p_status = any(v_allowed)) then
    if array_length(v_allowed, 1) is null then
      raise exception 'INVALID_TRANSITION: "%" is a final status and cannot be changed', v_order.status;
    else
      raise exception 'INVALID_TRANSITION: cannot go from "%" to "%". Allowed next: %',
        v_order.status, p_status, array_to_string(v_allowed, ', ');
    end if;
  end if;

  update public.orders
     set status       = p_status,
         -- Stamp the moment you verified the order, for your own records.
         confirmed_at = case when p_status = 'confirmed' then now() else confirmed_at end,
         admin_notes  = case
           when p_note is null then admin_notes
           else coalesce(admin_notes || E'\n', '') || p_note
         end
   where id = p_order_id;

  return (select to_jsonb(o) from public.orders o where o.id = p_order_id);
end;
$$;

comment on function public.set_order_status is
  'Transitions an order through the COD lifecycle, enforcing legal moves.';


-- -----------------------------------------------------------------------------
--  7. check_availability — replaces check_stock_availability.
--
--     Still the pre-checkout call the cart page makes, so a customer finds out
--     about an unavailable item BEFORE filling in their address. It still
--     returns the money breakdown priced from the database, which is the other
--     half of what the cart needs.
--
--     Renamed because it no longer checks stock levels — it checks whether each
--     line can be sold at all. Keeping the old name would have described
--     something the function stopped doing.
-- -----------------------------------------------------------------------------
create or replace function public.check_availability(p_items jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_item      jsonb;
  v_product   record;
  v_qty       integer;
  v_results   jsonb := '[]'::jsonb;
  v_all_ok    boolean := true;
  v_subtotal  numeric(12,2) := 0;
  v_delivery  numeric(12,2) := 0;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'INVALID_PAYLOAD: items must be an array';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := coalesce((v_item->>'quantity')::integer, 0);

    select id, name, is_active, in_stock, base_price, sale_price
      into v_product
      from public.products
     where id = (v_item->>'product_id')::uuid;

    if not found then
      v_all_ok := false;
      v_results := v_results || jsonb_build_object(
        'product_id', v_item->>'product_id',
        'available',  false,
        'reason',     'not_found'
      );
    elsif not v_product.is_active then
      v_all_ok := false;
      v_results := v_results || jsonb_build_object(
        'product_id', v_product.id, 'product_name', v_product.name,
        'available',  false, 'reason', 'unavailable'
      );
    elsif not v_product.in_stock then
      v_all_ok := false;
      v_results := v_results || jsonb_build_object(
        'product_id', v_product.id, 'product_name', v_product.name,
        'available',  false, 'reason', 'sold_out',
        'requested',  v_qty
      );
    else
      v_results := v_results || jsonb_build_object(
        'product_id',  v_product.id, 'product_name', v_product.name,
        'available',   true, 'requested', v_qty,
        'unit_price',  coalesce(v_product.sale_price, v_product.base_price)
      );
    end if;
  end loop;

  -- Also return the money breakdown, so the cart can show
  -- "Items $129.00 + Delivery $3.00 = Pay $132.00 in cash" before checkout.
  -- Prices come from the database here too, never from the browser.
  select coalesce(sum(
           coalesce(p.sale_price, p.base_price) * (i->>'quantity')::int
         ), 0)
    into v_subtotal
    from jsonb_array_elements(p_items) i
    join public.products p on p.id = (i->>'product_id')::uuid
   where p.is_active;

  v_delivery := public.get_delivery_fee(v_subtotal);

  return jsonb_build_object(
    'all_available', v_all_ok,
    'items',         v_results,
    'subtotal',      v_subtotal,
    'delivery_fee',  v_delivery,
    'total',         v_subtotal + v_delivery,
    'payment_method','cash_on_delivery'
  );
end;
$$;

comment on function public.check_availability is
  'Pre-checkout check that every line can be sold, plus the database-priced money breakdown.';


-- -----------------------------------------------------------------------------
--  8. Drop what is now unreachable.
--
--     Order matters: the movements table uses the enum, and both are referenced
--     by the functions replaced above, so this comes last.
-- -----------------------------------------------------------------------------
--     Dropped by name rather than by signature. adjust_stock takes a
--     stock_movement_reason argument, so writing the signature out by hand
--     would mean naming the very type we are about to drop — and one typo in
--     it would leave the function in place, which would then block the DROP
--     TYPE below with a dependency error. This finds whatever is actually
--     there and removes every overload.
do $$
declare
  v_signature text;
begin
  for v_signature in
    select format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid))
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('adjust_stock', 'check_stock_availability')
  loop
    execute 'drop function ' || v_signature;
  end loop;
end
$$;

drop table if exists public.inventory_movements;
drop type  if exists stock_movement_reason;

commit;


-- =============================================================================
--  VERIFY — run this after, it should return one row per product and no errors.
-- =============================================================================
-- select name, is_active, in_stock, base_price, sale_price
--   from public.products_with_category
--  order by name;
--
--  And confirm the old surface is gone (all three should return 0 rows):
--
-- select 1 from information_schema.columns
--  where table_name = 'products' and column_name in ('stock_quantity','low_stock_threshold');
-- select 1 from information_schema.tables where table_name = 'inventory_movements';
-- select 1 from pg_proc where proname in ('adjust_stock','check_stock_availability');
