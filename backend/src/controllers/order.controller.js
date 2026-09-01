/**
 * Order endpoints — checkout, lookup, and admin management.
 *
 * THE CRITICAL PIECE IS createOrder.
 *
 * Everything about stock safety comes down to one decision: the check-and-
 * deduct happens inside a single PostgreSQL transaction (the create_order
 * function in db/02_functions.sql), not in JavaScript.
 *
 * If you did it here in Node instead — read stock, check it, then write —
 * two customers checking out at the same instant would both read "1 available",
 * both pass the check, and both deduct. You would sell a laptop you do not
 * have. Postgres row locks close that window; JavaScript cannot.
 *
 * So this controller's job is small on purpose: validate, call the function,
 * send the email. The dangerous work happens where it is safe.
 */

import { supabase } from '../config/supabase.js';
import { ApiError } from '../utils/ApiError.js';
import { sendSuccess, buildPagination } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendOrderConfirmation, sendOrderStatusUpdate } from '../services/email.service.js';

/**
 * Merge duplicate line items.
 *
 * A React cart can easily send the same product twice ("add to cart" pressed
 * on the product page and again in a recommendation strip). Two separate rows
 * for the same product would each deduct stock and look wrong on the receipt,
 * so collapse them into one line with the summed quantity.
 */
function consolidateItems(items) {
  const merged = new Map();
  for (const item of items) {
    const existing = merged.get(item.product_id);
    merged.set(item.product_id, {
      product_id: item.product_id,
      quantity: (existing?.quantity || 0) + item.quantity,
    });
  }
  return [...merged.values()];
}

/**
 * POST /api/orders    (public — this is checkout)
 *
 * Body:
 * {
 *   "customer_name": "Jad Khoury",
 *   "customer_email": "jad@example.com",
 *   "customer_phone": "+961 70 000 000",
 *   "shipping_address": {
 *     "line1": "12 Rue Gouraud", "city": "Beirut",
 *     "postal_code": "2033", "country": "Lebanon"
 *   },
 *   "notes": "Leave with the concierge",
 *   "items": [{ "product_id": "uuid", "quantity": 2 }]
 * }
 *
 * Notice the body carries NO prices and NO total. Those are read from the
 * database inside create_order. If the client could send a price, someone
 * would edit it in devtools and buy a laptop for one dollar.
 */
export const createOrder = asyncHandler(async (req, res) => {
  const {
    customer_name, customer_email, customer_phone,
    shipping_address, notes, items,
  } = req.body;

  const consolidated = consolidateItems(items);

  // One atomic call: locks each product row, verifies stock, deducts it,
  // writes the order, its items and the inventory audit trail. If any single
  // item is short, the whole thing rolls back and no partial order survives.
  const { data: order, error } = await supabase.rpc('create_order', {
    p_customer_name: customer_name,
    p_customer_email: customer_email,
    p_customer_phone: customer_phone || null,
    p_shipping_address: shipping_address,
    p_notes: notes || null,
    p_items: consolidated,
  });

  // Errors raised by the SQL function arrive as 'INSUFFICIENT_STOCK: ...'.
  // The central error handler turns that prefix into a proper 409 with a
  // readable message, so the React checkout can show it directly.
  if (error) throw error;

  /**
   * The order is now safely committed. The confirmation email is a side effect
   * that must NOT be allowed to fail the request.
   *
   * If Brevo is down and we awaited-and-threw here, the customer would see an
   * error, hit checkout again, and place a duplicate order — double-charging
   * them and double-deducting stock. So: fire it, log the outcome, respond
   * regardless.
   */
  const emailResult = await sendOrderConfirmation(order).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[ORDER] Confirmation email failed:', err.message);
    return { sent: false, error: err.message };
  });

  return sendSuccess(
    res,
    {
      ...order,
      // Tells the frontend whether to show "check your inbox" or
      // "save your order number".
      confirmation_email_sent: emailResult?.sent === true,
    },
    { status: 201 }
  );
});

/**
 * POST /api/orders/check-stock    (public)
 *
 * Pre-flight check for the cart page, so a customer finds out about an
 * out-of-stock item BEFORE filling in their address rather than after.
 *
 * Advisory only. createOrder re-checks under a lock, because stock can change
 * between this call and checkout. Never treat this as a reservation.
 */
export const checkStock = asyncHandler(async (req, res) => {
  const { items } = req.body;

  const { data, error } = await supabase.rpc('check_stock_availability', {
    p_items: consolidateItems(items),
  });
  if (error) throw error;

  return sendSuccess(res, data);
});

/**
 * GET /api/orders/:id    (public, but effectively private)
 *
 * The order id is a v4 UUID — unguessable, so it doubles as a capability
 * token. That is the same pattern parcel-tracking links use: anyone with the
 * link can view, nobody can enumerate.
 *
 * `admin_notes` is stripped for non-admins; internal remarks are not for
 * customers.
 */
