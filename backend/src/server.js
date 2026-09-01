/**
 * Server entry point.
 *
 * Responsibilities kept deliberately narrow:
 *   1. verify external services before accepting traffic
 *   2. start listening
 *   3. shut down cleanly when the platform says stop
 *
 * Run with:  npm run dev   (auto-restarts on file changes)
 *            npm start     (production)
 */

import app from './app.js';
import config from './config/env.js';
import { verifySupabaseConnection } from './config/supabase.js';
import { verifyStorageBucket } from './services/storage.service.js';
import { verifyEmailService } from './services/email.service.js';

/**
 * Check every external dependency at boot.
 *
 * A broken Supabase URL should announce itself in the startup log, not as a
 * mystery 500 the first time a customer tries to check out.
 */
async function runStartupChecks() {
  const lines = [];

  const db = await verifySupabaseConnection();
  lines.push(
    db.ok
      ? '  Database    connected'
      : `  Database    FAILED — ${db.error}\n              Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, and confirm you ran db/01_schema.sql.`
  );

  const storage = await verifyStorageBucket();
  lines.push(
    storage.ok
      ? `  Storage     bucket "${config.supabase.storageBucket}" ready${storage.isPublic ? '' : ' (WARNING: not public — image URLs will 404)'}`
      : `  Storage     unavailable — ${storage.reason}\n              Run db/03_security.sql to create the bucket.`
  );

  const email = await verifyEmailService();
  if (email.ok) {
    lines.push('  Email       Brevo connected');
  } else if (email.reason === 'disabled') {
    lines.push('  Email       disabled (messages will be logged, not sent)');
  } else {
    lines.push(`  Email       unavailable — ${email.reason}\n              Check BREVO_API_KEY and that your sender is verified in Brevo.`);
  }

  return { lines, databaseOk: db.ok };
}

async function start() {
  const { lines, databaseOk } = await runStartupChecks();

  const server = app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(
      `\n  ${config.store.name} API\n` +
      `  ${'-'.repeat(46)}\n` +
      `  Listening   http://localhost:${config.port}\n` +
      `  Environment ${config.env}\n` +
      `  CORS allows ${config.cors.origins.join(', ')}\n` +
      lines.join('\n') + '\n' +
      `  ${'-'.repeat(46)}\n` +
      `  Endpoints   http://localhost:${config.port}/api\n`
    );

    if (!databaseOk) {
      // eslint-disable-next-line no-console
      console.warn('  The server is running but the database is unreachable — most endpoints will fail.\n');
    }
  });

  /* -------------------------------------------------------------------------
   * Graceful shutdown.
   *
   * Hosting platforms send SIGTERM before replacing your container. Without
   * this handler the process is killed instantly, cutting off any request that
   * was mid-flight — including, potentially, an order being written.
   * server.close() stops accepting new connections and lets in-flight requests
   * finish first.
   * ---------------------------------------------------------------------- */
  function shutdown(signal) {
    // eslint-disable-next-line no-console
    console.log(`\n  ${signal} received — finishing in-flight requests...`);

    server.close(() => {
      // eslint-disable-next-line no-console
      console.log('  Closed cleanly.');
      process.exit(0);
    });

    // If something hangs, do not wait forever — the platform will hard-kill us anyway.
    setTimeout(() => {
      // eslint-disable-next-line no-console
      console.error('  Timed out waiting for connections to close. Forcing exit.');
      process.exit(1);
    }, 10_000).unref();
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  /* -------------------------------------------------------------------------
   * Last-resort crash handlers.
   *
   * These should never fire — asyncHandler routes async errors to the error
   * middleware. If one does fire, it is a real bug: log it loudly rather than
   * letting the process die silently at 3am with no explanation.
   * ---------------------------------------------------------------------- */
  process.on('unhandledRejection', (reason) => {
    // eslint-disable-next-line no-console
    console.error('  UNHANDLED PROMISE REJECTION:', reason);
  });

  process.on('uncaughtException', (error) => {
    // eslint-disable-next-line no-console
    console.error('  UNCAUGHT EXCEPTION:', error);
    // The process is in an unknown state after this — restart rather than
    // continue serving from a corrupted one.
    shutdown('uncaughtException');
  });
}

start();
