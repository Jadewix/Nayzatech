-- =============================================================================
--  TECH STORE — 02_functions.sql
--  Atomic business logic that MUST NOT be done in JavaScript.
--  Run this SECOND, after 01_schema.sql.
--
--  WHY THESE LIVE IN POSTGRES
--  --------------------------
--  Imagine one laptop left in stock and two customers checking out at the same
--  moment. In plain JavaScript you would:
--      1. read stock  -> both requests see "1 available"
--      2. check it    -> both pass
--      3. deduct it   -> stock becomes -1, you sold a laptop you do not have
--
--  That gap between step 1 and step 3 is a race condition, and it is the single
--  most common bug in hand-rolled e-commerce backends. The fix is to do the
--  read, the check and the write inside ONE database transaction that holds a
--  lock on the product row (`select ... for update`). The second request waits
--  its turn, re-reads the real stock, sees 0, and is rejected cleanly.
--
--  Node calls these with supabase.rpc('create_order', {...}).
-- =============================================================================


-- -----------------------------------------------------------------------------
--  create_order
--
--  Creates an order, its line items, deducts stock and writes the audit trail —
--  all or nothing. If ANY item is out of stock the whole transaction rolls back
--  and no partial order is left behind.
--
--  p_items shape:  [{ "product_id": "uuid", "quantity": 2 }, ...]
--  Returns the full order (with items) as JSON so Node does not need a follow-up
--  query just to build the confirmation email.
--
--  Errors are raised with a machine-readable prefix (INSUFFICIENT_STOCK: ...)
--  so the Express error handler can map them to a proper HTTP status code
--  instead of returning a generic 500.
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
  -- down (stock count day, holidays, courier on strike).
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
  -- 3. Walk every line item: lock, verify, deduct, record.
  ---------------------------------------------------------------------------
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'quantity')::integer;

    if v_qty is null or v_qty <= 0 then
      raise exception 'INVALID_QUANTITY: quantity must be a positive whole number';
    end if;

    -- FOR UPDATE is the important part. It locks this product row until the
    -- transaction commits, so a concurrent checkout cannot read a stale count.
    select id, name, sku, image_url, base_price, sale_price, stock_quantity, is_active
      into v_product
      from public.products
     where id = (v_item->>'product_id')::uuid
     for update;

    if not found then
      raise exception 'PRODUCT_NOT_FOUND: no product with id %', v_item->>'product_id';
    end if;

    if not v_product.is_active then
      raise exception 'PRODUCT_UNAVAILABLE: "%" is no longer available', v_product.name;
    end if;

    if v_product.stock_quantity < v_qty then
      raise exception 'INSUFFICIENT_STOCK: "%" — requested %, only % left',
        v_product.name, v_qty, v_product.stock_quantity;
    end if;

    -- Price comes from the DATABASE, never from the request body. This is what
    -- stops someone editing the JSON in devtools and buying a laptop for $1.
    v_price := coalesce(v_product.sale_price, v_product.base_price);

    update public.products
       set stock_quantity = stock_quantity - v_qty
     where id = v_product.id;

    insert into public.order_items (
      order_id, product_id, product_name, product_sku,
      product_image_url, quantity, price_at_purchase
    )
    values (
      v_order_id, v_product.id, v_product.name, v_product.sku,
      v_product.image_url, v_qty, v_price
    );

    insert into public.inventory_movements (
      product_id, order_id, quantity_delta, quantity_after, reason, note
    )
    values (
      v_product.id, v_order_id, -v_qty, v_product.stock_quantity - v_qty,
      'order_placed', 'Deducted at checkout'
    );

    v_total := v_total + (v_price * v_qty);
  end loop;

  ---------------------------------------------------------------------------
  -- 4. Add delivery and write the authoritative totals.
  --
  --    The fee is read from store_settings HERE, inside the transaction —
  --    never taken from the request. That is what stops someone editing the
  --    JSON in devtools and paying no delivery charge.
  --
  --    It is then SNAPSHOTTED onto the order. Raising your delivery fee next
  --    month must not silently change what an existing customer was told to
  --    have ready at the door.
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
  'Atomically creates an order, deducts stock under a row lock, and returns the order with its items.';