export const getOrder = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const { data: order, error } = await supabase
    .from('orders')
    .select('*, items:order_items(*)')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  if (!order) throw ApiError.notFound('Order not found', 'ORDER_NOT_FOUND');

  if (!req.isAdmin) delete order.admin_notes;

  return sendSuccess(res, order);
});

/**
 * GET /api/orders/lookup?order_number=TS-20260824-00042&email=jad@example.com
 *
 * "Where is my order?" without an account. BOTH the order number and the
 * matching email are required — the order number alone is sequential and
 * therefore guessable, so requiring the email stops someone reading a
 * stranger's address by counting upwards.
 */
export const lookupOrder = asyncHandler(async (req, res) => {
  const { order_number: orderNumber, email } = req.query;

  if (!orderNumber || !email) {
    throw ApiError.badRequest(
      'Both order_number and email are required to look up an order',
      'MISSING_LOOKUP_FIELDS'
    );
  }

  const { data: order, error } = await supabase
    .from('orders')
    .select('*, items:order_items(*)')
    .eq('order_number', orderNumber)
    .eq('customer_email', String(email).toLowerCase())
    .maybeSingle();

  if (error) throw error;
  // Deliberately vague: do not reveal whether the order number exists but the
  // email was wrong — that is an oracle for guessing customer addresses.
  if (!order) {
    throw ApiError.notFound(
      'We could not find an order with that number and email address',
      'ORDER_NOT_FOUND'
    );
  }

  delete order.admin_notes;
  return sendSuccess(res, order);
});

/* =========================================================================
 *  ADMIN
 * ====================================================================== */

/**
 * GET /api/admin/orders    (admin)
 * Filter by status, email, date range; search by order number or customer name.
 */
export const listOrders = asyncHandler(async (req, res) => {
  const { page, limit, status, email, search, from_date, to_date, sort } = req.query;

  let query = supabase
    .from('orders')
    .select('*, items:order_items(*)', { count: 'exact' });

  if (status) query = query.eq('status', status);
  if (email) query = query.eq('customer_email', email);
  if (from_date) query = query.gte('created_at', from_date);
  if (to_date) query = query.lte('created_at', to_date);

  if (search) {
    const term = search.replace(/[%,()]/g, ' ').trim();
    if (term) {
      query = query.or(`order_number.ilike.%${term}%,customer_name.ilike.%${term}%,customer_email.ilike.%${term}%`);
    }
  }

  const sortMap = {
    newest:     { column: 'created_at',   ascending: false },
    oldest:     { column: 'created_at',   ascending: true  },
    total_desc: { column: 'total_amount', ascending: false },
    total_asc:  { column: 'total_amount', ascending: true  },
  };
  const { column, ascending } = sortMap[sort] || sortMap.newest;
  query = query.order(column, { ascending });

  const from = (page - 1) * limit;
  query = query.range(from, from + limit - 1);

  const { data, error, count } = await query;
  if (error) throw error;

  return sendSuccess(res, data, {
    meta: buildPagination({ total: count ?? 0, page, limit }),
  });
});

/**
 * PATCH /api/admin/orders/:id/status    (admin)
 * Body: { "status": "shipped", "note": "DHL 1234567890", "notify_customer": true }
 *
 * Cancelling returns every item to stock — exactly once, guarded by the
 * stock_restored flag in the database so a double-cancel cannot inflate
 * inventory.
 */
export const updateOrderStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, note, notify_customer: notifyCustomer } = req.body;

  const { data: existing } = await supabase
    .from('orders').select('id, status').eq('id', id).maybeSingle();
  if (!existing) throw ApiError.notFound('Order not found', 'ORDER_NOT_FOUND');

  const previousStatus = existing.status;

  // The SQL function owns the rules: which transitions are legal, returning
  // stock exactly once on 'cancelled' and 'failed_delivery', and rejecting a
  // no-op. Duplicating those checks here would mean two places to keep in sync.
  const { data: updated, error } = await supabase.rpc('set_order_status', {
    p_order_id: id,
    p_status: status,
    p_note: note || null,
  });
  if (error) throw error;

  let emailResult = { sent: false, skipped: true };
  if (notifyCustomer) {
    emailResult = await sendOrderStatusUpdate(updated, previousStatus).catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[ORDER] Status email failed:', err.message);
      return { sent: false, error: err.message };
    });
  }

  return sendSuccess(res, {
    ...updated,
    previous_status: previousStatus,
    notification_sent: emailResult?.sent === true,
  });
});

/**
 * PATCH /api/admin/orders/:id    (admin)
 * Edit fulfilment details — corrected phone number, address, internal notes.
 * Status changes go through the endpoint above, so stock logic is never bypassed.
 */
