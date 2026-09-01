# API reference

Base URL in development: `http://localhost:5000`
Live index of every route: `GET /api`

Every response:

```jsonc
{ "success": true,  "data": ..., "meta": { "pagination": {...} } }
{ "success": false, "error": { "code": "...", "message": "...", "details": {...} } }
```

---

## Public

| Method | Path | Notes |
|---|---|---|
| GET | `/api/store-info` | Delivery fee, whether ordering is open. `?subtotal=129` for the exact fee |
| GET | `/api/categories` | `?format=tree` for nested |
| GET | `/api/categories/:idOrSlug` | Includes children and `spec_fields` |
| GET | `/api/products` | See filters below |
| GET | `/api/products/:idOrSlug` | Includes `spec_fields` and `related_products` |
| GET | `/api/products/:id/stock` | Live, never cached |
| POST | `/api/orders` | Checkout |
| POST | `/api/orders/check-stock` | Availability + totals, before checkout |
| GET | `/api/orders/:id` | Tracking link — the UUID is the credential |
| GET | `/api/orders/lookup` | `?order_number=` **and** `?email=`, both required |
| POST | `/api/contact` | Contact form |

### Product filters

```
?category=gaming-laptops     slug or UUID; a parent includes its children
?search=thinkpad             name, brand, SKU, short description
?brand=Nexus
?min_price=1000&max_price=2000
?in_stock=true
?featured=true
?specs={"ram_gb":16}         JSON, matched against the JSONB column
?sort=newest|oldest|price_asc|price_desc|name_asc|name_desc
?page=2&limit=12             limit caps at 100
```

### Checkout

```jsonc
POST /api/orders
{
  "customer_name": "Jad Khoury",
  "customer_email": "jad@example.com",
  "customer_phone": "+961 70 123 456",     // required for COD
  "shipping_address": {
    "line1": "12 Rue Gouraud",
    "line2": "",                            // optional
    "city": "Beirut",
    "region": "",                           // optional
    "postal_code": "",                      // optional
    "country": "Lebanon"
  },
  "notes": "Ring the bell twice",           // optional
  "items": [{ "product_id": "uuid", "quantity": 2 }]
}
```

No prices, no total, no delivery fee. The server computes all of them.

Returns the order with `subtotal`, `delivery_fee`, `total_amount` (the cash to
collect), `order_number`, and `confirmation_email_sent`.

---

## Admin

Every route needs `x-admin-key: <ADMIN_API_KEY>`.

| Method | Path | Notes |
|---|---|---|
| GET | `/api/admin/dashboard` | One call for the whole admin home screen |
| GET/PATCH | `/api/admin/settings` | Delivery fee, threshold, currency, `cod_enabled` |
| GET | `/api/admin/orders` | Filter by status, email, date; search |
| GET | `/api/admin/orders/stats` | Revenue = delivered orders only |
| GET | `/api/admin/orders/pending-confirmation` | The daily queue |
| PATCH | `/api/admin/orders/:id/status` | Lifecycle; cancel and fail restock |
| POST | `/api/admin/orders/:id/delivery-attempt` | Logs a failed visit; does **not** restock |
| PATCH | `/api/admin/orders/:id` | Correct phone, address, internal notes |
| POST/PATCH/DELETE | `/api/admin/products[/:id]` | `?hard=true` to really delete |
| POST | `/api/admin/products/:id/image` | multipart, field `image` |
| POST | `/api/admin/products/:id/gallery` | multipart, field `images`, up to 10 |
| GET | `/api/admin/stock` | `?low_stock_only=true` |
| PATCH | `/api/admin/products/:id/stock` | `{ mode: "set"\|"delta", value, reason }` |
| PATCH | `/api/admin/stock/bulk` | Up to 200 at once |
| GET | `/api/admin/products/:id/stock-history` | Audit trail |
| POST/PATCH/DELETE | `/api/admin/categories[/:id]` | |
| GET | `/api/admin/contact` | Inbox. `?is_read=false` |

### Stock: `set` vs `delta`

```jsonc
{ "mode": "set",   "value": 25 }   // "there are exactly 25 on the shelf"
{ "mode": "delta", "value": 20 }   // "20 more arrived"
{ "mode": "delta", "value": -1 }   // "one broke"
```

Prefer `delta`. Two simultaneous deltas both apply; two `set` calls means the
last one silently wins.

---

## Error codes worth handling

| Code | Status | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 422 | `details` maps field → message |
| `INSUFFICIENT_STOCK` | 409 | Sold out while they were shopping |
| `PRODUCT_UNAVAILABLE` | 409 | Product deactivated |
| `CHECKOUT_CLOSED` | 400 | `cod_enabled` is false |
| `PHONE_REQUIRED` | 400 | COD needs a contact number |
| `INVALID_TRANSITION` | 409 | Illegal status move; message lists what is allowed |
| `ORDER_NOT_FOUND` | 404 | |
| `ADMIN_KEY_INVALID` | 401 | |
| `RATE_LIMIT_EXCEEDED` | 429 | |

---

## Rate limits

| Scope | Limit |
|---|---|
| All `/api/*` | 300 per 15 min |
| Checkout | 10 per hour |
| Contact form | 5 per hour |
| Admin | 30 per 15 min (failed attempts only) |

Per IP, in memory. Multiple server instances need `rate-limit-redis`.
