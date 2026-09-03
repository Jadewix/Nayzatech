/**
 * The admin panel's only route to the backend.
 *
 * Mirrors lib/api.js, with one difference: every call goes to /api/proxy/*
 * (this Next app) instead of straight to :5000. The proxy attaches the admin
 * key server-side — see app/api/proxy/[...path]/route.js.
 *
 * So there is no key in this file, and none in any component that imports it.
 */

import { ApiError } from './api';

async function request(path, { method = 'GET', body, isFormData = false } = {}) {
  const options = { method, cache: 'no-store' };

  if (body !== undefined) {
    if (isFormData) {
      // Do NOT set Content-Type for FormData — the browser must generate it
      // with the multipart boundary. Setting it by hand breaks the upload.
      options.body = body;
    } else {
      options.headers = { 'Content-Type': 'application/json' };
      options.body = JSON.stringify(body);
    }
  }

  let response;
  try {
    response = await fetch(`/api/proxy${path}`, options);
  } catch {
    throw new ApiError('Could not reach the server. Check your connection.', {
      code: 'NETWORK_ERROR',
    });
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError(`Unexpected response from the server (${response.status}).`, {
      code: 'BAD_RESPONSE',
      status: response.status,
    });
  }

  if (!response.ok || payload?.success === false) {
    const error = payload?.error || {};
    throw new ApiError(error.message || 'Something went wrong.', {
      code: error.code || 'ERROR',
      status: response.status,
      details: error.details,
    });
  }

  // Some callers need pagination from `meta`, so return both.
  return { data: payload.data, meta: payload.meta };
}

/* --- Session ------------------------------------------------------------ */

export async function signIn(key) {
  const response = await fetch('/api/admin-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    const error = payload?.error || {};
    throw new ApiError(error.message || 'Sign-in failed.', {
      code: error.code || 'ERROR',
      status: response.status,
    });
  }
  return true;
}

export function signOut() {
  return fetch('/api/admin-session', { method: 'DELETE' });
}

/* --- Products ----------------------------------------------------------- */

/**
 * The admin product list.
 *
 * Uses the public /products endpoint with include_inactive=true (the proxy
 * sends the admin key, so `detectAdmin` returns hidden products too). It
 * carries brand, category_name, image_url, is_active and in_stock in one call,
 * which is everything the list and its Active / Inactive tabs need.
 *
 * The catalogue is small, so we pull up to 100 in one request and split them
 * into active/inactive on the client — that keeps both counts accurate without
 * a second round trip.
 */
export function listProducts({ search, limit = 100 } = {}) {
  const query = new URLSearchParams({
    include_inactive: 'true',
    limit: String(limit),
    sort: 'name_asc',
  });
  if (search) query.set('search', search);
  return request(`/products?${query}`);
}

/** Full detail for the edit form. Reaches drafts because the proxy sends the key. */
export function getProduct(id) {
  return request(`/products/${id}`);
}

export function listCategories() {
  return request('/categories?include_inactive=true');
}

export function createProduct(fields) {
  return request('/admin/products', { method: 'POST', body: fields });
}

export function updateProduct(id, fields) {
  return request(`/admin/products/${id}`, { method: 'PATCH', body: fields });
}

/**
 * `archive` flips is_active to false and keeps the row and its order history.
 * `hard` really deletes it and removes its images from storage; past orders
 * keep their own snapshot of name/SKU/price, so receipts stay intact.
 */
export function deleteProduct(id, { hard = false } = {}) {
  return request(`/admin/products/${id}${hard ? '?hard=true' : ''}`, { method: 'DELETE' });
}

export function uploadProductImage(id, file) {
  const form = new FormData();
  form.append('image', file);
  return request(`/admin/products/${id}/image`, { method: 'POST', body: form, isFormData: true });
}

/* --- Availability ------------------------------------------------------- */

/**
 * Flip a product between orderable and sold out.
 *
 * There is no separate stock endpoint any more: availability is one boolean
 * column, so this is an ordinary product PATCH. Sold out keeps the product page
 * live and indexed with Add to cart disabled; to remove it from the storefront
 * entirely, set is_active instead.
 */
export function setInStock(id, inStock) {
  return updateProduct(id, { in_stock: inStock });
}

/* --- Categories --------------------------------------------------------- */

export function createCategory(fields) {
  return request('/admin/categories', { method: 'POST', body: fields });
}

export function updateCategory(id, fields) {
  return request(`/admin/categories/${id}`, { method: 'PATCH', body: fields });
}

/** Only succeeds on an empty category — the backend refuses if products reference it. */
export function deleteCategory(id) {
  return request(`/admin/categories/${id}`, { method: 'DELETE' });
}

/* --- Orders ------------------------------------------------------------- */

/** The daily queue: orders placed but not yet confirmed by phone. */
export function listPendingConfirmation() {
  return request('/admin/orders/pending-confirmation');
}

export function listOrders({ status, page = 1, limit = 20 } = {}) {
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (status) query.set('status', status);
  return request(`/admin/orders?${query}`);
}

export function getOrder(id) {
  return request(`/orders/${id}`);
}

/**
 * Move an order through the lifecycle.
 *
 * The database owns the rules. An illegal move comes back as a 409 whose
 * message names the transitions that ARE allowed, so the UI shows that rather
 * than duplicating the state machine.
 */
export function setOrderStatus(id, status, { note, notifyCustomer = true } = {}) {
  return request(`/admin/orders/${id}/status`, {
    method: 'PATCH',
    body: { status, note: note || undefined, notify_customer: notifyCustomer },
  });
}

/**
 * Log a courier visit that came back empty-handed.
 *
 * This is NOT the same as failing the delivery: it leaves the order 'shipped'
 * so tomorrow's round can try again. Closing it for good is
 * setOrderStatus(id, 'failed_delivery').
 */
export function recordDeliveryAttempt(id, note) {
  return request(`/admin/orders/${id}/delivery-attempt`, {
    method: 'POST',
    body: { note: note || undefined },
  });
}

/** Correct a phone number, address or internal note. Never status or money. */
export function updateOrder(id, fields) {
  return request(`/admin/orders/${id}`, { method: 'PATCH', body: fields });
}

/* --- Contact inbox ------------------------------------------------------ */

export function listMessages({ unreadOnly = false, page = 1, limit = 50 } = {}) {
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (unreadOnly) query.set('is_read', 'false');
  return request(`/admin/contact?${query}`);
}

/** Fetching one message marks it read on the backend. */
export function getMessage(id) {
  return request(`/admin/contact/${id}`);
}

/** Pass false to mark something unread again. */
export function setMessageRead(id, isRead = true) {
  return request(`/admin/contact/${id}/read`, { method: 'PATCH', body: { is_read: isRead } });
}

export function deleteMessage(id) {
  return request(`/admin/contact/${id}`, { method: 'DELETE' });
}

/* --- Dashboard ---------------------------------------------------------- */

export function getDashboard() {
  return request('/admin/dashboard');
}

export { ApiError };
