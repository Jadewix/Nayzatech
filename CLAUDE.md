# Tech store — project context

E-commerce store selling laptops, PC parts, phone cases and electronics.
**Payment is cash on delivery.** The site never touches money.

Two applications in one repo:

```
backend/    Express REST API  ->  PostgreSQL on Supabase        port 5000
frontend/   Next.js 16 storefront (App Router, JavaScript)      port 3000
```

They talk over HTTP only. The frontend has no database access and never will.

---

## Rules that must not be broken

These are not style preferences. Each one exists because breaking it causes a
specific, expensive failure.

### 1. The browser never sends prices, totals, or the delivery fee

Checkout sends **product ids and quantities only**. The server looks up prices
and the delivery fee inside the checkout transaction.

```js
// CORRECT
createOrder({ customer_name, customer_email, customer_phone,
              shipping_address, items: [{ product_id, quantity }] })

// WRONG — anyone with devtools buys a laptop for $1
createOrder({ ..., items: [{ product_id, quantity, price: 1.00 }], total: 1.00 })
```

The cart stores a price per item **for display only**, so the cart page renders
without re-fetching. Never send it anywhere.

### 2. Stock changes happen in PostgreSQL, never in JavaScript

Read-check-write in JS has a race condition: two customers checking out at the
same instant both see "1 available", both pass the check, both deduct, and you
sell stock you don't have.

All stock logic lives in `backend/db/02_functions.sql` and runs inside one
transaction holding a row lock (`SELECT ... FOR UPDATE`). Node calls it via RPC:

```js
await supabase.rpc('create_order', { ... })        // checkout + deduct
await supabase.rpc('adjust_stock', { ... })        // admin stock edit
await supabase.rpc('set_order_status', { ... })    // lifecycle + restock
await supabase.rpc('record_delivery_attempt', {...})
```

**Never** write `UPDATE products SET stock_quantity = ...` from a controller.
If you need new stock behaviour, add it to the SQL function.

This was tested: 8 simultaneous checkouts for 1 unit produced exactly 1 success.

### 3. A failed email must never fail the request

The order is already committed when the email is sent. If sending threw, the
customer would see an error, retry, and place a duplicate order — double-
deducting stock. Every send catches its own errors and returns a result object.

```js
const result = await sendOrderConfirmation(order).catch((e) => ({ sent: false }));
return sendSuccess(res, { ...order, confirmation_email_sent: result?.sent === true });
```

### 4. The service_role key never leaves the backend

`SUPABASE_SERVICE_ROLE_KEY` bypasses Row Level Security and can read or delete
every row. It belongs only in `backend/.env`. Never in frontend code, never in
a `NEXT_PUBLIC_*` variable, never in a commit.

Anything prefixed `NEXT_PUBLIC_` is embedded in the JavaScript sent to browsers.

### 5. Delivery attempts are not the same as failed delivery

A courier visit that fails increments `delivery_attempts` and leaves the order
`shipped` so it can be retried. It does **not** restock — those goods are still
in the van. Only moving the status to `failed_delivery` returns stock.

Conflating the two puts items back on sale while a courier is still carrying
them. This is the classic COD inventory bug.

---

## Order lifecycle

```
pending ──> confirmed ──> processing ──> shipped ──> delivered   (terminal)
   │            │              │            │
   │            │              │            └──> failed_delivery (terminal, restocks)
   └────────────┴──────────────┴──> cancelled                    (terminal, restocks)
```

The database enforces legal transitions. Jumping `pending` → `shipped` returns
409 with the allowed moves listed.

`pending` exists because COD has no payment proving an order is real. A human
phones the customer, then marks it `confirmed`. Skipping this is the main cause
of failed deliveries.

All three end states are terminal. The two that restock cannot be reopened —
the goods are already back on sale, and `stock_restored` would block a second
correction, so inventory would drift silently.

**Revenue counts `delivered` orders only.** With COD the money does not exist
until the courier hands it over.

---

## API conventions

Every endpoint answers in one of two shapes. No exceptions.

```jsonc
{ "success": true,  "data": ..., "meta": { "pagination": {...} } }
{ "success": false, "error": { "code": "INSUFFICIENT_STOCK", "message": "..." } }
```

Controllers never build these by hand:

```js
import { sendSuccess } from '../utils/response.js';
import { ApiError } from '../utils/ApiError.js';

sendSuccess(res, data, { status: 201 });
throw ApiError.notFound('Product not found', 'PRODUCT_NOT_FOUND');
```

Every async route handler is wrapped in `asyncHandler` — Express 4 does not
catch async errors, and an unwrapped rejection hangs the request forever.

Errors thrown anywhere funnel through `backend/src/middleware/errorHandler.js`,
which maps SQL function prefixes (`INSUFFICIENT_STOCK: ...`) and Postgres
SQLSTATE codes onto proper HTTP statuses.

