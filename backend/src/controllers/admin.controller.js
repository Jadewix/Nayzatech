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

/**
 * GET /api/admin/dashboard
 * One call for the admin home screen, so it does not fire six requests on load.
 */
export const getDashboard = asyncHandler(async (req, res) => {
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const [products, orders, contacts, soldOut, recentOrders, needsCall] = await Promise.all([
    supabase.from('products').select('id, is_active, in_stock'),
    supabase.from('orders').select('status, total_amount, created_at'),
    supabase.from('contact_submissions').select('id', { count: 'exact', head: true }).eq('is_read', false),
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
      sold_out: products.data.filter((p) => p.is_active && !p.in_stock).length,
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
    sold_out_products: soldOut.data || [],
    recent_orders: recentOrders.data || [],
    // Phone these people before anything gets packed.
    orders_needing_confirmation: needsCall.data || [],
  });
});

export default { getDashboard };
