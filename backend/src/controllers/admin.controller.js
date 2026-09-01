/**
 * Admin inventory endpoints.
 *
 * All stock writes go through the adjust_stock database function rather than a
 * plain UPDATE. Two reasons:
 *
 *   1. Atomicity. 'delta' mode does the read-modify-write inside one
 *      transaction, so two simultaneous restocks both land instead of one
 *      silently overwriting the other.
 *   2. Auditing. The function writes an inventory_movements row every time, so
 *      the audit trail can never be forgotten by a caller in a hurry.
 */

import { supabase } from '../config/supabase.js';
import { ApiError } from '../utils/ApiError.js';
import { sendSuccess, buildPagination } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * PATCH /api/admin/products/:id/stock
 *
 * Body: { "mode": "set" | "delta", "value": 25, "reason": "restock", "note": "..." }
 *
 * WHICH MODE TO USE
 *   set   — "there are exactly 25 on the shelf". Use after a physical count.
 *   delta — "20 more just arrived" (+20), or "one was damaged" (-1).
 *
 * Prefer delta for routine changes. If two people restock at once, two deltas
 * both apply correctly; two 'set' calls means whoever saves last wins and the
 * other person's count vanishes.
 */
export const updateStock = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { mode, value, reason, note } = req.body;

  const { data, error } = await supabase.rpc('adjust_stock', {
    p_product_id: id,
    p_mode: mode,
    p_value: value,
    p_reason: reason,
    p_note: note || null,
  });

  // PRODUCT_NOT_FOUND / INSUFFICIENT_STOCK prefixes are mapped to 404/409 by
  // the central error handler.
  if (error) throw error;

  return sendSuccess(res, data);
});

/**
 * PATCH /api/admin/stock/bulk
 *
 * Body: { "updates": [{ "product_id": "...", "mode": "delta", "value": 20 }, ...] }
 *
 * For processing a whole delivery at once. Each update is independent: one
 * failure does not roll back the rest, and the response reports exactly which
 * ones succeeded — so you can fix the bad rows and resend only those.
 */
export const bulkUpdateStock = asyncHandler(async (req, res) => {
  const { updates } = req.body;

  const results = await Promise.allSettled(
    updates.map((update) =>
      supabase.rpc('adjust_stock', {
        p_product_id: update.product_id,
        p_mode: update.mode,
        p_value: update.value,
        p_reason: update.reason,
        p_note: update.note || null,
      })
    )
  );

  const succeeded = [];
  const failed = [];

  results.forEach((result, index) => {
    const source = updates[index];
    if (result.status === 'fulfilled' && !result.value.error) {
      succeeded.push(result.value.data);
    } else {
      const message = result.status === 'rejected'
        ? result.reason?.message
        : result.value.error?.message;
      failed.push({
        product_id: source.product_id,
        // Strip our SQL error prefix for a cleaner message in the UI.
        error: String(message || 'Unknown error').replace(/^[A-Z_]+:\s*/, ''),
      });
    }
  });

  // 207 Multi-Status is the honest code when some items worked and some did not.
  return sendSuccess(
    res,
    { updated: succeeded, failed, total: updates.length, success_count: succeeded.length },
    { status: failed.length > 0 ? 207 : 200 }
  );
});

/**
 * GET /api/admin/stock
 *
 * The inventory overview. ?low_stock_only=true is the one you will actually
 * use day to day — it answers "what do I need to reorder?".
 */
export const listStock = asyncHandler(async (req, res) => {
  const { page, limit, low_stock_only: lowStockOnly, out_of_stock_only: outOfStockOnly, category, search } = req.query;

  let query = supabase
    .from('products_with_category')
    .select('id, name, sku, brand, category_name, stock_quantity, low_stock_threshold, base_price, sale_price, is_active, image_url, is_low_stock, in_stock', { count: 'exact' })
    .order('stock_quantity', { ascending: true });   // scarcest first

  if (outOfStockOnly) {
    query = query.eq('stock_quantity', 0);
  } else if (lowStockOnly) {
    query = query.eq('is_low_stock', true);
  }

  if (category) query = query.eq('category_slug', category);

  if (search) {
    const term = search.replace(/[%,()]/g, ' ').trim();
    if (term) query = query.or(`name.ilike.%${term}%,sku.ilike.%${term}%`);
  }

  const from = (page - 1) * limit;
  query = query.range(from, from + limit - 1);

  const { data, error, count } = await query;
  if (error) throw error;

  return sendSuccess(res, data, {
    meta: buildPagination({ total: count ?? 0, page, limit }),
  });
});

