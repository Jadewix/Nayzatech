/**
 * ADMIN routes — everything behind the x-admin-key header.
 *
 * requireAdmin is applied once to the whole router, so there is no way to add
 * a new admin endpoint and forget to protect it. That is the point of putting
 * the guard here rather than on each route.
 */

import { Router } from 'express';
import { requireAdmin } from '../middleware/adminAuth.js';
import { validate, requireNonEmptyBody } from '../middleware/validate.js';
import { uploadSingleImage, uploadMultipleImages } from '../middleware/upload.js';
import * as categoryController from '../controllers/category.controller.js';
import * as productController from '../controllers/product.controller.js';
import * as orderController from '../controllers/order.controller.js';
import * as contactController from '../controllers/contact.controller.js';
import * as adminController from '../controllers/admin.controller.js';
import * as settingsController from '../controllers/settings.controller.js';
import {
  createCategorySchema, updateCategorySchema,
  createProductSchema, updateProductSchema,
  orderStatusSchema, orderQuerySchema, contactQuerySchema,
  updateStockSchema, bulkStockSchema, stockQuerySchema,
  paginationSchema, idParamSchema, deliveryAttemptSchema, updateSettingsSchema,
} from '../utils/schemas.js';

const router = Router();

// One guard for every route below this line.
router.use(requireAdmin);

/* --- Dashboard --------------------------------------------------------- */
router.get('/dashboard', adminController.getDashboard);

/* --- Store settings ---------------------------------------------------- */
// Change the delivery fee here; it applies to the next order immediately.
router.get('/settings', settingsController.getSettings);
router.patch(
  '/settings',
  validate({ body: updateSettingsSchema }),
  settingsController.updateSettings
);

/* --- Categories -------------------------------------------------------- */
router.post(
  '/categories',
  validate({ body: createCategorySchema }),
  categoryController.createCategory
);
router.patch(
  '/categories/:id',
  validate({ params: idParamSchema, body: updateCategorySchema }),
  requireNonEmptyBody,
  categoryController.updateCategory
);
router.delete(
  '/categories/:id',
  validate({ params: idParamSchema }),
  categoryController.deleteCategory
);

/* --- Products ---------------------------------------------------------- */
// uploadSingleImage runs BEFORE validate: multer parses the multipart body and
// populates req.body, so zod would see an empty object if the order were flipped.
router.post(
  '/products',
  uploadSingleImage,
  validate({ body: createProductSchema }),
  productController.createProduct
);
router.patch(
  '/products/:id',
  uploadSingleImage,
  validate({ params: idParamSchema, body: updateProductSchema }),
  productController.updateProduct
);
router.delete(
  '/products/:id',
  validate({ params: idParamSchema }),
  productController.deleteProduct
);

/* --- Product images ---------------------------------------------------- */
router.post(
  '/products/:id/image',
  validate({ params: idParamSchema }),
  uploadSingleImage,
  productController.uploadProductImage
);
router.post(
  '/products/:id/gallery',
  validate({ params: idParamSchema }),
  uploadMultipleImages,
  productController.uploadProductGallery
);
router.delete(
  '/products/:id/gallery',
  validate({ params: idParamSchema }),
  productController.removeGalleryImage
);

/* --- Inventory --------------------------------------------------------- */
router.get(
  '/stock',
  validate({ query: stockQuerySchema }),
  adminController.listStock
);
router.patch(
  '/products/:id/stock',
  validate({ params: idParamSchema, body: updateStockSchema }),
  adminController.updateStock
);
router.patch(
  '/stock/bulk',
  validate({ body: bulkStockSchema }),
  adminController.bulkUpdateStock
);
router.get(
  '/products/:id/stock-history',
  validate({ params: idParamSchema, query: paginationSchema }),
  adminController.getStockHistory
);

/* --- Orders ------------------------------------------------------------ */
// Literal paths before '/orders/:id...' so they are not read as an id.
router.get('/orders/stats', orderController.getOrderStats);
// The daily queue: orders needing a confirmation call before dispatch.
router.get('/orders/pending-confirmation', orderController.listPendingConfirmation);
router.get(
  '/orders',
  validate({ query: orderQuerySchema }),
  orderController.listOrders
);
router.patch(
  '/orders/:id/status',
  validate({ params: idParamSchema, body: orderStatusSchema }),
  orderController.updateOrderStatus
);
router.patch(
  '/orders/:id',
  validate({ params: idParamSchema }),
  orderController.updateOrder
);
// Courier went and came back empty-handed. Logs the attempt; does NOT restock
// (the order is still live). Give up with status 'failed_delivery' instead.
router.post(
  '/orders/:id/delivery-attempt',
  validate({ params: idParamSchema, body: deliveryAttemptSchema }),
  orderController.recordDeliveryAttempt
);

/* --- Contact inbox ----------------------------------------------------- */
router.get(
  '/contact',
  validate({ query: contactQuerySchema }),
  contactController.listContacts
);
router.get(
  '/contact/:id',
  validate({ params: idParamSchema }),
  contactController.getContact
);
router.patch(
  '/contact/:id/read',
  validate({ params: idParamSchema }),
  contactController.markContactRead
);
router.delete(
  '/contact/:id',
  validate({ params: idParamSchema }),
  contactController.deleteContact
);

export default router;
