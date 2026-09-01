/**
 * Request validation using zod.
 *
 * NEVER trust what arrives from the browser. Anyone can open devtools and POST
 * whatever they like to your API — a negative quantity, a price of 0.01, a
 * 10MB string in the name field. Validation is the boundary where untrusted
 * input becomes data you can safely act on.
 *
 * Usage:
 *   router.post('/', validate({ body: createProductSchema }), controller.create);
 *
 * On failure, the ZodError propagates to the central error handler and becomes
 * a 422 with a per-field breakdown the React form can display inline.
 */

import { ApiError } from '../utils/ApiError.js';

/**
 * @param {{ body?: import('zod').ZodTypeAny,
 *           query?: import('zod').ZodTypeAny,
 *           params?: import('zod').ZodTypeAny }} schemas
 */
export function validate(schemas) {
  return function validationMiddleware(req, res, next) {
    try {
      // Assign the PARSED result back, not the raw input. Zod coerces types
      // ("12" -> 12), strips unknown keys, and applies defaults — so the
      // controller receives clean, typed data rather than raw strings.
      if (schemas.params) req.params = schemas.params.parse(req.params);
      if (schemas.query) {
        // Express 5 makes req.query a getter-only property, so replace it via
        // defineProperty rather than plain assignment. Works on Express 4 too.
        const parsedQuery = schemas.query.parse(req.query);
        Object.defineProperty(req, 'query', {
          value: parsedQuery,
          writable: true,
          configurable: true,
          enumerable: true,
        });
      }
      if (schemas.body) req.body = schemas.body.parse(req.body ?? {});
      return next();
    } catch (err) {
      return next(err); // ZodError -> handled centrally as a 422
    }
  };
}

/**
 * Reject a request whose body is empty.
 * Useful on PATCH routes, where an empty body means "nothing to update" and
 * would otherwise produce a confusing success response that changed nothing.
 */
export function requireNonEmptyBody(req, res, next) {
  if (!req.body || Object.keys(req.body).length === 0) {
    return next(ApiError.badRequest('Send at least one field to update.', 'EMPTY_UPDATE'));
  }
  return next();
}

export default { validate, requireNonEmptyBody };
