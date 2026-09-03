/**
 * Product endpoints — the busiest part of the API.
 *
 * Handles catalogue browsing (filter, search, sort, paginate) for the
 * storefront, and full CRUD plus image management for the admin dashboard.
 */

import { supabase } from '../config/supabase.js';
import { ApiError } from '../utils/ApiError.js';
import { sendSuccess, buildPagination } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { uniqueSlug } from '../utils/slugify.js';
import { uploadImage, uploadImages, deleteImage } from '../services/storage.service.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function slugExists(slug, ignoreId = null) {
  let query = supabase.from('products').select('id').eq('slug', slug).limit(1);
  if (ignoreId) query = query.neq('id', ignoreId);
  const { data, error } = await query;
  if (error) throw error;
  return data.length > 0;
}

/**
 * GET /api/products
 *
 * Every filter is optional and they combine freely:
 *   ?category=gaming-laptops&min_price=1000&max_price=2000&in_stock=true
 *   ?search=thinkpad&sort=price_asc&page=2&limit=12
 *   ?specs={"ram_gb":16}
 *
 * Pagination is enforced (max 100 per page), because an unbounded catalogue
 * query is how a store falls over on its first busy day.
 */
export const listProducts = asyncHandler(async (req, res) => {
  const {
    page, limit, category, search, brand, min_price, max_price,
    in_stock, featured, include_inactive, sort, specs,
  } = req.query;

  // The view carries category_name and effective_price already joined.
  let query = supabase
    .from('products_with_category')
    .select('*', { count: 'exact' });

  // --- Visibility ---------------------------------------------------------
  // Draft products are admin-only. Without this check, an unreleased product
  // would be one URL guess away from public.
  if (!(include_inactive && req.isAdmin)) query = query.eq('is_active', true);

  // --- Category (accepts a slug or a UUID) --------------------------------
  if (category) {
    if (UUID_PATTERN.test(category)) {
      query = query.eq('category_id', category);
    } else {
      // Include child categories, so browsing "Laptops" also shows the gaming
      // and business laptops nested underneath it.
      const { data: matched } = await supabase
        .from('categories').select('id').eq('slug', category).maybeSingle();

      if (!matched) {
        return sendSuccess(res, [], {
          meta: buildPagination({ total: 0, page, limit }),
        });
      }

      const { data: children } = await supabase
        .from('categories').select('id').eq('parent_id', matched.id);

      const categoryIds = [matched.id, ...(children || []).map((c) => c.id)];
      query = query.in('category_id', categoryIds);
    }
  }

  // --- Text search --------------------------------------------------------
  if (search) {
    // Escape PostgREST's or() delimiters so a search for "a,b" cannot break
    // out of the filter expression.
    const term = search.replace(/[%,()]/g, ' ').trim();
    if (term) {
      query = query.or(
        `name.ilike.%${term}%,brand.ilike.%${term}%,sku.ilike.%${term}%,short_description.ilike.%${term}%`
      );
    }
  }

  if (brand) query = query.ilike('brand', brand);
  if (min_price !== undefined) query = query.gte('effective_price', min_price);
  if (max_price !== undefined) query = query.lte('effective_price', max_price);
  // Passed through as-is, so ?in_stock=false is a real filter for sold-out
  // items and not just an ignored parameter.
  if (in_stock !== undefined) query = query.eq('in_stock', in_stock);
  if (featured === true) query = query.eq('is_featured', true);

  // --- JSONB spec filtering ----------------------------------------------
  // `contains` compiles to Postgres's @> operator, which uses the GIN index on
  // products.specs. This is what makes {"ram_gb":16} fast on a large catalogue.
  if (specs && Object.keys(specs).length > 0) {
    query = query.contains('specs', specs);
  }

  // --- Sorting ------------------------------------------------------------
  const sortMap = {
    newest:     { column: 'created_at',      ascending: false },
    oldest:     { column: 'created_at',      ascending: true  },
    price_asc:  { column: 'effective_price', ascending: true  },
    price_desc: { column: 'effective_price', ascending: false },
    name_asc:   { column: 'name',            ascending: true  },
    name_desc:  { column: 'name',            ascending: false },
  };
  const { column, ascending } = sortMap[sort] || sortMap.newest;
  query = query.order(column, { ascending });

  // --- Pagination ---------------------------------------------------------
  const from = (page - 1) * limit;
  query = query.range(from, from + limit - 1);

  const { data, error, count } = await query;
  if (error) throw error;

  return sendSuccess(res, data, {
    meta: buildPagination({ total: count ?? 0, page, limit }),
  });
});

