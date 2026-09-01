/**
 * Route table.
 *
 * Two routers, one rule that is easy to remember:
 *   /api/*        public, no auth
 *   /api/admin/*  requires the x-admin-key header
 *
 * The admin router is mounted FIRST. Express matches in registration order, so
 * this guarantees an admin path can never be captured by a public route.
 */

import { Router } from 'express';
import publicRoutes from './public.routes.js';
import adminRoutes from './admin.routes.js';
import { sendSuccess } from '../utils/response.js';

const router = Router();

/**
 * GET /api
 * A self-describing index, handy while wiring up the React client.
 */
router.get('/', (req, res) =>
  sendSuccess(res, {
    name: 'Tech Store API',
    version: '2.0.0',
    order_lifecycle: 'pending -> confirmed -> processing -> shipped -> delivered (or failed_delivery / cancelled)',
    endpoints: {
      payment: 'cash_on_delivery — this API never handles money',
      public: {
        'GET    /api/store-info': 'Delivery fee + whether orders are being accepted (?subtotal=129)',
        'GET    /api/categories': 'List categories (?format=tree for nested)',
        'GET    /api/categories/:idOrSlug': 'One category with children and spec fields',
        'GET    /api/products': 'Browse products (filter, search, sort, paginate)',
        'GET    /api/products/:idOrSlug': 'One product with related items',
        'GET    /api/products/:id/stock': 'Live stock for one product',
        'POST   /api/orders': 'Place an order (checkout) — phone number required',
        'POST   /api/orders/check-stock': 'Pre-checkout availability + delivery fee',
        'GET    /api/orders/:id': 'Order by id',
        'GET    /api/orders/lookup': 'Order by ?order_number= and ?email=',
        'POST   /api/contact': 'Submit the contact form',
      },
      admin: {
        _auth: 'Send the header: x-admin-key: <ADMIN_API_KEY>',
        'GET    /api/admin/dashboard': 'Summary stats for the admin home screen',
        'GET    /api/admin/settings': 'Read store settings',
        'PATCH  /api/admin/settings': 'Change the delivery fee — applies to new orders immediately',
        'POST   /api/admin/categories': 'Create a category',
        'PATCH  /api/admin/categories/:id': 'Update a category',
        'DELETE /api/admin/categories/:id': 'Delete an empty category',
        'POST   /api/admin/products': 'Create a product (JSON or multipart with "image")',
        'PATCH  /api/admin/products/:id': 'Update a product',
        'DELETE /api/admin/products/:id': 'Soft delete (?hard=true to remove)',
        'POST   /api/admin/products/:id/image': 'Replace the primary image',
        'POST   /api/admin/products/:id/gallery': 'Add gallery images',
        'DELETE /api/admin/products/:id/gallery': 'Remove one gallery image',
        'GET    /api/admin/stock': 'Inventory overview (?low_stock_only=true)',
        'PATCH  /api/admin/products/:id/stock': 'Set or shift stock',
        'PATCH  /api/admin/stock/bulk': 'Update many products at once',
        'GET    /api/admin/products/:id/stock-history': 'Audit trail for one product',
        'GET    /api/admin/orders': 'List orders',
        'GET    /api/admin/orders/stats': 'Sales figures (revenue = delivered orders only)',
        'GET    /api/admin/orders/pending-confirmation': 'Daily queue: orders needing a confirmation call',
        'PATCH  /api/admin/orders/:id/status': 'Move through the lifecycle (cancel/fail restocks)',
        'POST   /api/admin/orders/:id/delivery-attempt': 'Log a failed courier visit (does NOT restock)',
        'PATCH  /api/admin/orders/:id': 'Correct phone, address or internal notes',
        'GET    /api/admin/contact': 'Contact inbox',
        'GET    /api/admin/contact/:id': 'Read one message (marks it read)',
        'PATCH  /api/admin/contact/:id/read': 'Toggle read state',
        'DELETE /api/admin/contact/:id': 'Delete a message',
      },
    },
  })
);

router.use('/admin', adminRoutes);
router.use('/', publicRoutes);

export default router;
