/**
 * The authenticated bridge between the admin UI and the Express API.
 *
 * Everything the admin panel does goes through here:
 *
 *   browser  ->  /api/proxy/admin/stock  ->  :5000/api/admin/stock
 *                (no key)                    (x-admin-key attached here)
 *
 * The key is read from the httpOnly cookie ON THE SERVER and attached to the
 * outgoing request. It is never sent to the browser, so devtools, a stray
 * console.log or an XSS bug cannot leak it.
 *
 * It forwards to /api/* generally, not just /api/admin/*, because the public
 * product endpoints use `detectAdmin`: sending the key to GET /api/products
 * is what makes draft (inactive) products visible in the admin list while
 * shoppers still see only published ones.
 */

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ADMIN_COOKIE } from '@/lib/adminSession';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

/** Methods that carry no body. */
const BODYLESS = new Set(['GET', 'HEAD']);

async function proxy(request, context) {
  const { path } = await context.params;          // params is a promise in Next 16
  const key = (await cookies()).get(ADMIN_COOKIE)?.value;

  if (!key) {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'NOT_AUTHENTICATED', message: 'Your session expired. Sign in again.' },
      },
      { status: 401 }
    );
  }

  const target = `${API_URL}/api/${path.join('/')}${new URL(request.url).search}`;

  const headers = { 'x-admin-key': key };
  /**
   * Forward the content type verbatim rather than forcing application/json.
   * Image uploads arrive as multipart/form-data with a generated boundary
   * string in the header — rewriting it would make multer unable to parse the
   * body, and the upload would fail with an unhelpful error.
   */
  const contentType = request.headers.get('content-type');
  if (contentType) headers['content-type'] = contentType;

  const init = { method: request.method, headers, cache: 'no-store' };
  if (!BODYLESS.has(request.method)) {
    // arrayBuffer rather than a stream: bodies here are JSON or a <=5MB image,
    // and buffering avoids the duplex/streaming caveats between runtimes.
    init.body = await request.arrayBuffer();
  }

  let response;
  try {
    response = await fetch(target, init);
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'API_UNREACHABLE',
          message: `Cannot reach the backend at ${API_URL}. Is it running?`,
        },
      },
      { status: 503 }
    );
  }

  // Pass the backend's status and body through untouched, so the UI can branch
  // on the real error codes (DUPLICATE_SKU, INSUFFICIENT_STOCK, ...).
  const body = await response.text();
  return new NextResponse(body, {
    status: response.status,
    headers: { 'content-type': response.headers.get('content-type') || 'application/json' },
  });
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;
