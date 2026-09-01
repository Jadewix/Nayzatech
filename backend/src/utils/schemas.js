/**
 * Zod validation schemas — the contract for every request body and query string.
 *
 * This file is the single place that describes what valid input looks like. If
 * a field is not defined here, it does not reach the database. That is the
 * point: the browser can send anything, so the server decides what counts.
 */

import { z } from 'zod';

/* -------------------------------------------------------------------------
 *  Reusable pieces
 * ---------------------------------------------------------------------- */

export const uuidSchema = z.string().uuid('Must be a valid ID');

/** A price. Coerced from string because form data and query strings send text. */
const price = z.coerce
  .number()
  .nonnegative('Price cannot be negative')
  .max(9_999_999, 'Price is unrealistically large');

const stockQuantity = z.coerce
  .number()
  .int('Stock must be a whole number')
  .nonnegative('Stock cannot be negative')
  .max(1_000_000);

/**
 * Shipping address. Structured rather than free text so you can print a label,
 * sort by city, or plug in a shipping-rate API later without a migration.
 */
export const addressSchema = z.object({
  line1: z.string().trim().min(3, 'Street address is required').max(200),
  line2: z.string().trim().max(200).optional().or(z.literal('')),
  city: z.string().trim().min(1, 'City is required').max(100),
  region: z.string().trim().max(100).optional().or(z.literal('')),
  postal_code: z.string().trim().max(20).optional().or(z.literal('')),
  country: z.string().trim().min(2, 'Country is required').max(100),
});

/** Pagination shared by every list endpoint. Capped so nobody can request 1M rows. */
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100, 'Maximum 100 items per page').default(20),
});

/* -------------------------------------------------------------------------
 *  CATEGORIES
 * ---------------------------------------------------------------------- */

export const createCategorySchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  slug: z.string().trim().max(120).optional(),   // auto-generated from name if omitted
  description: z.string().trim().max(2000).optional(),
  parent_id: uuidSchema.nullable().optional(),
  image_url: z.string().url('Must be a valid URL').nullable().optional(),
  display_order: z.coerce.number().int().default(0),
  is_active: z.boolean().default(true),
});

export const updateCategorySchema = createCategorySchema.partial();

export const categoryQuerySchema = z.object({
  // "tree" returns a nested structure for the nav menu; otherwise a flat list.
  format: z.enum(['flat', 'tree']).default('flat'),
  parent_id: uuidSchema.optional(),
  include_inactive: z.coerce.boolean().default(false),
});

/* -------------------------------------------------------------------------
 *  PRODUCTS
 * ---------------------------------------------------------------------- */

export const createProductSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(200),
  slug: z.string().trim().max(220).optional(),
  sku: z.string().trim().min(1, 'SKU is required').max(60),
  category_id: uuidSchema.nullable().optional(),
  brand: z.string().trim().max(100).optional(),
  base_price: price,
  sale_price: price.nullable().optional(),
  stock_quantity: stockQuantity.default(0),
  low_stock_threshold: z.coerce.number().int().nonnegative().default(5),
  description: z.string().trim().max(20000).optional(),
  short_description: z.string().trim().max(500).optional(),
  image_url: z.string().url().nullable().optional(),
  gallery_urls: z.array(z.string().url()).max(20).default([]),
  // The flexible attribute bag: {"cpu":"i7","ram_gb":16} or
  // {"compatible_models":["iPhone 15"],"material":"TPU"}
  specs: z.record(z.any()).default({}),
  weight_grams: z.coerce.number().int().nonnegative().nullable().optional(),
  is_active: z.boolean().default(true),
  is_featured: z.boolean().default(false),
})
  // Cross-field rule: a "sale" price above the normal price is nonsense.
  .refine(
    (data) => data.sale_price == null || data.sale_price <= data.base_price,
    { message: 'Sale price cannot be higher than the base price', path: ['sale_price'] }
  );