-- -----------------------------------------------------------------------------
--  adjust_stock
--
--  The admin stock endpoint calls this. Two modes:
--    'set'   -> stock becomes exactly p_value  (use after a physical stock count)
--    'delta' -> stock changes by p_value       (use when a shipment arrives: +20)
--
--  Doing it here rather than in JS means the read-modify-write is atomic, and
--  the audit log entry can never be forgotten.
-- -----------------------------------------------------------------------------
create or replace function public.adjust_stock(
  p_product_id uuid,
  p_mode       text,                                    -- 'set' | 'delta'
  p_value      integer,
  p_reason     stock_movement_reason default 'manual_adjustment',
  p_note       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product   record;
  v_new_stock integer;
  v_delta     integer;
begin
  if p_mode not in ('set', 'delta') then
    raise exception 'INVALID_MODE: mode must be either "set" or "delta"';
  end if;

  if p_value is null then
    raise exception 'INVALID_VALUE: value is required';
  end if;

  select id, name, stock_quantity
    into v_product
    from public.products
   where id = p_product_id
   for update;

  if not found then
    raise exception 'PRODUCT_NOT_FOUND: no product with id %', p_product_id;
  end if;

  if p_mode = 'set' then
    v_new_stock := p_value;
    v_delta     := p_value - v_product.stock_quantity;
  else
    v_new_stock := v_product.stock_quantity + p_value;
    v_delta     := p_value;
  end if;

  if v_new_stock < 0 then
    raise exception 'INSUFFICIENT_STOCK: that change would put "%" at % units', v_product.name, v_new_stock;
  end if;

  update public.products set stock_quantity = v_new_stock where id = p_product_id;

  -- A no-op adjustment is not worth an audit row.
  if v_delta <> 0 then
    insert into public.inventory_movements (
      product_id, quantity_delta, quantity_after, reason, note
    )
    values (p_product_id, v_delta, v_new_stock, p_reason, p_note);
  end if;

  return jsonb_build_object(
    'product_id',     p_product_id,
    'product_name',   v_product.name,
    'previous_stock', v_product.stock_quantity,
    'new_stock',      v_new_stock,
    'delta',          v_delta
  );
end;
$$;

comment on function public.adjust_stock is
  'Atomically sets or shifts a product stock level and journals the movement.';


-- -----------------------------------------------------------------------------
--  set_order_status
--
--  Moves an order through the cash-on-delivery lifecycle and enforces which
--  moves are legal:
--
--    pending ──> confirmed ──> processing ──> shipped ──> delivered   (terminal)
--       │            │              │             │
--       │            │              │             └──> failed_delivery (terminal)
--       └────────────┴──────────────┴──> cancelled                    (terminal)
--
--  Both 'cancelled' and 'failed_delivery' return every item to the shelf,
--  exactly once, guarded by the stock_restored flag.
--
--  All three end states are TERMINAL and cannot be reversed. For the two that
--  restock, the reason is subtle but important: the goods are already back on
--  sale, so re-opening the order would leave it active while someone else buys
--  its stock, and stock_restored would block any correction. Inventory would
--  drift, quietly, forever. If a customer wants the order after all, place a
--  new one.
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
  v_item    record;
  v_after   integer;
  v_allowed order_status[];
  v_reason  stock_movement_reason;
begin
  select id, status, stock_restored
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

  ---------------------------------------------------------------------------
  -- Return stock for the two outcomes where the goods come back to you.
  ---------------------------------------------------------------------------
  if p_status in ('cancelled', 'failed_delivery') and not v_order.stock_restored then
    v_reason := case when p_status = 'cancelled'
                     then 'order_cancelled'::stock_movement_reason
                     else 'delivery_failed'::stock_movement_reason end;

    for v_item in
      select product_id, quantity
        from public.order_items
       where order_id = p_order_id
         and product_id is not null
    loop
      update public.products
         set stock_quantity = stock_quantity + v_item.quantity
       where id = v_item.product_id
       returning stock_quantity into v_after;

      insert into public.inventory_movements (
        product_id, order_id, quantity_delta, quantity_after, reason, note
      )
      values (
        v_item.product_id, p_order_id, v_item.quantity, v_after, v_reason,
        coalesce(p_note, 'Stock returned: ' || p_status)
      );
    end loop;

    update public.orders
       set status         = p_status,
           stock_restored = true,
           admin_notes    = coalesce(admin_notes || E'\n', '') ||
                            coalesce(p_note, 'Marked ' || p_status)
     where id = p_order_id;

  else
    update public.orders
       set status       = p_status,
           -- Stamp the moment you verified the order, for your own records.
           confirmed_at = case when p_status = 'confirmed' then now() else confirmed_at end,
           admin_notes  = case
             when p_note is null then admin_notes
             else coalesce(admin_notes || E'\n', '') || p_note
           end
     where id = p_order_id;
  end if;

  return (select to_jsonb(o) from public.orders o where o.id = p_order_id);
end;
$$;

comment on function public.set_order_status is
  'Transitions an order through the COD lifecycle, enforcing legal moves and returning stock exactly once on cancellation or failed delivery.';


-- -----------------------------------------------------------------------------
--  record_delivery_attempt
--
--  The courier went, and nobody answered / the customer had no cash / they
--  refused at the door. This records the attempt WITHOUT ending the order, so
--  the courier can try again tomorrow.
--
--  This is the part people get wrong: if a failed attempt immediately moved the
--  order to 'failed_delivery', it would restock the goods, and a second attempt
--  would be delivering items the system already put back on sale. Attempts and
--  outcomes are different things.
--
--  When you finally give up, call set_order_status(..., 'failed_delivery').
-- -----------------------------------------------------------------------------
create or replace function public.record_delivery_attempt(
  p_order_id uuid,
  p_note     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
begin
  select id, status, delivery_attempts
    into v_order
    from public.orders
   where id = p_order_id
   for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND: no order with id %', p_order_id;
  end if;

  -- You cannot attempt a delivery for an order that never left the building.
  if v_order.status <> 'shipped' then
    raise exception 'INVALID_TRANSITION: delivery attempts can only be recorded for a shipped order (this one is "%")', v_order.status;
  end if;

  update public.orders
     set delivery_attempts = delivery_attempts + 1,
         last_attempt_at   = now(),
         admin_notes       = coalesce(admin_notes || E'\n', '') ||
                             'Attempt ' || (v_order.delivery_attempts + 1) || ': ' ||
                             coalesce(p_note, 'delivery failed')
   where id = p_order_id;

  return (select to_jsonb(o) from public.orders o where o.id = p_order_id);
end;
$$;

comment on function public.record_delivery_attempt is
  'Logs a failed delivery attempt without ending the order, so the courier can retry.';


-- -----------------------------------------------------------------------------
--  check_stock_availability
--
--  A read-only pre-flight check. The React cart page calls this (through the
--  API) before showing the checkout button, so customers find out about an
--  out-of-stock item BEFORE they fill in their address, not after.
--
--  This is advisory only — create_order re-checks under a lock. Never rely on
--  a pre-flight check alone for correctness.
-- -----------------------------------------------------------------------------
create or replace function public.check_stock_availability(p_items jsonb)
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

    select id, name, stock_quantity, is_active, base_price, sale_price
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
    elsif v_product.stock_quantity < v_qty then
      v_all_ok := false;
      v_results := v_results || jsonb_build_object(
        'product_id', v_product.id, 'product_name', v_product.name,
        'available',  false, 'reason', 'insufficient_stock',
        'requested',  v_qty, 'in_stock', v_product.stock_quantity
      );
    else
      v_results := v_results || jsonb_build_object(
        'product_id',  v_product.id, 'product_name', v_product.name,
        'available',   true, 'requested', v_qty,
        'in_stock',    v_product.stock_quantity,
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

comment on function public.check_stock_availability is
  'Advisory pre-checkout stock check. create_order still re-verifies under a lock.';
