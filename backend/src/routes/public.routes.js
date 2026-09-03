/**
 * PUBLIC routes — everything your React storefront calls.
 *
 * No authentication. These endpoints only ever expose active products and
 * categories, and orders are only reachable by their unguessable UUID.
 */

import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { detectAdmin } from '../middleware/adminAuth.js';
import * as categoryController from '../controllers/category.controller.js';
import * as productController from '../controllers/product.controller.js';
import * as orderController from '../controllers/order.controller.js';
import * as contactController from '../controllers/contact.controller.js';
import * as settingsController from '../controllers/settings.controller.js';
import {
  categoryQuerySchema, productQuerySchema, createOrderSchema,
  checkAvailabilitySchema, createContactSchema, idParamSchema, idOrSlugParamSchema,
} from '../utils/schemas.js';
import { checkoutLimiter, contactLimiter } from '../middleware/rateLimit.js';

const router = Router();

// detectAdmin does not block anyone — it just flags admin requests so an admin
// browsing the storefront can also see draft products.
router.use(detectAdmin);

/* --- Store info -------------------------------------------------------- */
// The cart calls this to show the delivery charge before checkout.
// Pass ?subtotal=129 to get the exact fee for that basket.
router.get('/store-info', settingsController.getStoreInfo);

/* --- Categories -------------------------------------------------------- */
router.get(
  '/categories',
  validate({ query: categoryQuerySchema }),
  categoryController.listCategories
);
router.get(
  '/categories/:idOrSlug',
  validate({ params: idOrSlugParamSchema }),
  categoryController.getCategory
);

/* --- Products ---------------------------------------------------------- */
router.get(
  '/products',
  validate({ query: productQuerySchema }),
  productController.listProducts
);
router.get(
  '/products/:id/availability',
  validate({ params: idParamSchema }),
  productController.getProductAvailability
);
// Registered LAST of the product routes: ':idOrSlug' matches anything, so it
// would otherwise swallow '/products/:id/availability' before that route is reached.
router.get(
  '/products/:idOrSlug',
  validate({ params: idOrSlugParamSchema }),
  productController.getProduct
);

/* --- Orders ------------------------------------------------------------ */
// Rate limited: checkout writes to the database and sends email, so it is the
// most expensive public endpoint and the most worth abusing.
router.post(
  '/orders',
  checkoutLimiter,
  validate({ body: createOrderSchema }),
  orderController.createOrder
);
router.post(
  '/orders/check-availability',
  validate({ body: checkAvailabilitySchema }),
  orderController.checkAvailability
);
// Before '/orders/:id', or 'lookup' would be read as an order id.
router.get('/orders/lookup', orderController.lookupOrder);
router.get(
  '/orders/:id',
  validate({ params: idParamSchema }),
  orderController.getOrder
);

/* --- Contact ----------------------------------------------------------- */
router.post(
  '/contact',
  contactLimiter,
  validate({ body: createContactSchema }),
  contactController.submitContact
);

export default router;
