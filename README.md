# Tech Store

E-commerce store for laptops, PC parts, phone cases and electronics.
**Cash on delivery** — the site never handles money.

```
backend/    Express REST API  ->  PostgreSQL on Supabase     port 5000
frontend/   Next.js 16 storefront                            port 3000
docs/       Setup, API reference, roadmap
CLAUDE.md   Project context for coding agents
```

---

## Getting started

**Order matters.** Supabase first, then the backend, then the frontend. Each
step depends on the one before it working.

### 1. Supabase

Follow **[docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md)** — create the
project, run four SQL files, copy two values. About 15 minutes.

Do not skip ahead. Debugging React against a database you have not confirmed
works is miserable.

### 2. Backend

```bash
cd backend
cp .env.example .env      # fill in the two Supabase values + an admin key
npm install
npm run dev
```

Look for:

```
  Database    connected
  Storage     bucket "product-images" ready
```

Then open `http://localhost:5000/api/products` and confirm you can see product
names. A server that boots is not the same as a server that works.

### 3. Frontend

In a **second terminal**:

```bash
cd frontend
cp .env.local.example .env.local     # default already points at localhost:5000
npm install
npm run dev
```

Open `http://localhost:3000`.

Both terminals stay running while you work. When the storefront shows no
products, check the backend terminal first.

---

## Two rules worth knowing before you edit anything

**The browser never sends prices.** Checkout submits product ids and quantities
only; the server looks up prices and the delivery fee inside the transaction. If
the browser could send a price, anyone with devtools could buy a laptop for $1.

**Stock changes happen in PostgreSQL, not JavaScript.** Read-check-write in JS
has a race condition that sells the same last item twice. All stock logic lives
in `backend/db/02_functions.sql` and runs under a row lock. Never write
`UPDATE products SET stock_quantity` from a controller.

The full set is in [CLAUDE.md](CLAUDE.md).

---

## The order lifecycle

```
pending ──> confirmed ──> processing ──> shipped ──> delivered   (terminal)
   │            │              │            │
   │            │              │            └──> failed_delivery (terminal, restocks)
   └────────────┴──────────────┴──> cancelled                    (terminal, restocks)
```

`pending` exists because cash on delivery has no payment proving an order is
real. Someone phones the customer, then marks it `confirmed`. Skipping that step
is the main cause of failed deliveries.

---

## Documentation

| File | What it covers |
|---|---|
| [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md) | What to do in Supabase, and what to ignore |
| [docs/API.md](docs/API.md) | Every endpoint, filters, error codes |
| [docs/ROADMAP.md](docs/ROADMAP.md) | What to build next, in order |
| [CLAUDE.md](CLAUDE.md) | Architecture and invariants, for coding agents |
| [backend/README.md](backend/README.md) | Backend detail — stock safety, email, storage |
| [frontend/README.md](frontend/README.md) | Frontend detail — server components, caching |

---

## What's built

Backend is complete and tested: catalogue API with filtering and search, atomic
checkout, the COD lifecycle with restocking, Brevo emails, image upload, and
admin endpoints for products, stock, orders, settings and the contact inbox.

Storefront covers home, catalogue with filters, product pages, cart, checkout
and order tracking.

**Not built: the admin panel UI.** Every endpoint exists; there is no interface.
That is the next thing to build — without it you cannot add real products or
work the confirmation queue. See [docs/ROADMAP.md](docs/ROADMAP.md).

## What's verified

The SQL was tested against a live PostgreSQL instance: 8 simultaneous checkouts
for 1 unit in stock produced exactly 1 success and never went negative; failed
orders rolled back cleanly; cancelling restocked exactly once; illegal status
transitions were refused.

The frontend was type-checked and its API contract machine-checked against the
backend — every endpoint, field name, order status and error code it uses exists
server-side.

**The frontend has never been run.** It was built in a sandbox without npm
registry access, so `npm install` never happened and no page rendered in a
browser. Expect small first-boot fixes.