// .partial() does not exist on a refined schema, so the update variant restates
// the shape without the refinement and re-applies it as a looser check.
export const updateProductSchema = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  slug: z.string().trim().max(220).optional(),
  sku: z.string().trim().min(1).max(60).optional(),
  category_id: uuidSchema.nullable().optional(),
  brand: z.string().trim().max(100).nullable().optional(),
  base_price: price.optional(),
  sale_price: price.nullable().optional(),
  stock_quantity: stockQuantity.optional(),
  low_stock_threshold: z.coerce.number().int().nonnegative().optional(),
  description: z.string().trim().max(20000).nullable().optional(),
  short_description: z.string().trim().max(500).nullable().optional(),
  image_url: z.string().url().nullable().optional(),
  gallery_urls: z.array(z.string().url()).max(20).optional(),
  specs: z.record(z.any()).optional(),
  weight_grams: z.coerce.number().int().nonnegative().nullable().optional(),
  is_active: z.boolean().optional(),
  is_featured: z.boolean().optional(),
});

export const productQuerySchema = paginationSchema.extend({
  category: z.string().trim().optional(),        // slug or UUID
  search: z.string().trim().max(200).optional(),
  brand: z.string().trim().max(100).optional(),
  min_price: z.coerce.number().nonnegative().optional(),
  max_price: z.coerce.number().nonnegative().optional(),
  in_stock: z.coerce.boolean().optional(),
  featured: z.coerce.boolean().optional(),
  include_inactive: z.coerce.boolean().default(false),   // admin only
  sort: z
    .enum(['newest', 'oldest', 'price_asc', 'price_desc', 'name_asc', 'name_desc'])
    .default('newest'),
  /**
   * JSONB spec filter, passed as JSON in the query string:
   *   /api/products?specs={"ram_gb":16,"gpu":"NVIDIA RTX 4070 8GB"}
   * Parsed here so the controller receives a real object.
   */
  specs: z
    .string()
    .optional()
    .transform((value, ctx) => {
      if (!value) return undefined;
      try {
        const parsed = JSON.parse(value);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          throw new Error('not an object');
        }
        return parsed;
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'specs must be a JSON object, e.g. {"ram_gb":16}',
        });
        return z.NEVER;
      }
    }),
});

/* -------------------------------------------------------------------------
 *  ORDERS
 * ---------------------------------------------------------------------- */

export const orderItemSchema = z.object({
  product_id: uuidSchema,
  quantity: z.coerce
    .number()
    .int('Quantity must be a whole number')
    .positive('Quantity must be at least 1')
    .max(1000, 'Maximum 1000 units of a single item'),
});

/**
 * NOTE what is absent: there is no `price` field, and no `total`.
 *
 * The client sends product IDs and quantities only. Prices are looked up in the
 * database inside create_order. If the client could send a price, someone would
 * edit it in devtools and buy a laptop for one dollar.
 */
export const createOrderSchema = z.object({
  customer_name: z.string().trim().min(2, 'Please enter your full name').max(150),
  customer_email: z.string().trim().toLowerCase().email('Please enter a valid email address'),
  /**
   * REQUIRED for cash on delivery, unlike a prepaid store.
   * You need it to phone the customer and confirm the order is real, and the
   * courier needs it to call from the street. An order without a reachable
   * number is an order you cannot deliver.
   */
  customer_phone: z
    .string()
    .trim()
    .min(6, 'A phone number is required so we can confirm your order and deliver it')
    .max(40)
    .regex(/^[+()\d\s-]+$/, 'Please enter a valid phone number'),
  shipping_address: addressSchema,
  notes: z.string().trim().max(1000).optional().or(z.literal('')),
  items: z
    .array(orderItemSchema)
    .min(1, 'Your cart is empty')
    .max(100, 'Too many items in one order'),
});

export const checkStockSchema = z.object({
  items: z.array(orderItemSchema).min(1, 'Send at least one item to check'),
});

/**
 * The cash-on-delivery lifecycle.
 *
 *   pending -> confirmed -> processing -> shipped -> delivered
 *                                            \-> failed_delivery
 *   (cancelled is reachable from any stage before delivery)
 *
 * The database enforces which moves are legal; this just rejects unknown words
 * early with a readable message.
 */
export const ORDER_STATUSES = [
  'pending', 'confirmed', 'processing', 'shipped',
  'delivered', 'cancelled', 'failed_delivery',
];

export const orderStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES, {
    errorMap: () => ({ message: `Status must be one of: ${ORDER_STATUSES.join(', ')}` }),
  }),
  note: z.string().trim().max(1000).optional(),
  notify_customer: z.boolean().default(true),
});

