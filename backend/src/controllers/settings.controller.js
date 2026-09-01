/**
 * Store settings — the delivery fee and the checkout kill switch.
 *
 * These live in the database rather than in .env for one practical reason: you
 * can change them from the admin panel and the next order picks them up
 * immediately. An environment variable would mean editing a file and
 * restarting the server — on a hosting platform, a full redeploy — every time
 * you adjust what you charge for delivery.
 */

import { supabase } from '../config/supabase.js';
import { ApiError } from '../utils/ApiError.js';
import { sendSuccess } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import config from '../config/env.js';

/** Read all settings into a plain object: { delivery_fee: 5, currency: 'USD' } */
async function readSettings() {
  const { data, error } = await supabase.from('store_settings').select('key, value, description');
  if (error) throw error;

  const settings = {};
  const descriptions = {};
  for (const row of data) {
    settings[row.key] = row.value;
    descriptions[row.key] = row.description;
  }
  return { settings, descriptions };
}

/**
 * GET /api/store-info    (public)
 *
 * What the React cart needs before checkout: the delivery charge, whether the
 * order qualifies for free delivery, and whether you are accepting orders at
 * all. Call it with ?subtotal=129 to get the exact fee for a given basket.
 *
 * Deliberately exposes only what a shopper may see — no admin settings leak.
 */
export const getStoreInfo = asyncHandler(async (req, res) => {
  const { settings } = await readSettings();

  const deliveryFee = Number(settings.delivery_fee ?? 0);
  const threshold = Number(settings.free_delivery_threshold ?? 0);
  const subtotal = Number(req.query.subtotal ?? 0);

  // Mirrors the get_delivery_fee() logic in SQL. This is display only — the
  // authoritative fee is calculated inside the checkout transaction, so a
  // tampered cart cannot pay less.
  const qualifiesForFree = threshold > 0 && subtotal >= threshold;
  const applicableFee = qualifiesForFree ? 0 : deliveryFee;

  return sendSuccess(res, {
    store_name: config.store.name,
    payment_method: 'cash_on_delivery',
    payment_note: 'Pay the courier in cash when your order arrives.',
    currency: settings.currency ?? 'USD',
    accepting_orders: settings.cod_enabled !== false,
    delivery: {
      fee: deliveryFee,
      free_delivery_threshold: threshold > 0 ? threshold : null,
      // Only meaningful when the client sent a subtotal.
      applicable_fee: applicableFee,
      qualifies_for_free_delivery: qualifiesForFree,
      amount_to_free_delivery:
        threshold > 0 && !qualifiesForFree ? Number((threshold - subtotal).toFixed(2)) : 0,
    },
  });
});

/**
 * GET /api/admin/settings    (admin)
 * Everything, with the description of what each key does.
 */
export const getSettings = asyncHandler(async (req, res) => {
  const { settings, descriptions } = await readSettings();
  return sendSuccess(res, { settings, descriptions });
});

/**
 * PATCH /api/admin/settings    (admin)
 *
 * Body: { "delivery_fee": 5, "free_delivery_threshold": 500 }
 *
 * Changing the fee affects NEW orders only. Existing orders keep the fee they
 * were quoted, because the amount was snapshotted onto the order at checkout —
 * a customer who was told to have $134 ready must not find the courier asking
 * for $137 because you raised the charge in the meantime.
 */
export const updateSettings = asyncHandler(async (req, res) => {
  const updates = Object.entries(req.body);

  const results = await Promise.all(
    updates.map(([key, value]) =>
      supabase
        .from('store_settings')
        // The column is jsonb, so a number stores as 5, a string as "USD".
        .update({ value })
        .eq('key', key)
        .select('key, value')
        .maybeSingle()
    )
  );

  const failed = results.filter((r) => r.error);
  if (failed.length > 0) throw failed[0].error;

  const unknown = results.filter((r) => !r.data).length;
  if (unknown === results.length) {
    throw ApiError.badRequest('None of those settings exist', 'UNKNOWN_SETTING');
  }

  const { settings } = await readSettings();
  return sendSuccess(res, {
    settings,
    note: 'Applies to new orders only. Existing orders keep the fee they were quoted.',
  });
});

export default { getStoreInfo, getSettings, updateSettings };
