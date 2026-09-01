/**
 * Multipart file upload handling (multer).
 *
 * Files are held in MEMORY, not written to disk. That is deliberate: this
 * server's job is to forward the bytes straight to Supabase Storage, so a
 * temp file would just be an extra write, an extra read, and a cleanup task
 * to forget. It also means the app works unchanged on hosts with a read-only
 * filesystem, like most container platforms.
 *
 * Memory storage does mean each in-flight upload occupies RAM, which is why
 * the size limit below is enforced strictly.
 */

import multer from 'multer';
import { ApiError } from '../utils/ApiError.js';
import config from '../config/env.js';

/**
 * Reject anything that is not an allowed image type.
 *
 * Note this checks the MIME type the browser reports, which a determined
 * attacker can lie about. It stops honest mistakes. The real protection is
 * that the storage bucket itself enforces allowed_mime_types server-side
 * (see db/03_security.sql), so a spoofed type is rejected by Supabase too.
 */
function imageFileFilter(req, file, cb) {
  if (config.uploads.allowedMimeTypes.includes(file.mimetype)) {
    return cb(null, true);
  }
  return cb(
    ApiError.badRequest(
      `Unsupported file type "${file.mimetype}". Allowed: ${config.uploads.allowedMimeTypes.join(', ')}.`,
      'INVALID_FILE_TYPE'
    )
  );
}

const uploader = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.uploads.maxFileSizeBytes,
    files: 10,
    // Cap non-file fields too, so a multipart body cannot be used to blow up memory.
    fields: 20,
    fieldSize: 1024 * 100,
  },
  fileFilter: imageFileFilter,
});

/** Accept a single image under the field name "image". */
export const uploadSingleImage = uploader.single('image');

/** Accept up to 10 images under the field name "images" (product galleries). */
export const uploadMultipleImages = uploader.array('images', 10);

export default { uploadSingleImage, uploadMultipleImages };