/** Logging a failed courier visit without ending the order. */
export const deliveryAttemptSchema = z.object({
  note: z.string().trim().max(500).optional(),
});

export const orderQuerySchema = paginationSchema.extend({
  status: z.enum(ORDER_STATUSES).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  search: z.string().trim().max(150).optional(),     // order number or customer name
  from_date: z.string().datetime().optional(),
  to_date: z.string().datetime().optional(),
  sort: z.enum(['newest', 'oldest', 'total_desc', 'total_asc']).default('newest'),
});

/* -------------------------------------------------------------------------
 *  CONTACT
 * ---------------------------------------------------------------------- */

export const createContactSchema = z.object({
  name: z.string().trim().min(2, 'Please enter your name').max(150),
  email: z.string().trim().toLowerCase().email('Please enter a valid email address'),
  subject: z.string().trim().max(200).optional().or(z.literal('')),
  message: z
    .string()
    .trim()
    .min(10, 'Please write at least 10 characters')
    .max(5000, 'Message is too long (5000 characters maximum)'),
  /**
   * Honeypot field. Render it hidden in your React form:
   *   <input name="website" tabIndex={-1} autoComplete="off" style={{display:'none'}} />
   * A human never sees it, so a human never fills it in. Bots fill every field
   * they find, which is how we spot them — cheaply, with no captcha.
   */
  website: z.string().max(0, 'Spam detected').optional().or(z.literal('')),
});

export const contactQuerySchema = paginationSchema.extend({
  is_read: z.coerce.boolean().optional(),
  search: z.string().trim().max(150).optional(),
});

/* -------------------------------------------------------------------------
 *  ADMIN — STOCK
 * ---------------------------------------------------------------------- */

export const updateStockSchema = z.object({
  /**
   * 'set'   — stock becomes exactly `value`. Use after a physical stock count.
   * 'delta' — stock changes BY `value`. Use when a shipment arrives (+20)
   *           or something breaks (-1). Safer under concurrency: two
   *           simultaneous deltas both apply, whereas two 'set' calls means
   *           the last one silently wins.
   */
  mode: z.enum(['set', 'delta']).default('set'),
  value: z.coerce.number().int('Stock must be a whole number'),
  reason: z
    .enum(['restock', 'manual_adjustment', 'damaged', 'returned'])
    .default('manual_adjustment'),
  note: z.string().trim().max(500).optional(),
});

export const bulkStockSchema = z.object({
  updates: z
    .array(
      z.object({
        product_id: uuidSchema,
        mode: z.enum(['set', 'delta']).default('set'),
        value: z.coerce.number().int(),
        reason: z.enum(['restock', 'manual_adjustment', 'damaged', 'returned']).default('restock'),
        note: z.string().trim().max(500).optional(),
      })
    )
    .min(1, 'Send at least one update')
    .max(200, 'Maximum 200 updates per request'),
});

export const stockQuerySchema = paginationSchema.extend({
  low_stock_only: z.coerce.boolean().default(false),
  out_of_stock_only: z.coerce.boolean().default(false),
  category: z.string().trim().optional(),
  search: z.string().trim().max(150).optional(),
});

export const idParamSchema = z.object({ id: uuidSchema });
export const slugParamSchema = z.object({ slug: z.string().trim().min(1).max(220) });

/** Accepts either a UUID or a slug, for routes that support both. */
export const idOrSlugParamSchema = z.object({
  idOrSlug: z.string().trim().min(1).max(220),
});


/* -------------------------------------------------------------------------
 *  STORE SETTINGS
 *
 *  The delivery fee lives in the database, not in .env, so you can change it
 *  from the admin panel and the next order picks it up with no redeploy.
 * ---------------------------------------------------------------------- */

export const updateSettingsSchema = z.object({
  delivery_fee: z.coerce
    .number()
    .nonnegative('Delivery fee cannot be negative')
    .max(10000)
    .optional(),
  free_delivery_threshold: z.coerce
    .number()
    .nonnegative()
    .max(1_000_000)
    .optional(),
  currency: z.string().trim().length(3, 'Use a 3-letter code such as USD').toUpperCase().optional(),
  // Setting this false pauses checkout without taking the site down —
  // useful for a stock count, a holiday, or a courier strike.
  cod_enabled: z.boolean().optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'Send at least one setting to change',
});
