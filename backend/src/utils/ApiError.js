/**
 * A single error type for anything the API deliberately rejects.
 *
 * Throwing `new ApiError(404, 'Product not found', 'PRODUCT_NOT_FOUND')`
 * anywhere in a controller produces a clean 404 with a consistent body. Any
 * error that is NOT an ApiError is treated as an unexpected bug and becomes a
 * generic 500 — so an accidental `undefined.map()` never leaks a stack trace
 * with your file paths to a customer.
 */
export class ApiError extends Error {
  /**
   * @param {number} statusCode  HTTP status to return
   * @param {string} message     Human-readable message, safe to show a user
   * @param {string} [code]      Stable machine-readable code for the frontend
   * @param {*}      [details]   Optional extra context (e.g. field errors)
   */
  constructor(statusCode, message, code = 'ERROR', details = undefined) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    // Marks this as an error we anticipated, rather than a crash.
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message, code = 'BAD_REQUEST', details) {
    return new ApiError(400, message, code, details);
  }

  static unauthorized(message = 'Authentication required', code = 'UNAUTHORIZED') {
    return new ApiError(401, message, code);
  }

  static forbidden(message = 'You do not have permission to do that', code = 'FORBIDDEN') {
    return new ApiError(403, message, code);
  }

  static notFound(message = 'Resource not found', code = 'NOT_FOUND') {
    return new ApiError(404, message, code);
  }

  static conflict(message, code = 'CONFLICT', details) {
    return new ApiError(409, message, code, details);
  }

  static unprocessable(message, code = 'UNPROCESSABLE', details) {
    return new ApiError(422, message, code, details);
  }

  static internal(message = 'Something went wrong on our end', code = 'INTERNAL_ERROR') {
    return new ApiError(500, message, code);
  }
}

export default ApiError;