/**
 * GET /api/admin/products/:id/stock-history
 *
 * The audit trail for one product. When the count looks wrong, this tells you
 * exactly what changed it and when.
 */
export const getStockHistory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { page, limit } = req.query;

  const { data: product } = await supabase
    .from('products').select('id, name, sku, stock_quantity').eq('id', id).maybeSingle();
  if (!product) throw ApiError.notFound('Product not found', 'PRODUCT_NOT_FOUND');

  const from = (page - 1) * limit;

  const { data, error, count } = await supabase
    .from('inventory_movements')
    .select('*, order:orders(order_number, customer_name)', { count: 'exact' })
    .eq('product_id', id)
    .order('created_at', { ascending: false })
    .range(from, from + limit - 1);

  if (error) throw error;

  return sendSuccess(res, { product, movements: data }, {
    meta: buildPagination({ total: count ?? 0, page, limit }),
  });
});

/**
 * GET /api/admin/dashboard
 * One call for the admin home screen, so it does not fire six requests on load.
 */
export const getDashboard = asyncHandler(async (req, res) => {
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const [products, orders, contacts, lowStock, recentOrders, needsCall] = await Promise.all([
    supabase.from('products').select('id, stock_quantity, is_active'),
    supabase.from('orders').select('status, total_amount, created_at'),
    supabase.from('contact_submissions').select('id', { count: 'exact', head: true }).eq('is_read', false),
    supabase.from('products_with_category')
      .select('id, name, sku, stock_quantity, low_stock_threshold, image_url')
      .eq('is_low_stock', true).eq('is_active', true)
      .order('stock_quantity', { ascending: true }).limit(10),
    supabase.from('orders')
      .select('id, order_number, customer_name, total_amount, status, created_at')
      .order('created_at', { ascending: false }).limit(10),
    supabase.from('orders')
      .select('id, order_number, customer_name, customer_phone, total_amount, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true }).limit(10),
  ]);

  if (products.error) throw products.error;
  if (orders.error) throw orders.error;

  const ordersByStatus = {};
  let lifetimeRevenue = 0;
  let revenue30d = 0;
  const cutoff = since.toISOString();

  // Revenue = DELIVERED orders only. With cash on delivery the money does not
  // exist until the courier hands it over, so anything earlier in the pipeline
  // is a hope, not a sale.
  let failedDeliveries = 0;
  for (const order of orders.data) {
    ordersByStatus[order.status] = (ordersByStatus[order.status] || 0) + 1;
    if (order.status === 'failed_delivery') failedDeliveries += 1;
    if (order.status === 'delivered') {
      const amount = Number(order.total_amount);
      lifetimeRevenue += amount;
      if (order.created_at >= cutoff) revenue30d += amount;
    }
  }

  return sendSuccess(res, {
    products: {
      total: products.data.length,
      active: products.data.filter((p) => p.is_active).length,
      out_of_stock: products.data.filter((p) => p.stock_quantity === 0).length,
      total_units: products.data.reduce((sum, p) => sum + p.stock_quantity, 0),
    },
    orders: {
      total: orders.data.length,
      by_status: ordersByStatus,
      // The daily job: new orders needing a confirmation call before dispatch.
      awaiting_confirmation: ordersByStatus.pending || 0,
      out_for_delivery: ordersByStatus.shipped || 0,
      failed_deliveries: failedDeliveries,
    },
    revenue: {
      // Cash actually collected, not cash hoped for.
      lifetime: Number(lifetimeRevenue.toFixed(2)),
      last_30_days: Number(revenue30d.toFixed(2)),
      basis: 'delivered_orders_only',
    },
    unread_messages: contacts.count || 0,
    low_stock_products: lowStock.data || [],
    recent_orders: recentOrders.data || [],
    // Phone these people before anything gets packed.
    orders_needing_confirmation: needsCall.data || [],
  });
});

export default { updateStock, bulkUpdateStock, listStock, getStockHistory, getDashboard };
