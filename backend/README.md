# Tech Store — Backend API

REST API for an e-commerce tech store (laptops, PC parts, phone cases, electronics).

**Stack:** Node.js + Express · PostgreSQL on Supabase · Supabase Storage for images · Brevo for email

**Payment: cash on delivery.** This API never touches money. There is no gateway, no card data, no payment table — the courier collects cash at the door and `delivered` means the customer paid. What the system *does* do is make sure the amount to collect is correct and clearly communicated.

The frontend is a separate React app. This backend serves JSON only — it renders no HTML and knows nothing about your UI.

---

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Set up your environment
cp .env.example .env
#    then fill in the values (see "Environment variables" below)

# 3. Create the database
#    In Supabase: Dashboard -> SQL Editor -> New query
#    Run these four files IN ORDER, one at a time:
#      db/01_schema.sql      tables, indexes, triggers
#      db/02_functions.sql   atomic order + stock logic
#      db/03_security.sql    row level security + storage bucket
#      db/04_seed.sql        sample products (optional)
#
#    ALREADY ran the old prepaid schema? Run db/05_migrate_to_cod.sql instead
#    of 01. It converts an existing database in place. Fresh setup: ignore it.

# 4. Start it
npm run dev      # development, auto-restarts on file changes
npm start        # production
```

Then open `http://localhost:5000/api` — it returns a list of every endpoint.

On boot the server checks your database, storage bucket and Brevo credentials, and prints what's working:

```
  Tech Store API
  ----------------------------------------------
  Listening   http://localhost:5000
  Environment development
  CORS allows http://localhost:3000
  Database    connected
  Storage     bucket "product-images" ready
  Email       Brevo connected
```

---

## Environment variables

| Variable | Required | What it's for |
|---|---|---|
| `PORT` | no | Server port (default `5000`) |
| `NODE_ENV` | no | `development` or `production` |
| `FRONTEND_URL` | no | Allowed CORS origin(s). Comma-separate several. Default `http://localhost:3000` |
| `SUPABASE_URL` | **yes** | Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | **yes** | The **service_role** key, not the anon key |
| `SUPABASE_STORAGE_BUCKET` | no | Default `product-images` |
| `BREVO_API_KEY` | no | Brevo → SMTP & API → API Keys |
| `BREVO_SENDER_EMAIL` | no | Must be a **verified** sender in Brevo |
| `ADMIN_EMAIL` | no | Where contact-form alerts are delivered |
| `EMAIL_ENABLED` | no | `false` logs emails instead of sending them |
| `ADMIN_API_KEY` | **yes** | The secret your admin dashboard sends |

