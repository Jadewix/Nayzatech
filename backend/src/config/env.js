/**
 * Environment configuration.
 *
 * Everything the app reads from process.env passes through this one file, and
 * it is validated the moment the server boots. That matters: a missing
 * SUPABASE_SERVICE_ROLE_KEY should crash the process on startup with a clear
 * message, not surface as a confusing 500 error three days later when someone
 * finally tries to place an order.
 */

import dotenv from 'dotenv';

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';

/** Read a required variable, or die loudly. */
function required(key) {
  const value = process.env[key];
  if (!value || value.trim() === '') {
    // eslint-disable-next-line no-console
    console.error(
      `\n  Missing required environment variable: ${key}\n` +
      `  Copy .env.example to .env and fill it in.\n`
    );
    process.exit(1);
  }
  return value.trim();
}

/** Read an optional variable with a fallback. */
function optional(key, fallback = undefined) {
  const value = process.env[key];
  return value && value.trim() !== '' ? value.trim() : fallback;
}

/** Parse a "true"/"false" string into a real boolean. */
function bool(key, fallback = false) {
  const value = process.env[key];
  if (value === undefined || value.trim() === '') return fallback;
  return ['true', '1', 'yes'].includes(value.trim().toLowerCase());
}

/**
 * FRONTEND_URL may hold one origin or a comma-separated list, so the same
 * build can serve localhost during development and your real domain in
 * production. Falls back to http://localhost:3000, the Create React App /
 * Next.js default port.
 */
const frontendOrigins = optional('FRONTEND_URL', 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim().replace(/\/$/, '')) // strip any trailing slash
  .filter(Boolean);

export const config = {
  env: process.env.NODE_ENV || 'development',
  isProduction,
  port: Number(optional('PORT', '5000')),

  cors: {
    origins: frontendOrigins,
  },

  supabase: {
    url: required('SUPABASE_URL'),
    serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
    storageBucket: optional('SUPABASE_STORAGE_BUCKET', 'product-images'),
  },

  brevo: {
    apiKey: optional('BREVO_API_KEY'),
    senderEmail: optional('BREVO_SENDER_EMAIL'),
    senderName: optional('BREVO_SENDER_NAME', 'Tech Store'),
    adminEmail: optional('ADMIN_EMAIL'),
    // Emails are only sent when explicitly enabled AND a key exists. Without
    // both, they are logged to the console — handy while developing.
    enabled: bool('EMAIL_ENABLED', true) && Boolean(optional('BREVO_API_KEY')),
  },

  admin: {
    apiKey: required('ADMIN_API_KEY'),
  },

  store: {
    name: optional('STORE_NAME', 'Tech Store'),
    url: optional('STORE_URL', frontendOrigins[0]),
    supportEmail: optional('STORE_SUPPORT_EMAIL', optional('ADMIN_EMAIL', '')),
  },

  uploads: {
    maxFileSizeBytes: 5 * 1024 * 1024, // 5 MB, matching the storage bucket limit
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'],
  },
};

/**
 * Startup guards for mistakes that are easy to make and painful to debug.
 */

// The anon key is a JWT with "role":"anon" baked in. Using it here means every
// admin write silently fails against RLS, which looks like a bug in your code.
if (config.supabase.serviceRoleKey.includes('.')) {
  try {
    const payload = JSON.parse(
      Buffer.from(config.supabase.serviceRoleKey.split('.')[1], 'base64').toString('utf8')
    );
    if (payload.role && payload.role !== 'service_role') {
      // eslint-disable-next-line no-console
      console.error(
        `\n  SUPABASE_SERVICE_ROLE_KEY looks like the "${payload.role}" key, not "service_role".\n` +
        `  Copy the service_role key from Supabase -> Project Settings -> API.\n`
      );
      process.exit(1);
    }
  } catch {
    // Newer Supabase publishable/secret keys are not JWTs. Nothing to check.
  }
}

if (isProduction) {
  if (config.admin.apiKey.length < 32) {
    // eslint-disable-next-line no-console
    console.error('\n  ADMIN_API_KEY is too short for production. Use at least 32 random characters.\n');
    process.exit(1);
  }
  if (config.cors.origins.some((origin) => origin.includes('localhost'))) {
    // eslint-disable-next-line no-console
    console.warn('  Warning: FRONTEND_URL still contains localhost while NODE_ENV=production.');
  }
}

if (!config.brevo.enabled) {
  // eslint-disable-next-line no-console
  console.warn('  Email sending is OFF. Messages will be logged to the console instead.');
}

export default config;
