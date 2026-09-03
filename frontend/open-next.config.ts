/**
 * OpenNext's Cloudflare adapter configuration.
 *
 * Deliberately minimal. The defaults cover this app: server-rendered pages,
 * route handlers (/api/proxy and /api/admin-session), and the catalogue pages'
 * `revalidate: 60`.
 *
 * The one thing worth knowing if caching ever misbehaves: incremental cache is
 * not configured here, so revalidated pages are not shared between Worker
 * isolates. For this shop that is correct — the pages with real freshness
 * requirements (cart, checkout, orders, anything admin) already set
 * `revalidate: false` and are never cached at all. If the catalogue ever needs
 * a cache shared across isolates, add the R2 or KV incremental cache here
 * rather than lowering the revalidate windows.
 */
import { defineCloudflareConfig } from '@opennextjs/cloudflare';

export default defineCloudflareConfig();
