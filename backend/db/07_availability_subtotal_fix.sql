-- =============================================================================
--  TECH STORE — 07_availability_subtotal_fix.sql
--  Run this AFTER 06_remove_inventory.sql. Safe to run more than once.
--
--  THE BUG
--  -------
--  check_availability returns two things: a per-line verdict, and the money
--  breakdown the cart displays. The verdict correctly marks a sold-out line
--  unavailable — but the subtotal underneath it was summing every ACTIVE
--  product in the basket, sold out or not.
--
--  So a cart holding one $1,699 laptop and one sold-out $159 drive showed
--  "Total $1,858" directly above a warning saying one of the items could not
--  be bought. The checkout button is disabled in that state, so nobody could
--  actually be charged it — but this is a shop where the whole point is that
--  the customer has the right cash ready at the door, and printing a number
--  they can never pay is the one thing it should not do.
--
--  THE FIX
--  -------
--  One clause: the subtotal counts only lines that can actually be sold, so
--  the figure on screen is always the figure an order would produce.
--
--  Everything else about the function is unchanged.
-- =============================================================================

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

  -- Only sellable lines count toward the money. `p.in_stock` is the clause
  -- this migration adds: without it the total included items the customer is
  -- being told they cannot have.
  select coalesce(sum(
           coalesce(p.sale_price, p.base_price) * (i->>'quantity')::int
         ), 0)
    into v_subtotal
    from jsonb_array_elements(p_items) i
    join public.products p on p.id = (i->>'product_id')::uuid
   where p.is_active
     and p.in_stock;

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
  'Pre-checkout check that every line can be sold, plus the database-priced money breakdown for the sellable lines.';


-- =============================================================================
--  VERIFY
--  A basket of one sellable item and one sold-out item should now report a
--  subtotal covering only the first, with all_available = false.
-- =============================================================================
