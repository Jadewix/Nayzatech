# Tech Store — Storefront

Next.js 16 (App Router) storefront for the tech store backend. Cash on delivery.

## Start it

The backend must be running first — this app is useless without it.

```bash
# 1. Install
npm install

# 2. Point it at your backend
cp .env.local.example .env.local
#    the default (http://localhost:5000) is already correct for local dev

# 3. Run
npm run dev
```

Open http://localhost:3000.

> **Two terminals.** The backend runs on `5000`, this runs on `3000`, and they stay running side by side. When a page shows no products, the first thing to check is whether the backend terminal is still alive.

## What's here

| Route | What it does |
|---|---|
| `/` | Homepage — featured products, categories, new arrivals |
| `/products` | Catalogue with category, sort, stock and price filters |
| `/products/[slug]` | Product page with specs, gallery and add-to-cart |
| `/cart` | Cart with server-calculated totals |
| `/checkout` | COD checkout — name, phone, address |
| `/orders/[id]` | Order confirmation and tracking |
| `/track` | Find an order by number + email |

## Why Next.js and not plain React

Because product pages need to be findable on Google.

Pages here are **server components** by default — they fetch data on the server and send finished HTML. A crawler visiting `/products/raptor-15-rtx-gaming-laptop` sees the product name, description, specs and price in the HTML. A client-rendered React app would send an empty `<div>` and a JavaScript bundle, and the crawler would index nothing.

`generateMetadata` in `src/app/products/[slug]/page.jsx` is what puts the real product name into the `<title>` and social preview tags.

Only four things are client components, marked with `'use client'` at the top, because they need state or click handlers:

- `CartProvider` — holds the cart
- `Header` — shows the cart count
- `AddToCart` — quantity picker and button
- The cart, checkout and track pages — forms

Everything else runs on the server. Keep it that way where you can; `'use client'` at the top of a page opts that whole page out of server rendering, and with it the SEO.

## The one rule about money

**The browser never decides what anything costs.**

The cart stores a price alongside each item, but that is only so the cart page can render without re-fetching. Totals shown to the customer come from the server (`POST /api/orders/check-stock`), and the checkout request sends **only product ids and quantities**:

```js
createOrder({
  customer_name, customer_email, customer_phone,
  shipping_address: { line1, city, country, ... },
  items: [{ product_id, quantity }],   // no prices, no total, no delivery fee
})
```

The server looks up real prices and the current delivery fee inside the checkout transaction. If the browser could send a price, anyone with devtools could buy a laptop for one dollar.

The same reasoning applies to the delivery fee: it lives in your database, and the cart *displays* it by asking the server, never by calculating it.

## How data flows

Everything goes through `src/lib/api.js`. Nothing else calls `fetch`.

Every backend response has the same shape, so the wrapper unwraps it once:

```js
// The backend sends:  { success: true, data: [...] }
// You get back:       [...]
const products = await getProducts({ category: 'laptops' });
```

Failures throw an `ApiError` carrying a `code` you can branch on:

```js
try {
  await createOrder(payload);
} catch (err) {
  if (err.code === 'INSUFFICIENT_STOCK') { /* someone bought the last one */ }
  if (err.code === 'VALIDATION_ERROR')   { /* err.details maps field -> message */ }
}
```

`VALIDATION_ERROR` is the useful one: `err.details` is `{ "customer_phone": "A phone number is required..." }`, which the checkout puts directly under the offending input.

### Caching

Next.js caches server-side fetches by default, which would happily show stock from an hour ago. `api.js` is explicit about it:

- Catalogue pages: `revalidate: 60` — re-fetch at most once a minute
- Stock, cart totals, orders: `revalidate: false` — never cached

If you add an endpoint that must always be live, pass `revalidate: false`.

## Cash on delivery in the UI

COD changes three things you would not do in a prepaid store:

**Phone is required.** The shop calls to confirm the order is real before dispatching, and the courier calls from the street. The backend rejects an order without one.

**The total is a cash instruction, not a receipt.** It gets its own green panel on checkout and on the order page, because a customer who answers the door without the right money means a wasted courier trip.

**The order page is the tracking link.** Order ids are unguessable UUIDs, so `/orders/<id>` works with no login — the same idea as a parcel-tracking link. It is emailed to the customer and it is where checkout lands.

## Styling

Tailwind CSS v4. If you have seen a guide with a big `tailwind.config.js`, that was v3 — in v4 the theme lives in CSS, in the `@theme` block at the top of `src/app/globals.css`:

```css
@theme {
  --color-brand: #16515f;
  --color-cash:  #1f6b45;
}
```

Defining `--color-brand` there automatically gives you `text-brand`, `bg-brand`, `border-brand`. Change the hex, and every use of it updates.

The palette is deliberately small: `ink` / `muted` / `faint` for text, `paper` / `surface` for backgrounds, `line` for borders, `brand` for links and buttons, `cash` for anything about paying the courier, `alert` for problems.

## Adding a page

Create a folder under `src/app/` with a `page.jsx` inside. The folder name is the URL.

```
src/app/about/page.jsx     ->  /about
src/app/help/[topic]/page.jsx  ->  /help/shipping
```

Dynamic segments arrive as a promise in Next.js 16, so remember to await:

```js
export default async function Page({ params }) {
  const { topic } = await params;   // not `params.topic`
}
```

Forgetting the `await` is the single most common Next.js 15/16 error, and the message it produces is not obvious.

## What isn't built yet

- **The admin panel.** Product management, image upload, the confirmation-call queue and stock editing. All the endpoints exist (`/api/admin/*`, guarded by the `x-admin-key` header) — there is just no UI. Build it as a separate app, or under `/admin` here behind a password.
- **Search UI.** The backend supports `?search=`, but there is no search box in the header yet.
- **Spec filters.** The backend supports `?specs={"ram_gb":16}` and returns the field definitions to build the UI from (`spec_fields` on a category), but the sidebar only filters by category and sort.
- **A contact page.** `POST /api/contact` works and emails you; it has no form yet. Remember the honeypot: render a hidden `website` input, and bots fill it in while humans never see it.
- **Real images.** Seeded products have no photos. Upload via `POST /api/admin/products/:id/image` and the cards fill in.

## Verified, and not

Every file was type-checked for syntax and JSX correctness, and the API contract was machine-checked against the backend — every endpoint, field name, order status and error code the frontend uses exists on the server side.

**Not verified:** the app has never actually run. The sandbox this was built in has no access to the npm registry, so `npm install` never happened and no page was rendered in a browser. Expect small runtime issues on first boot — a missing import, a Tailwind class that needs adjusting. The logic and the contract are sound; the pixels are unproven.
