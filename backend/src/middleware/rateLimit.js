/**
 * Rate limiting.
 *
 * Your API is on the public internet. Without limits, one script can submit ten
 * thousand contact forms (burning your Brevo quota and filling your inbox) or
 * hammer checkout until the database falls over.
 *
 * Limits are per IP and deliberately generous — they should stop abuse without
 * ever inconveniencing a real customer.
 *
 * NOTE: this stores counters in memory. That is correct for a single server.
 * If you scale to multiple instances, each keeps its own count, so the
 * effective limit multiplies by the instance count. At that point add a Redis
 * store (`rate-limit-redis`) so all instances share one counter.
 */

import rateLimit from 'express-rate-limit';
import { sendError } from '../utils/response.js';

/** Shared 429 response, so rate-limit errors match the API's error envelope. */
function limitReached(req, res) {
  return sendError(res, {
    status: 429,
    message: 'Too many requests. Please wait a moment and try again.',
    code: 'RATE_LIMIT_EXCEEDED',
  });
}

const shared = {
  standardHeaders: true,   // sends RateLimit-* headers so clients can back off
  legacyHeaders: false,
  handler: limitReached,
};

/** Broad limit across the whole API: 300 requests per 15 minutes per IP. */
export const globalLimiter = rateLimit({
  ...shared,
  windowMs: 15 * 60 * 1000,
  limit: 300,
});

/**
 * Checkout: 10 orders per hour per IP.
 * High enough that a family sharing an office IP is never blocked, low enough
 * that nobody scripts a thousand orders.
 */
export const checkoutLimiter = rateLimit({
  ...shared,
  windowMs: 60 * 60 * 1000,
  limit: 10,
  handler: (req, res) =>
    sendError(res, {
      status: 429,
      message: 'Too many orders from this address. Please try again later.',
      code: 'CHECKOUT_RATE_LIMIT',
    }),
});

/** Contact form: 5 messages per hour per IP. Each one sends an email. */
export const contactLimiter = rateLimit({
  ...shared,
  windowMs: 60 * 60 * 1000,
  limit: 5,
  handler: (req, res) =>
    sendError(res, {
      status: 429,
      message: 'You have sent several messages already. Please wait before sending another.',
      code: 'CONTACT_RATE_LIMIT',
    }),
});

/**
 * Admin routes: 30 attempts per 15 minutes.
 * This is the brake on someone brute-forcing ADMIN_API_KEY.
 */
export const adminLimiter = rateLimit({
  ...shared,
  windowMs: 15 * 60 * 1000,
  limit: 30,
  // Only failed requests count, so a legitimate admin working quickly is
  // never throttled while a guesser is stopped after 30 tries.
  skipSuccessfulRequests: true,
});

export default { globalLimiter, checkoutLimiter, contactLimiter, adminLimiter };
