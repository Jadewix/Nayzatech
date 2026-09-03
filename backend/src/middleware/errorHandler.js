/**
 * Central error handling.
 *
 * Every error in the app funnels through here, which is what makes the failure
 * envelope consistent. Controllers just `throw` and move on.
 *
 * It also translates errors from lower layers into sensible HTTP statuses:
 *   - zod validation errors      -> 422 with per-field details
 *   - Postgres error codes       -> 409 for duplicates, 400 for constraints
 *   - our SQL functions' prefixes -> 409 PRODUCT_SOLD_OUT, 404 PRODUCT_NOT_FOUND
 *   - multer upload errors       -> 400 with a readable reason
 *   - anything else              -> 500, with the real cause logged, not sent
 */

import { ZodError } from 'zod';
import multer from 'multer';
import { ApiError } from '../utils/ApiError.js';
import { sendError } from '../utils/response.js';
import config from '../config/env.js';

/**
 * Our Postgres functions raise errors as 'CODE: human readable message'.
 * This maps that prefix onto the right HTTP status.
 */
const PG_FUNCTION_ERRORS = {
  PRODUCT_SOLD_OUT:    { status: 409, code: 'PRODUCT_SOLD_OUT' },
  PRODUCT_NOT_FOUND:   { status: 404, code: 'PRODUCT_NOT_FOUND' },
  PRODUCT_UNAVAILABLE: { status: 409, code: 'PRODUCT_UNAVAILABLE' },
  ORDER_NOT_FOUND:     { status: 404, code: 'ORDER_NOT_FOUND' },
  ORDER_EMPTY:         { status: 400, code: 'ORDER_EMPTY' },
  ORDER_TOO_LARGE:     { status: 400, code: 'ORDER_TOO_LARGE' },
  INVALID_QUANTITY:    { status: 400, code: 'INVALID_QUANTITY' },
  INVALID_TRANSITION:  { status: 409, code: 'INVALID_TRANSITION' },
  INVALID_PAYLOAD:     { status: 400, code: 'INVALID_PAYLOAD' },
};

/** Native Postgres SQLSTATE codes worth translating. */
const PG_SQLSTATE = {
  '23505': { status: 409, code: 'DUPLICATE_ENTRY',    message: 'That record already exists.' },
  '23503': { status: 400, code: 'INVALID_REFERENCE',  message: 'A referenced record does not exist.' },
  '23514': { status: 400, code: 'CONSTRAINT_VIOLATION', message: 'That value is not allowed.' },
  '23502': { status: 400, code: 'MISSING_FIELD',      message: 'A required field was missing.' },
  '22P02': { status: 400, code: 'INVALID_FORMAT',     message: 'A value was in the wrong format (check your IDs).' },
  '42501': { status: 403, code: 'DB_PERMISSION_DENIED', message: 'The database refused that operation.' },
  'PGRST116': { status: 404, code: 'NOT_FOUND',       message: 'Resource not found.' },
};

/**
 * Turn a Zod validation failure into a flat, frontend-friendly field map:
 *   { "customer_email": "Invalid email address", "items.0.quantity": "..." }
 */
function formatZodError(error) {
  const fieldErrors = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.') || '_root';
    if (!fieldErrors[path]) fieldErrors[path] = issue.message;
  }
  return fieldErrors;
}

/** Pull the 'CODE: message' prefix out of a Postgres function error. */
function parsePgFunctionError(message) {
  if (typeof message !== 'string') return null;
  const match = message.match(/^([A-Z_]+):\s*(.+)$/s);
  if (!match) return null;
  const mapped = PG_FUNCTION_ERRORS[match[1]];
  if (!mapped) return null;
  return { ...mapped, message: match[2].trim() };
}

/**
 * Express error middleware. The four-argument signature is required —
 * Express identifies error handlers by arity, so do not remove `next`.
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  // --- 1. Errors we raised on purpose -------------------------------------
  if (err instanceof ApiError) {
    return sendError(res, {
      status: err.statusCode,
      message: err.message,
      code: err.code,
      details: err.details,
    });
  }

  // --- 2. Request body failed validation ----------------------------------
  if (err instanceof ZodError) {
    return sendError(res, {
      status: 422,
      message: 'Some fields need fixing.',
      code: 'VALIDATION_ERROR',
      details: formatZodError(err),
    });
  }

  // --- 3. File upload problems --------------------------------------------
  if (err instanceof multer.MulterError) {
    const uploadMessages = {
      LIMIT_FILE_SIZE: `That file is too large. The maximum is ${
        Math.round(config.uploads.maxFileSizeBytes / (1024 * 1024))
      } MB.`,
      LIMIT_FILE_COUNT: 'Too many files in one upload.',
      LIMIT_UNEXPECTED_FILE: `Unexpected file field "${err.field}".`,
    };
    return sendError(res, {
      status: 400,
      message: uploadMessages[err.code] || 'That upload could not be processed.',
      code: `UPLOAD_${err.code}`,
    });
  }

  // --- 4. Errors bubbling up from Postgres / PostgREST --------------------
  const fromFunction = parsePgFunctionError(err.message);
  if (fromFunction) {
    return sendError(res, {
      status: fromFunction.status,
      message: fromFunction.message,
      code: fromFunction.code,
    });
  }

  if (err.code && PG_SQLSTATE[err.code]) {
    const mapped = PG_SQLSTATE[err.code];
    return sendError(res, {
      status: mapped.status,
      message: mapped.message,
      code: mapped.code,
      // The raw Postgres detail is useful while developing, but it names your
      // columns and constraints — do not ship it to the public.
      details: config.isProduction ? undefined : err.details || err.hint || err.message,
    });
  }

  // --- 5. Malformed JSON in the request body ------------------------------
  if (err.type === 'entity.parse.failed' || err instanceof SyntaxError && 'body' in err) {
    return sendError(res, {
      status: 400,
      message: 'The request body was not valid JSON.',
      code: 'INVALID_JSON',
    });
  }

  if (err.type === 'entity.too.large') {
    return sendError(res, {
      status: 413,
      message: 'That request body is too large.',
      code: 'PAYLOAD_TOO_LARGE',
    });
  }

  // --- 6. Anything else is an unexpected bug ------------------------------
  // Log the whole thing for yourself; return something generic to the caller.
  // eslint-disable-next-line no-console
  console.error('[UNHANDLED ERROR]', {
    method: req.method,
    path: req.originalUrl,
    message: err.message,
    stack: err.stack,
  });

  return sendError(res, {
    status: err.statusCode || 500,
    message: config.isProduction
      ? 'Something went wrong on our end. Please try again.'
      : err.message,
    code: 'INTERNAL_ERROR',
    details: config.isProduction ? undefined : err.stack,
  });
}

/**
 * Catch-all for unmatched routes. Registered after every route so that a typo
 * in a URL returns a proper JSON 404 rather than Express's HTML error page —
 * which would break a frontend expecting JSON.
 */
export function notFoundHandler(req, res) {
  return sendError(res, {
    status: 404,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
    code: 'ROUTE_NOT_FOUND',
  });
}

export default { errorHandler, notFoundHandler };
