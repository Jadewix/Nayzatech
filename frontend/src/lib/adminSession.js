/**
 * Name of the httpOnly cookie holding the admin key.
 *
 * Lives here rather than in the route file because a `route.js` may only
 * export HTTP method handlers — exporting a stray constant from one fails
 * Next's route validation at build time.
 */
export const ADMIN_COOKIE = 'admin_key';
