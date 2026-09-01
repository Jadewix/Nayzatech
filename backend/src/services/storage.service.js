/**
 * Product image uploads to Supabase Storage.
 *
 * THE FLOW
 *   1. React sends a multipart POST with the image file
 *   2. multer holds the bytes in memory (src/middleware/upload.js)
 *   3. this service pushes them to the `product-images` bucket
 *   4. Supabase returns a permanent public URL
 *   5. that URL is saved in products.image_url
 *
 * The bucket is public, so the returned URL drops straight into an <img src>
 * with no signed-URL round trip. Uploading still requires the service_role key,
 * so only this server can put files there.
 */

import path from 'node:path';
import crypto from 'node:crypto';
import { supabase } from '../config/supabase.js';
import { ApiError } from '../utils/ApiError.js';
import config from '../config/env.js';

const BUCKET = config.supabase.storageBucket;

/**
 * Build a collision-proof storage path.
 *
 * Two customers uploading "laptop.jpg" must not overwrite each other, so the
 * filename gets a timestamp and random suffix. The original name is kept
 * (slugified) so files are still recognisable when you browse the bucket.
 *
 * Result: products/2026/08/laptop-photo-1756036800000-a3f9c1.jpg
 */
function buildStoragePath(originalName, folder = 'products') {
  const extension = (path.extname(originalName) || '.jpg').toLowerCase();
  const base = path
    .basename(originalName, path.extname(originalName))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'image';

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const unique = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

  // Year/month folders keep the bucket browsable once you have thousands of files.
  return `${folder}/${year}/${month}/${base}-${unique}${extension}`;
}

/**
 * Upload one image and return its public URL.
 *
 * @param {object} file           A multer file object
 * @param {Buffer} file.buffer    The image bytes
 * @param {string} file.originalname
 * @param {string} file.mimetype
 * @param {object} [options]
 * @param {string} [options.folder='products']  Subfolder inside the bucket
 * @returns {Promise<{url: string, path: string, size: number, mime_type: string}>}
 */
export async function uploadImage(file, { folder = 'products' } = {}) {
  if (!file?.buffer) {
    throw ApiError.badRequest('No image file was received.', 'NO_FILE');
  }

  if (!config.uploads.allowedMimeTypes.includes(file.mimetype)) {
    throw ApiError.badRequest(
      `Unsupported image type "${file.mimetype}".`,
      'INVALID_FILE_TYPE'
    );
  }

  if (file.size > config.uploads.maxFileSizeBytes) {
    throw ApiError.badRequest(
      `That image is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${
        config.uploads.maxFileSizeBytes / 1024 / 1024
      } MB.`,
      'FILE_TOO_LARGE'
    );
  }

  const storagePath = buildStoragePath(file.originalname, folder);

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file.buffer, {
      contentType: file.mimetype,
      // upsert:false means a path collision errors instead of silently
      // replacing someone else's image. Our paths are unique anyway; this is
      // a safety net.
      upsert: false,
      // Tell browsers and CDNs to cache aggressively — these files never change
      // (a new upload gets a new path), so a long cache is free performance.
      cacheControl: '31536000',
    });

  if (error) {
    if (/bucket not found/i.test(error.message)) {
      throw ApiError.internal(
        `Storage bucket "${BUCKET}" does not exist. Run db/03_security.sql in Supabase.`,
        'BUCKET_NOT_FOUND'
      );
    }
    throw ApiError.internal(`Image upload failed: ${error.message}`, 'UPLOAD_FAILED');
  }

  const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);

  return {
    url: publicUrlData.publicUrl,
    path: storagePath,
    size: file.size,
    mime_type: file.mimetype,
  };
}

/**
 * Upload several images at once (a product gallery).
 * Uploads run in parallel; if any one fails, the successful ones are cleaned up
 * so you are not left with orphaned files nobody references.
 *
 * @param {Array} files
 * @param {object} [options]
 * @returns {Promise<Array<{url: string, path: string}>>}
 */
export async function uploadImages(files, options = {}) {
  if (!Array.isArray(files) || files.length === 0) {
    throw ApiError.badRequest('No image files were received.', 'NO_FILES');
  }

  const results = await Promise.allSettled(files.map((file) => uploadImage(file, options)));

  const succeeded = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  const failed = results.filter((r) => r.status === 'rejected');

  if (failed.length > 0) {
    // Roll back: remove what did upload, so the bucket does not fill with files
    // that no database row points at.
    await Promise.allSettled(succeeded.map((item) => deleteImage(item.path)));
    throw ApiError.badRequest(
      `${failed.length} of ${files.length} images failed to upload. ${failed[0].reason?.message || ''}`.trim(),
      'BATCH_UPLOAD_FAILED'
    );
  }

  return succeeded;
}

/**
 * Delete an image from storage.
 *
 * Accepts either a storage path ("products/2026/08/x.jpg") or a full public URL,
 * because controllers usually only have the URL saved in the database.
 *
 * Never throws: a failed cleanup should not fail the request that triggered it.
 * The worst case is one orphaned file, which costs a fraction of a cent.
 *
 * @param {string} pathOrUrl
 * @returns {Promise<{deleted: boolean, error?: string}>}
 */
export async function deleteImage(pathOrUrl) {
  if (!pathOrUrl) return { deleted: false, error: 'No path given' };

  const storagePath = extractStoragePath(pathOrUrl);
  if (!storagePath) return { deleted: false, error: 'Could not parse a storage path' };

  const { error } = await supabase.storage.from(BUCKET).remove([storagePath]);

  if (error) {
    // eslint-disable-next-line no-console
    console.warn(`[STORAGE] Could not delete "${storagePath}": ${error.message}`);
    return { deleted: false, error: error.message };
  }
  return { deleted: true };
}

/** Delete several images. Never throws. */
export async function deleteImages(pathsOrUrls = []) {
  const paths = pathsOrUrls.map(extractStoragePath).filter(Boolean);
  if (paths.length === 0) return { deleted: 0 };

  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error) {
    // eslint-disable-next-line no-console
    console.warn(`[STORAGE] Bulk delete failed: ${error.message}`);
    return { deleted: 0, error: error.message };
  }
  return { deleted: paths.length };
}

/**
 * Pull the storage path out of a public URL.
 *
 * A Supabase public URL looks like:
 *   https://<ref>.supabase.co/storage/v1/object/public/product-images/products/2026/08/x.jpg
 *                                                    ^^^^^^^^^^^^^^^^ bucket
 *                                                                     ^^^^^^^^^^^^^^^^^^^^^ path
 */
export function extractStoragePath(pathOrUrl) {
  if (!pathOrUrl) return null;

  if (!pathOrUrl.startsWith('http')) {
    return pathOrUrl.replace(/^\/+/, '');
  }

  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const index = pathOrUrl.indexOf(marker);
  if (index === -1) return null;

  // decodeURIComponent because filenames with spaces arrive percent-encoded.
  return decodeURIComponent(pathOrUrl.slice(index + marker.length));
}

/** Confirms the bucket exists on boot, so the first upload is not the discovery. */
export async function verifyStorageBucket() {
  try {
    const { data, error } = await supabase.storage.getBucket(BUCKET);
    if (error) return { ok: false, reason: error.message };
    return { ok: true, isPublic: data?.public === true };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

export default {
  uploadImage,
  uploadImages,
  deleteImage,
  deleteImages,
  extractStoragePath,
  verifyStorageBucket,
};