export const updateOrder = asyncHandler(async (req, res) => {
  const { id } = req.params;
  // No payment fields: this store is cash on delivery, so the site never
  // records money. 'delivered' means the courier collected the cash.
  const allowed = ['admin_notes', 'customer_phone', 'shipping_address', 'notes'];

  // Whitelist, not blacklist. Copying req.body wholesale would let an admin
  // (or a bug) overwrite total_amount or status and skip the stock rules.
  const payload = {};
  for (const field of allowed) {
    if (req.body[field] !== undefined) payload[field] = req.body[field];
  }

  if (Object.keys(payload).length === 0) {
    throw ApiError.badRequest(`Send at least one of: ${allowed.join(', ')}`, 'EMPTY_UPDATE');
  }

  const { data, error } = await supabase
    .from('orders').update(payload).eq('id', id).select('*, items:order_items(*)').single();
  if (error) throw error;

  return sendSuccess(res, data);
});

/**
 * GET /api/admin/orders/stats    (admin)
 * Headline numbers for the dashboard.
 */
export const getOrderStats = asyncHandler(async (req, res) => {
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const [allOrders, recentOrders, unreadContacts] = await Promise.all([
    supabase.from('orders').select('status, total_amount'),
    supabase.from('orders').select('total_amount, created_at, status').gte('created_at', since.toISOString()),
    supabase.from('contact_submissions').select('id', { count: 'exact', head: true }).eq('is_read', false),
  ]);

  if (allOrders.error) throw allOrders.error;

  const byStatus = {};
  let lifetimeRevenue = 0;

  /**
   * Revenue counts DELIVERED orders only.
   *
   * With cash on delivery this is stricter than it sounds. A prepaid store can
   * count an order as revenue the moment it is paid. Here, money only exists
   * once the courier hands it over — an order that is placed, confirmed, packed
   * and shipped has still earned you nothing if the customer refuses it at the
   * door. Counting anything earlier would inflate your figures with cash you
   * may never see.
   */
  let failedDeliveries = 0;
  for (const order of allOrders.data) {
    byStatus[order.status] = (byStatus[order.status] || 0) + 1;
    if (order.status === 'delivered') lifetimeRevenue += Number(order.total_amount);
    if (order.status === 'failed_delivery') failedDeliveries += 1;
  }

  const revenue30d = (recentOrders.data || [])
    .filter((order) => order.status === 'delivered')
    .reduce((sum, order) => sum + Number(order.total_amount), 0);

  const shippedOrDelivered = (byStatus.delivered || 0) + failedDeliveries;

  return sendSuccess(res, {
    total_orders: allOrders.data.length,
    orders_by_status: byStatus,
    awaiting_confirmation: byStatus.pending || 0,
    // Collected cash only — see the note above.
    lifetime_revenue: Number(lifetimeRevenue.toFixed(2)),
    revenue_last_30_days: Number(revenue30d.toFixed(2)),
    orders_last_30_days: (recentOrders.data || []).length,
    /**
     * The number that matters most in a COD store. Every failed delivery is a
     * courier trip you paid for and goods that came back. If this climbs above
     * roughly 10%, the usual cause is orders being dispatched without a
     * confirmation call.
     */
    failed_deliveries: failedDeliveries,
    failed_delivery_rate: shippedOrDelivered > 0
      ? Number(((failedDeliveries / shippedOrDelivered) * 100).toFixed(1))
      : 0,
    unread_contact_messages: unreadContacts.count || 0,
  });
});

/**
 * POST /api/admin/orders/:id/delivery-attempt    (admin)
 * Body: { "note": "nobody home, trying again tomorrow" }
 *
 * The courier went and came back with the goods. This logs the attempt but
 * leaves the order 'shipped' so it can be retried.
 *
 * Note what it does NOT do: restock. The order is still live and those items
 * are still spoken for. Only giving up — setting the status to
 * 'failed_delivery' — returns them to the shelf. Conflating the two would put
 * stock back on sale while a courier is still carrying it.
 */
export const recordDeliveryAttempt = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { note } = req.body;

  const { data, error } = await supabase.rpc('record_delivery_attempt', {
    p_order_id: id,
    p_note: note || null,
  });
  if (error) throw error;

  return sendSuccess(res, {
    ...data,
    hint:
      data.delivery_attempts >= 3
        ? 'Three attempts made. Consider marking this failed_delivery to return the stock.'
        : undefined,
  });
});

/**
 * GET /api/admin/orders/pending-confirmation    (admin)
 *
 * Your daily work queue. With cash on delivery there is no payment proving an
 * order is real, so every new order needs a human to phone the customer before
 * anything gets packed. These are the ones waiting on that call.
 */
export const listPendingConfirmation = asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('orders')
    .select('*, items:order_items(*)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })   // oldest first — longest wait
    .limit(100);

  if (error) throw error;

  const now = Date.now();
  return sendSuccess(res, {
    count: data.length,
    orders: data.map((order) => ({
      ...order,
      // Surfaces the ones that have been sitting too long.
      hours_waiting: Math.floor((now - new Date(order.created_at).getTime()) / 3_600_000),
    })),
  });
});

export default {
  createOrder, checkStock, getOrder, lookupOrder,
  listOrders, updateOrderStatus, updateOrder, getOrderStats,
  recordDeliveryAttempt, listPendingConfirmation,
};
