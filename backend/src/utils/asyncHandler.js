/**
 * Wraps an async route handler so rejected promises reach Express's error
 * handler instead of vanishing.
 *
 * Express 4 does not catch async errors. Without this wrapper, an awaited call
 * that throws leaves the request hanging until it times out — no response, no
 * log, nothing. Rather than putting try/catch in every controller, wrap once:
 *
 *   router.get('/:id', asyncHandler(async (req, res) => {
 *     const product = await getProduct(req.params.id);   // may throw
 *     sendSuccess(res, product);
 *   }));
 *
 * @param {Function} fn  An async (req, res, next) handler
 * @returns {Function}   A handler that forwards rejections to next()
 */
export function asyncHandler(fn) {
  return function wrappedHandler(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export default asyncHandler;
