/**
 * Display helpers.
 *
 * The important one is money(). Prices arrive from Postgres as STRINGS
 * ("1699.00"), not numbers — that is deliberate on the backend's side, because
 * JavaScript floats cannot represent money exactly and 0.1 + 0.2 famously does
 * not equal 0.3. Always convert at the last moment, for display only, and never
 * do arithmetic on prices in the browser: let the server compute totals.
 */

export function money(amount, currency = 'USD') {
  const number = Number(amount) || 0;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(number);
  } catch {
    return `${currency} ${number.toFixed(2)}`;
  }
}

/** Turn a spec key into a readable label: "screen_size" -> "Screen size" */
export function specLabel(key) {
  return key
    .replace(/_/g, ' ')
    .replace(/\b(gb|mhz|hz|cpu|gpu|ram|tdp|psu|os|wh|mah|nand|tbw)\b/gi, (m) => m.toUpperCase())
    .replace(/^./, (c) => c.toUpperCase());
}

/** Render a spec value, which may be a string, number, boolean or array. */
export function specValue(value) {
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

export function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { dateStyle: 'long' });
}

/** Human label for an order status. */
export const STATUS_LABELS = {
  pending: 'Awaiting confirmation',
  confirmed: 'Confirmed',
  processing: 'Being packed',
  shipped: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  failed_delivery: 'Delivery failed',
};