There are **no payment gateway keys**, because the site never handles money. The delivery fee, free-delivery threshold, currency and checkout on/off switch are not environment variables either — they live in the database so you can change them from the admin panel with no redeploy. See [Delivery fee](#delivery-fee) below.

Generate a strong admin key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Two Supabase keys — don't mix them up

Supabase gives you an **anon** key and a **service_role** key.

- **anon** is safe in your React bundle. Row Level Security is the only thing protecting your data from it.
- **service_role** bypasses RLS entirely and can read and delete every row in every table. It belongs **only** in this server's `.env`.

If the service_role key ever lands in frontend code, a git commit, or a screenshot, rotate it immediately in the Supabase dashboard. The server refuses to start if you paste the anon key in by mistake.

---

## Response format

Every endpoint answers in one of two shapes. No exceptions.

**Success**
```json
{ "success": true, "data": { ... } }
```

**Success with pagination**
```json
{
  "success": true,
  "data": [ ... ],
  "meta": {
    "pagination": {
      "total": 143, "page": 1, "limit": 20,
      "total_pages": 8, "has_next": true, "has_previous": false
    }
  }
}
```

**Failure**
```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "\"Raptor 15 RTX Gaming Laptop\" — requested 3, only 1 left"
  }
}
```

Validation failures add a per-field breakdown you can render inline in a form:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Some fields need fixing.",
    "details": {
      "customer_email": "Please enter a valid email address",
      "items.0.quantity": "Quantity must be at least 1"
    }
  }
}
```

Because the shape never varies, one fetch wrapper in React handles everything:

```js
async function api(path, options = {}) {
  const res = await fetch(`${import.meta.env.VITE_API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const body = await res.json();
  if (!body.success) throw new Error(body.error.message);
  return body.data;
}
```

---

## Endpoints

### Public

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/store-info` | Delivery fee + whether you're accepting orders (`?subtotal=129`) |
| GET | `/api/categories` | List categories (`?format=tree` for nested) |
| GET | `/api/categories/:idOrSlug` | One category + children + filter fields |
| GET | `/api/products` | Browse the catalogue |
| GET | `/api/products/:idOrSlug` | One product + related items |
| GET | `/api/products/:id/stock` | Live stock for one product |
| POST | `/api/orders` | **Checkout** (phone number required) |
| POST | `/api/orders/check-stock` | Pre-checkout availability check |
| GET | `/api/orders/:id` | Order by id |
| GET | `/api/orders/lookup` | Order by `?order_number=` **and** `?email=` |
| POST | `/api/contact` | Contact form |

### Admin — all require `x-admin-key: <ADMIN_API_KEY>`

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/admin/dashboard` | Everything the admin home screen needs, in one call |
| GET/PATCH | `/api/admin/settings` | **Change the delivery fee** — live, no redeploy |
| GET | `/api/admin/orders/pending-confirmation` | **Daily queue:** orders needing a confirmation call |
| POST | `/api/admin/orders/:id/delivery-attempt` | Log a failed courier visit (does *not* restock) |
| POST/PATCH/DELETE | `/api/admin/categories[/:id]` | Manage categories |
| POST/PATCH/DELETE | `/api/admin/products[/:id]` | Manage products |
| POST | `/api/admin/products/:id/image` | Replace the primary image |
| POST | `/api/admin/products/:id/gallery` | Add gallery images |
| GET | `/api/admin/stock` | Inventory overview (`?low_stock_only=true`) |
| PATCH | `/api/admin/products/:id/stock` | **Update stock levels** |
| PATCH | `/api/admin/stock/bulk` | Update many products at once |
| GET | `/api/admin/products/:id/stock-history` | Audit trail for one product |
| GET | `/api/admin/orders` | List orders |
| PATCH | `/api/admin/orders/:id/status` | Move through the lifecycle (cancel / fail restocks) |
| GET | `/api/admin/contact` | Contact inbox |

### Filtering products

Everything combines freely:

```
/api/products?category=gaming-laptops&min_price=1000&max_price=2000&in_stock=true
/api/products?search=thinkpad&sort=price_asc&page=2&limit=12
/api/products?specs={"ram_gb":16,"gpu":"NVIDIA RTX 4070 8GB"}
```

`sort` accepts `newest`, `oldest`, `price_asc`, `price_desc`, `name_asc`, `name_desc`.

Browsing a parent category (`?category=laptops`) automatically includes its children, so "Laptops" shows gaming and business laptops too.

---

## How stock safety works

This is the part worth understanding, because it's where most hand-built e-commerce backends have a real bug.

**The problem.** One laptop left, two customers checking out at the same instant. In plain JavaScript you'd:

1. read stock → both requests see "1 available"
2. check it → both pass
3. deduct → stock is now **-1**, and you've sold a laptop you don't have

That gap between step 1 and step 3 is a race condition. It doesn't show up in testing because you're one person clicking one button. It shows up on your first busy day.

**The fix.** The read, the check and the write happen inside one PostgreSQL transaction that holds a lock on the product row (`SELECT ... FOR UPDATE`). The second request waits its turn, re-reads the *real* stock, sees 0, and is rejected cleanly. JavaScript can't do this; Postgres can.

So `create_order` lives in `db/02_functions.sql`, not in a controller. In one atomic operation it:

1. locks each product row
2. verifies stock and that the product is still active
3. **reads prices from the database** — never from the request
4. deducts stock
5. writes the order, its line items, and the inventory audit trail

If any single item is short, the whole thing rolls back. No half-written order, no stock deducted for the items that *were* available.

**This was tested against a real PostgreSQL instance**: 8 simultaneous checkouts for 1 unit in stock produced exactly 1 success, 7 clean `INSUFFICIENT_STOCK` rejections, and a final stock of 0 — never negative.

### Prices are never trusted from the client

The checkout body carries product IDs and quantities only — no prices, no total:

```json
{
  "customer_name": "Jad Khoury",
  "customer_email": "jad@example.com",
  "customer_phone": "+961 70 123 456",
  "shipping_address": {
    "line1": "12 Rue Gouraud", "city": "Beirut", "country": "Lebanon"
  },
  "items": [{ "product_id": "uuid-here", "quantity": 2 }]
}
```

Prices *and the delivery fee* are looked up server-side inside the transaction. If the client could send either, someone would edit it in devtools and buy a laptop for one dollar with free shipping.

The response comes back with the breakdown the courier needs:

```json
{
  "subtotal": "129.00",
  "delivery_fee": "5.00",
  "total_amount": "134.00",
  "order_number": "TS-20260824-00042",
  "confirmation_email_sent": true
}
```

---

## The cash-on-delivery lifecycle

```
pending ──> confirmed ──> processing ──> shipped ──> delivered   (terminal)
   │            │              │            │
   │            │              │            └──> failed_delivery (terminal, restocks)
   └────────────┴──────────────┴──> cancelled                    (terminal, restocks)
```

The database enforces this. Trying to jump from `pending` straight to `shipped` returns a 409 telling you what moves *are* allowed.

### Why `confirmed` exists

With cash on delivery there is no payment proving an order is real. Anyone can type a fake name and address, and you find out only after the courier has driven there. So a new order lands as `pending` and waits for a human.

`GET /api/admin/orders/pending-confirmation` is your daily queue — oldest first, with an `hours_waiting` field so nothing rots. Phone the customer, then `PATCH /api/admin/orders/:id/status` with `"confirmed"`, and only then does it get packed.

This is the single biggest lever on your failed-delivery rate. Skipping it is why COD stores end up shipping to nobody.

### Why `failed_delivery` is separate from `cancelled`

Both return stock to the shelf. They cost you very different amounts.

`cancelled` is a customer changing their mind before you spent anything. `failed_delivery` means the courier drove there — possibly more than once — and came back with your goods. Keeping them apart is what lets you see the second number, which is the one that quietly eats COD margins.

### Delivery attempts are not the same as failure

When the courier goes and nobody answers:

```
POST /api/admin/orders/:id/delivery-attempt
{ "note": "nobody home, trying again tomorrow" }
```

This increments `delivery_attempts` and leaves the order `shipped`, so it can be retried. It deliberately does **not** restock — those items are still in the courier's van, and putting them back on sale would let someone else buy stock you don't have.

Only when you give up do you set the status to `failed_delivery`, and *that* returns the stock. Conflating the two is the classic COD inventory bug.

### Cancelling returns stock

`PATCH /api/admin/orders/:id/status` with `"status": "cancelled"` (or `"failed_delivery"`) puts every item back on the shelf — exactly once, guarded by a `stock_restored` flag so doing it twice can't inflate your inventory.

`delivered`, `cancelled` and `failed_delivery` are all **terminal**. The two that restock can't be reopened, because the goods are already back on sale; reopening would leave the order active while someone else buys its stock, and `stock_restored` would block any correction. Inventory would drift quietly forever. If a customer wants the order after all, place a new one.

### Revenue means cash you actually received

`/api/admin/orders/stats` and `/api/admin/dashboard` count revenue from **delivered orders only**.

This is stricter than a prepaid store, and deliberately so. A prepaid store can count an order the moment it's paid. Here, money doesn't exist until the courier hands it over — an order that's placed, confirmed, packed and shipped has earned you nothing if the customer refuses it at the door. Counting earlier would inflate your figures with cash you may never see.

The dashboard also reports `failed_delivery_rate`. If it climbs above roughly 10%, the usual cause is orders being dispatched without a confirmation call.

---

## Delivery fee

The fee lives in the **database**, not in `.env`, so you can change it from the admin panel and the next order picks it up immediately — no restart, no redeploy.

```jsonc
PATCH /api/admin/settings
{
  "delivery_fee": 5,                 // flat charge added to every order
  "free_delivery_threshold": 500,    // free delivery at or above this subtotal; 0 = always charge
  "currency": "USD",
  "cod_enabled": true                // false pauses checkout without taking the site down
}
```

Two things this design buys you:

**The browser can never send its own fee.** It's read inside the checkout transaction, straight from the database, so a tampered cart can't pay less.

**Changing it doesn't rewrite history.** The fee is snapshotted onto each order at checkout. A customer told to have $134 ready must not find the courier asking for $137 because you raised the charge in the meantime.

Your cart calls `GET /api/store-info?subtotal=129` to show the charge before checkout:

```json
{
  "payment_method": "cash_on_delivery",
  "accepting_orders": true,
  "delivery": {
    "fee": 5,
    "free_delivery_threshold": 500,
    "applicable_fee": 5,
    "qualifies_for_free_delivery": false,
    "amount_to_free_delivery": 371
  }
}
```

That last field is worth using — "spend $371 more for free delivery" is a genuinely effective nudge.

### Phone numbers are required

Unlike a prepaid store, `customer_phone` is mandatory. You need it to confirm the order is real, and the courier needs it to call from the street. An order without a reachable number is an order you can't deliver, so the API rejects it at checkout.

---

## Updating stock: `set` vs `delta`

```jsonc
PATCH /api/admin/products/:id/stock

{ "mode": "set",   "value": 25, "reason": "manual_adjustment" }  // "there are exactly 25 on the shelf"
{ "mode": "delta", "value": 20, "reason": "restock" }            // "20 more just arrived"
{ "mode": "delta", "value": -1, "reason": "damaged" }            // "one broke"
```

Prefer `delta` for routine changes. If two people restock at once, two deltas both apply correctly — two `set` calls means whoever saves last wins and the other person's count silently vanishes.

Every change writes an `inventory_movements` row, so when the numbers look wrong you can see exactly what moved them and when.

---

## Product specs (the flexible bit)

A laptop needs `{cpu, ram_gb, screen_size}`. A phone case needs `{compatible_models, material}`. A USB cable needs almost nothing.

Forcing all three into one rigid table means either 40 mostly-null columns or a slow entity-attribute-value join on every listing page. So `products.specs` is a **JSONB** column with a GIN index — flexible attributes *and* fast filtering:

```
/api/products?specs={"ram_gb":16}
```

A companion table, `category_spec_fields`, describes which spec keys belong to which category, with labels, units and filter types. Your React filter sidebar and admin form can be generated from that data — add a row, a new filter appears, no code change.

---

## Image uploads

Send `multipart/form-data` with the field name `image`:

```js
const form = new FormData();
form.append('image', fileInput.files[0]);

await fetch(`${API}/api/admin/products/${id}/image`, {
  method: 'POST',
  headers: { 'x-admin-key': ADMIN_KEY },   // no Content-Type — the browser sets the boundary
  body: form,
});
```

Files are held in memory and streamed straight to Supabase Storage — nothing touches this server's disk, so it works on read-only container filesystems. The returned public URL is saved to `products.image_url`.

Limits: 5 MB per file, JPEG/PNG/WebP/AVIF/GIF, enforced both here and by the storage bucket itself.

Replacing an image deletes the old file — but only *after* the database update succeeds, so a failed save can't leave a product with no image.

---

## Email (Brevo)

Two events are wired up:

- **Order confirmation** → the customer, after checkout
- **Contact form alert** → the store admin, with `replyTo` set to the customer so hitting Reply writes back to them

Status-change emails fire automatically from the admin status endpoint (`confirmed`, `processing`, `shipped`, `delivered`, `cancelled`, `failed_delivery`).

### The cash panel

For a COD store the confirmation email has one job above all others: **tell the customer exactly how much cash to have ready.** A customer who answers the door without the right money means a wasted courier trip and often a returned order — the biggest avoidable cost in COD.

So the amount due gets its own panel in large type, above the itemised breakdown, in both the HTML and plain-text versions:

```
**********************************************
  PAY IN CASH ON DELIVERY: $134.00
  Please have this amount ready for the courier.
**********************************************
```

The `shipped` email repeats it — that's the last reminder before the courier knocks. The subject line carries it too: *"Order TS-20260824-00042 received — $134.00 due on delivery"*.

**A failed email never fails the request.** If Brevo is down mid-checkout, the order is already committed; throwing would make the customer retry and place a duplicate. So sends catch their own errors, log them, and the response tells you what happened:

```json
{ "success": true, "data": { "order_number": "TS-...", "confirmation_email_sent": false } }
```

Set `EMAIL_ENABLED=false` while developing and emails are logged to the console instead of sent.

> **The most common Brevo problem:** your sender address must be **verified** in Brevo (Senders, Domains & Dedicated IPs) or every send is rejected. Check that first.

---

## Security notes

- **Admin auth** is a single shared secret in the `x-admin-key` header, compared in constant time so the comparison can't leak the key one character at a time. It's genuinely fine for a store one person runs. It gives you no per-user identity and no way to revoke one admin without rotating the key for everyone — when you need those, swap in Supabase Auth. Because `requireAdmin` guards the whole admin router, that's a change to one file; no routes need touching. There's a sketch in `src/middleware/adminAuth.js`.

- **Row Level Security** is enabled on every table. This backend uses the service_role key and bypasses it, but RLS is on anyway — because "only the backend talks to the database" is a promise that gets broken later when someone adds a quick Supabase call in React. When that happens, the worst case is reading a public product list, not downloading every customer's home address. Orders and contact submissions have RLS on and **zero** policies: the anon key can do nothing with them.

- **Order IDs are UUIDs**, so `GET /api/orders/:id` works as a tracking link without login — unguessable, and not enumerable. The `/lookup` endpoint requires the order number *and* the matching email, because order numbers are sequential and therefore guessable.

- **Rate limits**: 300 requests/15min overall, 10 checkouts/hour, 5 contact messages/hour, 30 admin attempts/15min (failed ones only, so brute-forcing the key is throttled but real work isn't). These are in-memory — correct for one server. If you scale to several instances, add `rate-limit-redis` so they share a counter.

- **A honeypot field** blocks contact spam with no captcha. Render `website` hidden in your form; humans never see it, bots fill it, and the submission is rejected.

- **All user input is escaped** before it reaches an email template, so a contact message containing `<script>` renders as text rather than markup.

- **The delivery fee and item prices are read inside the checkout transaction**, never taken from the request body. A tampered cart cannot pay less.

- **`cod_enabled: false` pauses checkout** without taking the site down. Useful for a stock count, a holiday, or a courier strike — customers can still browse, they just can't order.

---

## Project structure

```
db/
  01_schema.sql        tables, enums, indexes, triggers, store_settings, the products view
  02_functions.sql     create_order, adjust_stock, set_order_status,
                       record_delivery_attempt, get_delivery_fee  <- the important one
  03_security.sql      RLS policies + storage bucket
  04_seed.sql          sample catalogue
  05_migrate_to_cod.sql  only if you already ran the old prepaid schema

src/
  server.js            startup checks, listener, graceful shutdown
  app.js               middleware stack + CORS  <- read the comments here
  config/
    env.js             validates every env var at boot
    supabase.js        the single shared client
  middleware/
    errorHandler.js    everything funnels here; makes the error envelope consistent
    adminAuth.js       the x-admin-key guard
    validate.js        zod request validation
    upload.js          multer, memory storage
    rateLimit.js
  routes/
    index.js           the route table
    public.routes.js
    admin.routes.js
  controllers/         category, product, order, contact, admin, settings
  services/
    email.service.js   Brevo
    email.templates.js order confirmation, contact alert, status update
    storage.service.js Supabase Storage
  utils/
    schemas.js         every zod schema — the contract for all input
    ApiError.js  response.js  asyncHandler.js  slugify.js
```

---

## Connecting your React frontend

Point your dev server's env at the API:

```env
# .env.local in your React project
VITE_API_URL=http://localhost:5000
```

And make sure this backend's `FRONTEND_URL` matches where React actually runs. If you see a CORS error in the browser console, that mismatch is almost always why — Vite defaults to `5173`, Create React App to `3000`. In development any `localhost` port is allowed automatically; in production `FRONTEND_URL` must list your real domain.

Note the `x-admin-key` header is explicitly listed in the CORS config. A browser refuses to send a custom header the server hasn't declared, so if it were missing, every admin call would fail with a confusing CORS error instead of a clear 401.

---

## What isn't here

Worth knowing before you build on it:

- **No payment gateway, by design.** This is cash on delivery: no card data, no PCI scope, no webhooks. If you add card payments later you'd add a `payment_status` column then — an unused column that lies about what it tracks is worse than no column.
- **No cash reconciliation.** You chose to track courier cash outside the system, so the API records *what* to collect but not what you've actually received back from your courier. If that becomes painful, the natural addition is `amount_collected` and a `cash_reconciled` flag on orders, plus a "delivered but not reconciled" report.
- **No customer accounts.** Checkout is guest-only; customers find orders via the tracking link or `/lookup`.
- **No SMS.** For COD, an SMS on `shipped` usually outperforms email — customers who don't check email still answer their phone. Brevo does SMS through a similar API, so `email.service.js` is the pattern to copy.
- **No shipping-rate calculation.** The delivery fee is flat (with an optional free-delivery threshold). `weight_grams` is on products and the address is structured JSONB, so per-zone rates can be added without touching the schema.
- **No automated test suite.** The SQL logic was verified against a live PostgreSQL instance — concurrency, rollback, restocking, the full COD lifecycle, transition guards, and the migration against legacy rows — but there are no committed tests. Worth adding before this handles real orders.
