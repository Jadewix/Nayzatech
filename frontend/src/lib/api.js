/**
 * The one place this app talks to the backend.
 *
 * Every endpoint answers in the same shape:
 *   success   { "success": true,  "data": ..., "meta": {...} }
 *   failure   { "success": false, "error": { "code", "message" } }
 *
 * So this wrapper unwraps it once: you get `data` back directly, or an
 * ApiError is thrown. No page ever writes `if (body.success)` or digs around
 * for where the error message lives.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

/**
 * An error carrying the backend's machine-readable code alongside the message.
 * The code is what you branch on; the message is what you show the customer.
 *
 * Codes worth knowing:
 *   INSUFFICIENT_STOCK   someone bought the last one while they were shopping
 *   VALIDATION_ERROR     bad form input; `details` maps field -> message
 *   CHECKOUT_CLOSED      the store paused ordering
 *   PRODUCT_NOT_FOUND    stale link
 */
export class ApiError extends Error {
  constructor(message, { code = 'ERROR', status = 500, details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/**
 * @param {string} path      e.g. '/api/products?limit=8'
 * @param {object} [options] standard fetch options, plus:
 * @param {number|false} [options.revalidate]  seconds to cache on the server.
 *        false disables caching (use for anything that must be live, like
 *        availability or an order).
 */
async function request(path, { revalidate, ...options } = {}) {
  const url = `${API_URL}${path}`;

  /**
   * Next.js caches server-side fetches by default, which would happily serve a
   * product page claiming an item is available an hour after it sold out.
   * Being explicit avoids that:
   *   revalidate: 60     re-fetch at most once a minute (catalogue pages)
   *   revalidate: false  never cache (availability, cart, checkout, orders)
   */
  const nextOptions =
    revalidate === false
      ? { cache: 'no-store' }
      : { next: { revalidate: revalidate ?? 60 } };

  let response;
  try {
    response = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...nextOptions,
      ...options,
    });
  } catch (err) {
    // fetch only rejects when the request never completed — server down, DNS
    // failure, no network. A 404 or 500 resolves normally and is handled below.
    throw new ApiError(
      `Cannot reach the store server at ${API_URL}. Is the backend running?`,
      { code: 'NETWORK_ERROR', status: 0 }
    );
  }

  let body;
  try {
    body = await response.json();
  } catch {
    throw new ApiError(`The server returned an unreadable response (HTTP ${response.status}).`, {
      code: 'INVALID_RESPONSE',
      status: response.status,
    });
  }

  if (!response.ok || body.success === false) {
    const error = body.error || {};
    throw new ApiError(error.message || `Request failed (HTTP ${response.status})`, {
      code: error.code || 'ERROR',
      status: response.status,
      details: error.details,
    });
  }

  // Pagination lives in meta, so attach it to the returned array rather than
  // making every caller handle a wrapper object.
  if (Array.isArray(body.data) && body.meta) {
    body.data.meta = body.meta;
  }
  return body.data;
}

/** Build a query string, dropping empty values so URLs stay clean. */
function query(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  }
  const string = search.toString();
  return string ? `?${string}` : '';
}

/* ---------------------------------------------------------------------------
 *  Catalogue
 * ------------------------------------------------------------------------ */

export function getProducts(params = {}) {
  return request(`/api/products${query(params)}`);
}

export function getProduct(idOrSlug) {
  return request(`/api/products/${encodeURIComponent(idOrSlug)}`);
}

/**
 * Live availability — never cached, or the page says "add to cart" for
 * something that was marked sold out five minutes ago.
 */
export function getProductAvailability(id) {
  return request(`/api/products/${id}/availability`, { revalidate: false });
}

export function getCategories(params = {}) {
  return request(`/api/categories${query(params)}`);
}

export function getCategory(idOrSlug) {
  return request(`/api/categories/${encodeURIComponent(idOrSlug)}`);
}

/* ---------------------------------------------------------------------------
 *  Store info — delivery fee, whether ordering is open
 * ------------------------------------------------------------------------ */

export function getStoreInfo(subtotal) {
  return request(`/api/store-info${query({ subtotal })}`, { revalidate: 30 });
}

/* ---------------------------------------------------------------------------
 *  Cart and checkout
 * ------------------------------------------------------------------------ */

/**
 * Pre-checkout availability check. It also returns the money breakdown priced
 * by the server, which is what the cart displays — the browser never adds the
 * total up itself.
 *
 * Advisory only: the backend checks again when the order is actually placed,
 * so treat a pass here as "probably fine", never as a reservation.
 */
export function checkAvailability(items) {
  return request('/api/orders/check-availability', {
    method: 'POST',
    body: JSON.stringify({ items }),
    revalidate: false,
  });
}

/**
 * Place the order.
 *
 * Note what you do NOT send: prices, delivery fee, or a total. The backend
 * reads all of those from the database inside the checkout transaction. If the
 * browser could send a price, anyone with devtools could buy a laptop for $1.
 */
export function createOrder(order) {
  return request('/api/orders', {
    method: 'POST',
    body: JSON.stringify(order),
    revalidate: false,
  });
}

export function getOrder(id) {
  return request(`/api/orders/${id}`, { revalidate: false });
}

export function lookupOrder(orderNumber, email) {
  return request(
    `/api/orders/lookup${query({ order_number: orderNumber, email })}`,
    { revalidate: false }
  );
}

/* ---------------------------------------------------------------------------
 *  Contact
 * ------------------------------------------------------------------------ */

export function submitContact(payload) {
  return request('/api/contact', {
    method: 'POST',
    body: JSON.stringify(payload),
    revalidate: false,
  });
}

export { API_URL };
