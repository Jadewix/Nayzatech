/**
 * Admin sign-in and sign-out.
 *
 * WHY A COOKIE AND NOT AN ENV VAR IN THE BROWSER
 * ----------------------------------------------
 * ADMIN_API_KEY bypasses every admin guard on the backend. Putting it in a
 * NEXT_PUBLIC_* variable would embed it in the JavaScript bundle served to
 * every visitor of the storefront — anyone could read it in devtools and then
 * delete your products.
 *
 * So instead: the operator types the key once, it is verified against the real
 * backend, and it is stored in an httpOnly cookie. httpOnly means client-side
 * JavaScript cannot read it — not even our own. Every admin request then goes
 * through /api/proxy/*, which reads the cookie on the server and attaches the
 * header there. The key never reaches the browser.
 */

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ADMIN_COOKIE } from '@/lib/adminSession';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

function json(body, status) {
  return NextResponse.json(body, { status });
}

/** POST — verify a key against the backend, then store it. */
export async function POST(request) {
  let key;
  try {
    ({ key } = await request.json());
  } catch {
    return json({ success: false, error: { code: 'BAD_REQUEST', message: 'Expected JSON.' } }, 400);
  }

  if (!key || typeof key !== 'string' || key.trim() === '') {
    return json(
      { success: false, error: { code: 'KEY_REQUIRED', message: 'Enter your admin key.' } },
      400
    );
  }

  /**
   * Verify by actually calling a protected endpoint rather than comparing
   * locally. The backend is the only authority on whether a key is valid, and
   * this also proves it is reachable — so a wrong key and a dead API give two
   * different, accurate messages instead of one confusing one.
   */
  let response;
  try {
    response = await fetch(`${API_URL}/api/admin/dashboard`, {
      headers: { 'x-admin-key': key.trim() },
      cache: 'no-store',
    });
  } catch {
    return json(
      {
        success: false,
        error: {
          code: 'API_UNREACHABLE',
          message: `Cannot reach the backend at ${API_URL}. Is it running?`,
        },
      },
      503
    );
  }

  if (response.status === 401) {
    return json(
      { success: false, error: { code: 'ADMIN_KEY_INVALID', message: 'That key was not accepted.' } },
      401
    );
  }
  if (!response.ok) {
    return json(
      { success: false, error: { code: 'API_ERROR', message: `Backend returned ${response.status}.` } },
      502
    );
  }

  const store = await cookies();
  store.set(ADMIN_COOKIE, key.trim(), {
    httpOnly: true,                                   // unreadable from JavaScript
    sameSite: 'lax',                                  // not sent on cross-site requests
    secure: process.env.NODE_ENV === 'production',    // HTTPS-only once deployed
    path: '/',
    maxAge: 60 * 60 * 12,                             // 12 hours, then sign in again
  });

  return json({ success: true, data: { signed_in: true } }, 200);
}

/** DELETE — sign out. */
export async function DELETE() {
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
  return json({ success: true, data: { signed_in: false } }, 200);
}