/**
 * GET /api/products/:idOrSlug
 * Accepts a UUID or a slug, so React can route on the pretty URL.
 */
export const getProduct = asyncHandler(async (req, res) => {
  const { idOrSlug } = req.params;
  const isUuid = UUID_PATTERN.test(idOrSlug);

  const { data: product, error } = await supabase
    .from('products_with_category')
    .select('*')
    .eq(isUuid ? 'id' : 'slug', idOrSlug)
    .maybeSingle();

  if (error) throw error;
  if (!product) throw ApiError.notFound('Product not found', 'PRODUCT_NOT_FOUND');

  // A hidden product returns 404, not 403 — do not confirm it exists.
  if (!product.is_active && !req.isAdmin) {
    throw ApiError.notFound('Product not found', 'PRODUCT_NOT_FOUND');
  }

  // Spec field definitions let the frontend render a labelled spec table
  // ("RAM: 16 GB") instead of dumping raw JSON keys.
  const [{ data: specFields }, { data: related }] = await Promise.all([
    product.category_id
      ? supabase.from('category_spec_fields').select('*')
          .eq('category_id', product.category_id).order('display_order')
      : Promise.resolve({ data: [] }),
    product.category_id
      ? supabase.from('products_with_category').select('*')
          .eq('category_id', product.category_id).eq('is_active', true)
          .neq('id', product.id).limit(4)
      : Promise.resolve({ data: [] }),
  ]);

  return sendSuccess(res, {
    ...product,
    spec_fields: specFields || [],
    related_products: related || [],
  });
});

/**
 * GET /api/products/:id/availability
 *
 * Lightweight "can this still be ordered" check for a product page, without
 * refetching the whole record. An inactive product reads as unavailable even
 * if its in_stock flag is true — being unpublished outranks being in stock.
 */
export const getProductAvailability = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const { data, error } = await supabase
    .from('products')
    .select('id, name, is_active, in_stock')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw ApiError.notFound('Product not found', 'PRODUCT_NOT_FOUND');

  return sendSuccess(res, {
    product_id: data.id,
    name: data.name,
    in_stock: data.is_active && data.in_stock,
  });
});

/**
 * POST /api/admin/products   (admin)
 *
 * Accepts JSON, or multipart/form-data with an `image` file. When a file is
 * present it goes to Supabase Storage first and the returned URL is saved on
 * the product row.
 */
export const createProduct = asyncHandler(async (req, res) => {
  const payload = { ...req.body };

  payload.slug = payload.slug
    ? await uniqueSlug(payload.slug, (s) => slugExists(s))
    : await uniqueSlug(payload.name, (s) => slugExists(s));

  // SKUs must be unique — catch it here to return a friendly 409 rather than a
  // raw Postgres unique-violation.
  const { data: duplicateSku } = await supabase
    .from('products').select('id').eq('sku', payload.sku).maybeSingle();
  if (duplicateSku) {
    throw ApiError.conflict(`SKU "${payload.sku}" is already used by another product`, 'DUPLICATE_SKU');
  }

  // Upload the image before inserting, so we never create a product row that
  // points at a file that failed to upload.
  if (req.file) {
    const uploaded = await uploadImage(req.file, { folder: 'products' });
    payload.image_url = uploaded.url;
  }

  const { data, error } = await supabase
    .from('products').insert(payload).select().single();

  if (error) {
    // The product row failed, so the image we just uploaded is now an orphan.
    if (payload.image_url) await deleteImage(payload.image_url);
    throw error;
  }

  return sendSuccess(res, data, { status: 201 });
});

/**
 * PATCH /api/admin/products/:id   (admin)
 */
export const updateProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const payload = { ...req.body };

  const { data: existing } = await supabase
    .from('products').select('id, slug, sku, image_url').eq('id', id).maybeSingle();
  if (!existing) throw ApiError.notFound('Product not found', 'PRODUCT_NOT_FOUND');

  if (payload.sku && payload.sku !== existing.sku) {
    const { data: duplicate } = await supabase
      .from('products').select('id').eq('sku', payload.sku).neq('id', id).maybeSingle();
    if (duplicate) {
      throw ApiError.conflict(`SKU "${payload.sku}" is already used by another product`, 'DUPLICATE_SKU');
    }
  }

  if (payload.slug && payload.slug !== existing.slug) {
    payload.slug = await uniqueSlug(payload.slug, (s) => slugExists(s, id));
  }

  let replacedImageUrl = null;
  if (req.file) {
    const uploaded = await uploadImage(req.file, { folder: 'products' });
    payload.image_url = uploaded.url;
    replacedImageUrl = existing.image_url;   // clean up only after the row saves
  }

  const { data, error } = await supabase
    .from('products').update(payload).eq('id', id).select().single();
  if (error) throw error;

  // Now that the update succeeded, remove the image it replaced. Doing this
  // earlier would leave the product imageless if the update then failed.
  if (replacedImageUrl) await deleteImage(replacedImageUrl);

  return sendSuccess(res, data);
});

