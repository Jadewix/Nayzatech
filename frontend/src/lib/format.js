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

/**
 * How long ago, in the shortest form that is still unambiguous.
 *
 * The admin queue is read at a glance — "3h" answers "is this urgent?" faster
 * than a timestamp does, because it saves the reader doing the subtraction.
 */
export function timeAgo(iso) {
  if (!iso) return '';
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (!Number.isFinite(seconds)) return '';
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
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
