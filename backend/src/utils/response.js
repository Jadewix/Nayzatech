/**
 * Response envelope helpers.
 *
 * Every single endpoint answers in one of two shapes, with no exceptions:
 *
 *   success  { "success": true,  "data": ... , "meta": {...}? }
 *   failure  { "success": false, "error": { "code", "message", "details"? } }
 *
 * The payoff is on the React side: one fetch wrapper can check `success` and
 * you never write per-endpoint parsing code or guess where the error text is.
 */

/**
 * Send a successful response.
 *
 * @param {import('express').Response} res
 * @param {*} data                 The payload
 * @param {object} [options]
 * @param {number} [options.status=200]
 * @param {object} [options.meta]  Pagination or other envelope-level info
 */
export function sendSuccess(res, data, { status = 200, meta } = {}) {
  const body = { success: true, data };
  if (meta) body.meta = meta;
  return res.status(status).json(body);
}

/**
 * Send a failure response. Normally you should `throw new ApiError(...)` and
 * let the central error handler call this — it is exported mainly for that
 * handler and for middleware that runs before the route.
 */
export function sendError(res, { status = 500, message, code = 'ERROR', details }) {
  const body = { success: false, error: { code, message } };
  if (details !== undefined) body.error.details = details;
  return res.status(status).json(body);
}

/**
 * Build the `meta` block for a paginated list.
 *
 * @param {object} args
 * @param {number} args.total  Total matching rows (before pagination)
 * @param {number} args.page   Current page, 1-indexed
 * @param {number} args.limit  Rows per page
 */
export function buildPagination({ total, page, limit }) {
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
  return {
    pagination: {
      total,
      page,
      limit,
      total_pages: totalPages,
      has_next: page < totalPages,
      has_previous: page > 1,
    },
  };
}

export default { sendSuccess, sendError, buildPagination };