Request validation is zod, in `backend/src/utils/schemas.js`. If a field is not
defined there it does not reach the database.

### Routes

- `/api/*` — public, no auth
- `/api/admin/*` — requires header `x-admin-key: <ADMIN_API_KEY>`

The admin router applies `requireAdmin` once at the top, so a new admin route
cannot forget the guard. Keep it that way.

`GET /api` returns a live index of every endpoint.

---

## Frontend conventions

**Server components by default.** Pages fetch on the server and send finished
HTML so Google can index product pages — that is the entire reason this is
Next.js and not a plain React SPA.

Adding `'use client'` to a page opts it out of server rendering and out of the
SEO. Only these are client components, and each needs state or click handlers:

- `components/CartProvider.jsx`
- `components/Header.jsx` (cart count)
- `components/AddToCart.jsx`
- `app/cart`, `app/checkout`, `app/track` (forms)

**All HTTP goes through `frontend/src/lib/api.js`.** Nothing else calls `fetch`.
It unwraps the envelope and throws `ApiError` with a `code` to branch on.

**Caching is explicit.** Next caches server fetches by default, which would show
hour-old stock. Catalogue pages use `revalidate: 60`; stock, cart totals and
orders use `revalidate: false`.

**Dynamic params are promises in Next 16:**

```js
export default async function Page({ params }) {
  const { slug } = await params;   // NOT params.slug
}
```

Forgetting the `await` is the most common error here and its message is unclear.

**Tailwind v4** — theme lives in `@theme` in `frontend/src/app/globals.css`, not
in a `tailwind.config.js`. Guides showing that file are v3 and do not apply.
Colour tokens: `ink`/`muted`/`faint` text, `paper`/`surface` backgrounds,
`line` borders, `brand` links and buttons, `cash` for anything about paying the
courier, `alert` for problems.

---

## Commands

```bash
npm run setup            # install both apps
npm run dev:backend      # port 5000  — run in its own terminal
npm run dev:frontend     # port 3000  — run in another terminal
```

Both must be running. When the storefront shows no products, check the backend
terminal first.

Database changes go in `backend/db/*.sql`, applied by pasting into the Supabase
SQL Editor. There is no migration tool.

---

## Environment

`backend/.env` (from `.env.example`):

| Variable | Notes |
|---|---|
| `SUPABASE_URL` | Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role, **not** anon. Server refuses to start if wrong |
| `ADMIN_API_KEY` | Guards `/api/admin/*` |
| `FRONTEND_URL` | CORS allowlist. Must match where Next runs |
| `EMAIL_ENABLED` | `false` logs emails instead of sending |

`frontend/.env.local` (from `.env.local.example`):

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:5000` |

The delivery fee, free-delivery threshold, currency and checkout on/off switch
are **not** environment variables. They live in the `store_settings` table so
they can change without a redeploy: `PATCH /api/admin/settings`.

---

## State of the project

**Working and verified**

- Full catalogue API with filtering, search, JSONB spec filtering, pagination
- Atomic checkout with stock deduction, concurrency-tested
- COD lifecycle with restocking and delivery attempts
- Brevo emails (order confirmation, contact alert, status updates)
- Supabase Storage image upload
- Admin endpoints for products, stock, orders, settings, contact inbox
- Storefront: home, catalogue, product pages, cart, checkout, order tracking

**Not built**

- **Admin panel UI** — every endpoint exists, there is no interface. Highest
  priority: without it you cannot add real products or work the confirmation
  queue.
- Search box in the header (backend supports `?search=`)
- Spec filter sidebar (backend supports `?specs={"ram_gb":16}`; a category
  returns `spec_fields` describing what to render)
- Contact form page (`POST /api/contact` works; render a hidden `website`
  honeypot field)
- Automated tests — none committed
- SMS notifications (for COD, an SMS on `shipped` outperforms email)

**Never verified at runtime:** the frontend has never been booted. It was
type-checked and its API contract machine-checked against the backend, but
`npm install` was never run. Expect small first-boot fixes.

---

## Where things are

```
backend/db/01_schema.sql       tables, enums, indexes, store_settings
backend/db/02_functions.sql    ← all stock and order logic. Read this first.
backend/db/03_security.sql     RLS + storage bucket
backend/db/04_seed.sql         9 sample products
backend/db/05_migrate_to_cod.sql   only for an older prepaid database

backend/src/app.js             middleware order + CORS (comments explain why)
backend/src/utils/schemas.js   every input contract
backend/src/middleware/errorHandler.js   error -> HTTP status mapping

frontend/src/lib/api.js        the only place that calls fetch
frontend/src/components/CartProvider.jsx   cart state
frontend/src/app/checkout/page.jsx         COD checkout

docs/SUPABASE_SETUP.md         what to do in Supabase before any code runs
docs/API.md                    endpoint reference
docs/ROADMAP.md                ordered list of what to build next
```
