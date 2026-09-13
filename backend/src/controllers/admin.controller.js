/**
 * Admin overview endpoint.
 *
 * This file used to hold the inventory endpoints — set stock, bulk-adjust
 * stock, list stock levels, read the movement history. The store no longer
 * counts units, so all of that is gone along with the adjust_stock function it
 * called. Availability is now a plain `in_stock` boolean on the product row,
 * edited through the ordinary PATCH /api/admin/products/:id.
 */

import { supabase } from '../config/supabase.js';
import { sendSuccess } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * GET /api/admin/dashboard
 * One call for the admin home screen, so it does not fire six requests on load.
 *
 * WHY THE COUNTERS ARE AN RPC AND THE LISTS ARE NOT
 * -------------------------------------------------
 * The counters used to be computed here, by selecting every order and every
 * product and looping over them in JavaScript. That cost grew with the size of
 * the shop, and — worse — PostgREST caps the rows it will return, so past that
 * cap the totals would have silently stopped counting the newest orders while
 * still looking like healthy numbers.
 *
 * get_dashboard_stats() (db/08_dashboard_stats.sql) does that arithmetic in
 * Postgres and returns nine numbers, so the cost no longer depends on volume.
 *
 * The three list queries below stay as they are: each already carries LIMIT 10,
 * so each returns ten rows whether the shop has sold a hundred orders or a
 * hundred thousand.
 */
export const getDashboard = asyncHandler(async (req, res) => {
  const [stats, soldOut, recentOrders, needsCall] = await Promise.all([
    supabase.rpc('get_dashboard_stats'),
    // Published but unbuyable: still on the storefront, still indexed, but
    // nobody can order it. Worth surfacing, because it is easy to forget.
    supabase.from('products_with_category')
      .select('id, name, sku, image_url')
      .eq('in_stock', false).eq('is_active', true)
      .order('name', { ascending: true }).limit(10),
    supabase.from('orders')
      .select('id, order_number, customer_name, total_amount, status, created_at')
      .order('created_at', { ascending: false }).limit(10),
    supabase.from('orders')
      .select('id, order_number, customer_name, customer_phone, total_amount, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true }).limit(10),
  ]);

  if (stats.error) {
    // The function ships as db/08_dashboard_stats.sql and there is no migration
    // tool, so the one way this fails on a working database is that the file was
    // never pasted into the SQL editor. Say so, rather than surfacing
    // PostgREST's "Could not find the function in the schema cache".
    if (stats.error.code === 'PGRST202' || stats.error.code === '42883') {
      throw ApiError.internal(
        'The dashboard statistics function is missing. Run backend/db/08_dashboard_stats.sql in the Supabase SQL editor.',
        'DASHBOARD_FUNCTION_MISSING'
      );
    }
    throw stats.error;
  }

  return sendSuccess(res, {
    ...stats.data,
    sold_out_products: soldOut.data || [],
    recent_orders: recentOrders.data || [],
    // Phone these people before anything gets packed.
    orders_needing_confirmation: needsCall.data || [],
  });
});

export default { getDashboard };