/**
 * POST /api/admin/products/:id/image    (admin)
 * Replaces the primary image. Field name: `image`.
 */
export const uploadProductImage = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!req.file) throw ApiError.badRequest('No image was uploaded. Use the "image" field.', 'NO_FILE');

  const { data: product } = await supabase
    .from('products').select('id, image_url').eq('id', id).maybeSingle();
  if (!product) throw ApiError.notFound('Product not found', 'PRODUCT_NOT_FOUND');

  const uploaded = await uploadImage(req.file, { folder: 'products' });

  const { data, error } = await supabase
    .from('products').update({ image_url: uploaded.url }).eq('id', id)
    .select('id, name, image_url').single();
  if (error) {
    await deleteImage(uploaded.url);   // roll back the orphaned upload
    throw error;
  }

  if (product.image_url) await deleteImage(product.image_url);

  return sendSuccess(res, { ...data, upload: uploaded });
});

/**
 * POST /api/admin/products/:id/gallery   (admin)
 * Appends images to the gallery. Field name: `images` (up to 10).
 */
export const uploadProductGallery = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!req.files?.length) {
    throw ApiError.badRequest('No images were uploaded. Use the "images" field.', 'NO_FILES');
  }

  const { data: product } = await supabase
    .from('products').select('id, gallery_urls').eq('id', id).maybeSingle();
  if (!product) throw ApiError.notFound('Product not found', 'PRODUCT_NOT_FOUND');

  const uploaded = await uploadImages(req.files, { folder: 'products/gallery' });
  const gallery = [...(product.gallery_urls || []), ...uploaded.map((u) => u.url)].slice(0, 20);

  const { data, error } = await supabase
    .from('products').update({ gallery_urls: gallery }).eq('id', id)
    .select('id, name, gallery_urls').single();
  if (error) throw error;

  return sendSuccess(res, data);
});

/**
 * DELETE /api/admin/products/:id/gallery   (admin)
 * Body: { "image_url": "https://..." }
 */
export const removeGalleryImage = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { image_url: imageUrl } = req.body;
  if (!imageUrl) throw ApiError.badRequest('Send the image_url to remove', 'MISSING_IMAGE_URL');

  const { data: product } = await supabase
    .from('products').select('id, gallery_urls').eq('id', id).maybeSingle();
  if (!product) throw ApiError.notFound('Product not found', 'PRODUCT_NOT_FOUND');

  const gallery = (product.gallery_urls || []).filter((url) => url !== imageUrl);

  const { data, error } = await supabase
    .from('products').update({ gallery_urls: gallery }).eq('id', id)
    .select('id, gallery_urls').single();
  if (error) throw error;

  await deleteImage(imageUrl);
  return sendSuccess(res, data);
});

/**
 * DELETE /api/admin/products/:id   (admin)
 *
 * Soft-deletes by default (is_active = false), which is almost always what you
 * want: the product disappears from the store but historical orders still
 * reference it. Pass ?hard=true to remove the row permanently.
 */
export const deleteProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const hardDelete = req.query.hard === 'true' || req.query.hard === true;

  const { data: product } = await supabase
    .from('products').select('id, name, image_url, gallery_urls').eq('id', id).maybeSingle();
  if (!product) throw ApiError.notFound('Product not found', 'PRODUCT_NOT_FOUND');

  if (!hardDelete) {
    const { data, error } = await supabase
      .from('products').update({ is_active: false }).eq('id', id)
      .select('id, name, is_active').single();
    if (error) throw error;
    return sendSuccess(res, { ...data, deleted: 'soft' });
  }

  // Hard delete: order_items.product_id is ON DELETE SET NULL, so past orders
  // keep their snapshot of the name, SKU and price they were bought at.
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) throw error;

  // Clean up storage so you are not paying to host images nothing points at.
  await Promise.allSettled([
    product.image_url ? deleteImage(product.image_url) : null,
    ...(product.gallery_urls || []).map((url) => deleteImage(url)),
  ]);

  return sendSuccess(res, { id, name: product.name, deleted: 'hard' });
});

export default {
  listProducts, getProduct, getProductAvailability, createProduct, updateProduct,
  uploadProductImage, uploadProductGallery, removeGalleryImage, deleteProduct,
};
