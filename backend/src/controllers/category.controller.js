/**
 * Category endpoints.
 *
 * Categories form a tree (Laptops -> Gaming Laptops), so this controller can
 * return either a flat list or a nested structure for building a nav menu.
 */

import { supabase } from '../config/supabase.js';
import { ApiError } from '../utils/ApiError.js';
import { sendSuccess } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { uniqueSlug } from '../utils/slugify.js';

/** True if a slug is already taken (optionally ignoring one row, for updates). */
async function slugExists(slug, ignoreId = null) {
  let query = supabase.from('categories').select('id').eq('slug', slug).limit(1);
  if (ignoreId) query = query.neq('id', ignoreId);
  const { data, error } = await query;
  if (error) throw error;
  return data.length > 0;
}

/** Turn a flat list of categories into a nested tree in one pass. */
function buildTree(categories) {
  const byId = new Map();
  const roots = [];

  // Pass 1: index every node and give it an empty children array.
  for (const category of categories) {
    byId.set(category.id, { ...category, children: [] });
  }

  // Pass 2: attach each node to its parent, or to the root list.
  for (const category of categories) {
    const node = byId.get(category.id);
    if (category.parent_id && byId.has(category.parent_id)) {
      byId.get(category.parent_id).children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

/**
 * GET /api/categories
 * Query: format=flat|tree, parent_id, include_inactive
 */
export const listCategories = asyncHandler(async (req, res) => {
  const { format, parent_id, include_inactive } = req.query;

  let query = supabase
    .from('categories')
    .select('*')
    .order('display_order', { ascending: true })
    .order('name', { ascending: true });

  // Only an authenticated admin may see hidden categories.
  if (!include_inactive || !req.isAdmin) query = query.eq('is_active', true);
  if (parent_id) query = query.eq('parent_id', parent_id);

  const { data, error } = await query;
  if (error) throw error;

  return sendSuccess(res, format === 'tree' ? buildTree(data) : data);
});

/**
 * GET /api/categories/:idOrSlug
 * Accepts a UUID or a slug, so /api/categories/laptops works as well as an ID.
 */
export const getCategory = asyncHandler(async (req, res) => {
  const { idOrSlug } = req.params;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);

  const { data: category, error } = await supabase
    .from('categories')
    .select('*')
    .eq(isUuid ? 'id' : 'slug', idOrSlug)
    .maybeSingle();

  if (error) throw error;
  if (!category) throw ApiError.notFound('Category not found', 'CATEGORY_NOT_FOUND');
  if (!category.is_active && !req.isAdmin) {
    throw ApiError.notFound('Category not found', 'CATEGORY_NOT_FOUND');
  }

  // Include children and the spec field definitions the frontend needs to
  // render a filter sidebar for this category.
  const [{ data: children }, { data: specFields }, { count: productCount }] = await Promise.all([
    supabase.from('categories').select('*').eq('parent_id', category.id).eq('is_active', true)
      .order('display_order'),
    supabase.from('category_spec_fields').select('*').eq('category_id', category.id)
      .order('display_order'),
    supabase.from('products').select('id', { count: 'exact', head: true })
      .eq('category_id', category.id).eq('is_active', true),
  ]);

  return sendSuccess(res, {
    ...category,
    children: children || [],
    spec_fields: specFields || [],
    product_count: productCount || 0,
  });
});

/**
 * POST /api/admin/categories   (admin)
 */
export const createCategory = asyncHandler(async (req, res) => {
  const payload = { ...req.body };

  // Generate a URL slug from the name if the admin did not supply one.
  payload.slug = payload.slug
    ? await uniqueSlug(payload.slug, (s) => slugExists(s))
    : await uniqueSlug(payload.name, (s) => slugExists(s));

  // Guard against pointing a category at a parent that does not exist.
  if (payload.parent_id) {
    const { data: parent } = await supabase
      .from('categories').select('id').eq('id', payload.parent_id).maybeSingle();
    if (!parent) throw ApiError.badRequest('That parent category does not exist', 'PARENT_NOT_FOUND');
  }

  const { data, error } = await supabase
    .from('categories').insert(payload).select().single();
  if (error) throw error;

  return sendSuccess(res, data, { status: 201 });
});

/**
 * PATCH /api/admin/categories/:id   (admin)
 */
export const updateCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const payload = { ...req.body };

  const { data: existing } = await supabase
    .from('categories').select('id, slug, name').eq('id', id).maybeSingle();
  if (!existing) throw ApiError.notFound('Category not found', 'CATEGORY_NOT_FOUND');

  // A category cannot be its own parent, and cannot be a child of its own
  // descendant — that would create a cycle the tree builder loops on forever.
  if (payload.parent_id) {
    if (payload.parent_id === id) {
      throw ApiError.badRequest('A category cannot be its own parent', 'CIRCULAR_PARENT');
    }
    if (await isDescendant(payload.parent_id, id)) {
      throw ApiError.badRequest(
        'That would create a loop: the chosen parent is already below this category',
        'CIRCULAR_PARENT'
      );
    }
  }

  if (payload.slug && payload.slug !== existing.slug) {
    payload.slug = await uniqueSlug(payload.slug, (s) => slugExists(s, id));
  }

  const { data, error } = await supabase
    .from('categories').update(payload).eq('id', id).select().single();
  if (error) throw error;

  return sendSuccess(res, data);
});

/** Walks up the tree to check whether `candidateId` sits below `ancestorId`. */
async function isDescendant(candidateId, ancestorId) {
  let currentId = candidateId;
  // Bounded at 20 levels — deeper than any real category tree, and it means a
  // corrupted parent chain cannot hang the request.
  for (let depth = 0; depth < 20; depth += 1) {
    const { data } = await supabase
      .from('categories').select('parent_id').eq('id', currentId).maybeSingle();
    if (!data?.parent_id) return false;
    if (data.parent_id === ancestorId) return true;
    currentId = data.parent_id;
  }
  return false;
}

/**
 * DELETE /api/admin/categories/:id   (admin)
 *
 * Refuses to delete a category that still holds products, so you cannot orphan
 * your catalogue with one click. Move or delete the products first.
 */
export const deleteCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const { count: productCount } = await supabase
    .from('products').select('id', { count: 'exact', head: true }).eq('category_id', id);

  if (productCount > 0) {
    throw ApiError.conflict(
      `This category still contains ${productCount} product(s). Move or delete them first.`,
      'CATEGORY_NOT_EMPTY',
      { product_count: productCount }
    );
  }

  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) throw error;

  return sendSuccess(res, { id, deleted: true });
});

export default {
  listCategories, getCategory, createCategory, updateCategory, deleteCategory,
};
