# Roadmap

Ordered by what unblocks the most. Each item says what exists already, so the
work is mostly UI rather than plumbing.

---

## 1. Admin panel — build this first

Without it you cannot add real products, so nothing else matters much. Every
endpoint already exists; this is purely interface work.

All admin routes need the header `x-admin-key: <ADMIN_API_KEY>`.

**Screens, in order of usefulness:**

| Screen | Endpoints |
|---|---|
| Confirmation queue | `GET /api/admin/orders/pending-confirmation` |
| Product list + edit | `GET /api/products?include_inactive=true`, `POST`/`PATCH /api/admin/products` |
| Image upload | `POST /api/admin/products/:id/image` (multipart, field `image`) |
| Stock | `GET /api/admin/stock?low_stock_only=true`, `PATCH /api/admin/products/:id/stock` |
| Orders | `GET /api/admin/orders`, `PATCH /api/admin/orders/:id/status` |
| Dashboard | `GET /api/admin/dashboard` |
| Settings | `GET`/`PATCH /api/admin/settings` (delivery fee) |
| Contact inbox | `GET /api/admin/contact` |

**The confirmation queue is the daily job.** Cash on delivery has no payment
proving an order is real, so someone phones every new order before it ships.
The endpoint returns oldest first with `hours_waiting` on each.

**Where to build it.** Simplest is a `/admin` route group inside the existing
Next.js app, with the key kept in a server-only environment variable and calls
proxied through a Next route handler. Do **not** put `ADMIN_API_KEY` in a
`NEXT_PUBLIC_*` variable — that ships it to every visitor.

---

## 2. Real product photos

Seeded products have no images, so cards show a grey placeholder.

`POST /api/admin/products/:id/image` — multipart, field name `image`, max 5 MB,
JPEG/PNG/WebP/AVIF/GIF. Uploads to Supabase Storage and saves the URL. Replacing
an image deletes the old file, but only after the database row updates.

---

## 3. Search box

Backend already supports `?search=`, matching name, brand, SKU and short
description. Needs a form in `frontend/src/components/Header.jsx` that navigates
to `/products?search=...`.

Fifteen minutes of work, and it noticeably changes how usable the store feels.

---

## 4. Spec filter sidebar

The interesting one. `GET /api/categories/:slug` returns `spec_fields`
describing what filters that category should show — label, unit, data type,
allowed values, display order.

So the sidebar can be **generated from data**: add a row to
`category_spec_fields` and a new filter appears with no code change.

Filter with `?specs={"ram_gb":16}` — JSON in the query string. It compiles to a
Postgres `@>` containment query against a GIN index, so it stays fast.

---

## 5. Contact page

`POST /api/contact` works and emails the admin. Needs a form.

**Include the honeypot.** Render a hidden field named `website`:

```jsx
<input name="website" tabIndex={-1} autoComplete="off"
       style={{ display: 'none' }} aria-hidden="true" />
```

Humans never see it, bots fill every field they find, and the backend rejects
any submission where it is non-empty. Spam protection with no captcha.

---

## 6. Tests

Nothing is committed. The SQL logic was verified manually against a live
PostgreSQL instance — concurrency, rollback, restocking, the lifecycle — but
those checks live nowhere.

Worth writing before this handles real orders:

- Checkout deducts stock and rejects overselling
- Cancelling and failed delivery each restock exactly once
- A delivery attempt does **not** restock
- Illegal status transitions are refused
- Prices sent in a request body are ignored

---

## 7. Deployment

Backend and frontend deploy separately.

**Backend** — any Node host (Railway, Render, Fly). Set every variable from
`.env.example`, and set `FRONTEND_URL` to your real domain.

**Frontend** — Vercel is the path of least resistance for Next.js. Set
`NEXT_PUBLIC_API_URL` to the deployed backend URL.

Before going live:

- `NODE_ENV=production` on the backend (it enforces a strong `ADMIN_API_KEY`
  and stops leaking stack traces)
- `FRONTEND_URL` contains no `localhost`
- Brevo sender address verified, `EMAIL_ENABLED=true`
- Delivery fee set: `PATCH /api/admin/settings`
- Rate limits: in-memory today, correct for one server. Running more than one
  instance needs `rate-limit-redis` so they share a counter.

---

## Later, if COD gets painful

**Cash reconciliation.** The system records what to collect but not what your
courier actually handed back. If that becomes a problem, add `amount_collected`
and `cash_reconciled` to `orders`, plus a "delivered but not reconciled" report.

**SMS on dispatch.** For COD this usually beats email — customers who ignore
email still answer their phone, and the message that matters is "have this much
cash ready today". Brevo does SMS through a similar API;
`backend/src/services/email.service.js` is the pattern to copy.

**Watch `failed_delivery_rate`** on the dashboard. Above roughly 10% almost
always means orders are shipping without a confirmation call.
