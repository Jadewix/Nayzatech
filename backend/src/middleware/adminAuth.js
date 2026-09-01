/**
 * Admin authentication.
 *
 * Guards every /api/admin/* route. Your admin dashboard sends the shared secret
 * as a header:
 *
 *   fetch('/api/admin/products', {
 *     headers: { 'x-admin-key': import.meta.env.VITE_ADMIN_KEY }
 *   })
 *
 * WHAT THIS IS AND IS NOT
 * -----------------------
 * This is a single shared secret. It is genuinely fine for a store one person
 * operates, and it is honest about its limits: there is no per-user identity,
 * no audit trail of who did what, and no way to revoke one admin without
 * rotating the key for everyone.
 *
 * When you need those things, replace the body of this function with a Supabase
 * Auth JWT check. Because every admin route already goes through this one
 * middleware, that is a change to this file only — no routes need touching.
 * A sketch is at the bottom of this file.
 */

import crypto from 'node:crypto';
import { ApiError } from '../utils/ApiError.js';
import config from '../config/env.js';

/**
 * Compare two secrets in constant time.
 *
 * A plain `a === b` returns as soon as it finds a differing character, so the
 * time it takes leaks how much of the key was correct. An attacker can use that
 * to recover the key one character at a time. timingSafeEqual always takes the
 * same time regardless of where the difference is.
 */
function safeCompare(a, b) {
  const bufferA = Buffer.from(String(a));
  const bufferB = Buffer.from(String(b));
  // timingSafeEqual throws on length mismatch, so hash first: both digests are
  // always 32 bytes, and the comparison itself stays constant-time.
  const digestA = crypto.createHash('sha256').update(bufferA).digest();
  const digestB = crypto.createHash('sha256').update(bufferB).digest();
  return crypto.timingSafeEqual(digestA, digestB);
}

/**
 * Require a valid admin key.
 * Accepts either `x-admin-key: <key>` or `Authorization: Bearer <key>`.
 */
export function requireAdmin(req, res, next) {
  const headerKey = req.get('x-admin-key');
  const bearer = req.get('authorization');
  const bearerKey = bearer?.startsWith('Bearer ') ? bearer.slice(7).trim() : null;
  const provided = headerKey || bearerKey;

  if (!provided) {
    return next(
      ApiError.unauthorized(
        'This endpoint requires an admin key. Send it in the x-admin-key header.',
        'ADMIN_KEY_MISSING'
      )
    );
  }

  if (!safeCompare(provided, config.admin.apiKey)) {
    // Log the attempt — repeated failures from one IP are worth knowing about.
    // eslint-disable-next-line no-console
    console.warn(`[AUTH] Rejected admin request to ${req.method} ${req.originalUrl} from ${req.ip}`);
    // Deliberately vague: do not confirm whether the key merely had a typo.
    return next(ApiError.unauthorized('Invalid admin credentials.', 'ADMIN_KEY_INVALID'));
  }

  req.isAdmin = true;
  return next();
}

/**
 * Soft variant: sets req.isAdmin without rejecting the request.
 *
 * Used on public product routes so an admin browsing the store can also see
 * inactive/draft products, while a normal shopper sees only published ones.
 */
export function detectAdmin(req, res, next) {
  const headerKey = req.get('x-admin-key');
  const bearer = req.get('authorization');
  const bearerKey = bearer?.startsWith('Bearer ') ? bearer.slice(7).trim() : null;
  const provided = headerKey || bearerKey;

  req.isAdmin = Boolean(provided) && safeCompare(provided, config.admin.apiKey);
  return next();
}

export default { requireAdmin, detectAdmin };

/* -----------------------------------------------------------------------------
 * UPGRADING TO SUPABASE AUTH LATER
 *
 * Replace the body of requireAdmin with roughly this:
 *
 *   const token = req.get('authorization')?.replace('Bearer ', '');
 *   if (!token) return next(ApiError.unauthorized());
 *
 *   const { data, error } = await supabase.auth.getUser(token);
 *   if (error || !data?.user) return next(ApiError.unauthorized());
 *   if (!data.user.app_metadata?.is_admin) return next(ApiError.forbidden());
 *
 *   req.user = data.user;
 *   req.isAdmin = true;
 *   next();
 *
 * Then set the flag on your admin account once, from a trusted script:
 *   supabase.auth.admin.updateUserById(userId, { app_metadata: { is_admin: true } })
 * -------------------------------------------------------------------------- */
