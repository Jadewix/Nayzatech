/**
 * The Express application.
 *
 * Kept separate from server.js (which starts the listener) so the app can be
 * imported directly by tests without binding a port.
 *
 * MIDDLEWARE ORDER MATTERS. Express runs these top to bottom, and several of
 * them only work if they run before the routes. The comments below explain why
 * each one sits where it does.
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';

import config from './config/env.js';
import apiRoutes from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { globalLimiter, adminLimiter } from './middleware/rateLimit.js';
import { sendSuccess } from './utils/response.js';

const app = express();

/* ---------------------------------------------------------------------------
 * 1. Trust the hosting platform's proxy
 *
 * On Render, Railway, Fly, Heroku and friends, your app sits behind a load
 * balancer. Without this, req.ip is the proxy's address for every visitor —
 * which would make rate limiting throttle all your customers as if they were
 * one person.
 *
 * `1` means "trust exactly one proxy hop". Do not use `true` in production:
 * trusting every hop lets a client spoof X-Forwarded-For and dodge rate limits.
 * ------------------------------------------------------------------------ */
app.set('trust proxy', 1);

// Do not advertise the framework to anyone scanning for known Express exploits.
app.disable('x-powered-by');

/* ---------------------------------------------------------------------------
 * 2. Security headers
 * ------------------------------------------------------------------------ */
app.use(
  helmet({
    // This is a JSON API, not a website — it serves no HTML, so a Content
    // Security Policy has nothing to protect and only complicates CORS.
    contentSecurityPolicy: false,
    // Allows product images served from Supabase to be embedded by your frontend.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

/* ---------------------------------------------------------------------------
 * 3. CORS — the setting that decides whether your React app can talk at all
 *
 * Browsers block cross-origin requests unless the server explicitly allows the
 * calling origin. Your React app on :3000 and this API on :5000 ARE different
 * origins, so without this every fetch fails with a CORS error in the console.
 *
 * The allowed origins come from FRONTEND_URL, falling back to
 * http://localhost:3000. Set several by separating them with commas:
 *   FRONTEND_URL=http://localhost:3000,https://mystore.com
 *
 * We pass a FUNCTION rather than a plain array so we can allow requests that
 * carry no Origin header at all (curl, Postman, mobile apps, health checks)
 * while still rejecting unknown websites.
 * ------------------------------------------------------------------------ */
const corsOptions = {
  origin(origin, callback) {
    // No Origin header: not a browser request, so there is no cross-site risk
    // to protect against. curl, Postman, server-to-server and React Native all
    // land here.
    if (!origin) return callback(null, true);

    const normalized = origin.replace(/\/$/, '');
    if (config.cors.origins.includes(normalized)) {
      return callback(null, true);
    }

    // In development, allow any localhost port so you are not editing .env
    // every time Vite picks 5173 instead of 3000.
    if (!config.isProduction && /^https?:\/\/localhost(:\d+)?$/.test(normalized)) {
      return callback(null, true);
    }

    // eslint-disable-next-line no-console
    console.warn(`[CORS] Blocked request from origin: ${origin}`);
    return callback(new Error(`Origin ${origin} is not allowed by CORS`));
  },

  // Let the browser send cookies / Authorization headers. Required if you ever
  // move admin auth to cookie-based sessions.
  credentials: true,

  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

  // x-admin-key MUST be listed here. A browser refuses to send a custom header
  // the server has not declared, so omitting it makes every admin call fail
  // with a confusing CORS error rather than a 401.
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-key'],

  // Headers the browser is allowed to READ from the response. Without this,
  // JavaScript cannot see the rate-limit headers even though they arrive.
  exposedHeaders: ['RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],

  // Cache the preflight OPTIONS result for 24h, so the browser stops sending a
  // second round trip before every request.
  maxAge: 86400,

  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));

/* ---------------------------------------------------------------------------
 * 4. Body parsing
 *
 * The 1mb limit is a guard: without it, someone can POST a 500MB JSON body and
 * exhaust your server's memory. Product images do not travel through here —
 * they go through multer as multipart.
 * ------------------------------------------------------------------------ */
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

/* ---------------------------------------------------------------------------
 * 5. Response compression — gzip on JSON, typically 70-80% smaller.
 * ------------------------------------------------------------------------ */
app.use(compression());

/* ---------------------------------------------------------------------------
 * 6. Request logging
 *    'dev' is colourful and short; 'combined' is the standard log format.
 * ------------------------------------------------------------------------ */
app.use(morgan(config.isProduction ? 'combined' : 'dev'));

/* ---------------------------------------------------------------------------
 * 7. Health check
 *
 * Placed BEFORE the rate limiter on purpose: uptime monitors poll this every
 * 30 seconds and must never be throttled.
 * ------------------------------------------------------------------------ */
app.get('/health', (req, res) =>
  sendSuccess(res, {
    status: 'ok',
    uptime_seconds: Math.floor(process.uptime()),
    environment: config.env,
    timestamp: new Date().toISOString(),
  })
);

/* ---------------------------------------------------------------------------
 * 8. Rate limiting, then the routes
 * ------------------------------------------------------------------------ */
app.use('/api', globalLimiter);
app.use('/api/admin', adminLimiter);   // stricter, on top of the global limit
app.use('/api', apiRoutes);

// Friendly root, so hitting the bare domain is not a bewildering 404.
app.get('/', (req, res) =>
  sendSuccess(res, {
    name: 'Tech Store API',
    documentation: '/api',
    health: '/health',
  })
);

/* ---------------------------------------------------------------------------
 * 9. Error handling — ALWAYS LAST
 *
 * Express only reaches these if nothing above sent a response. The 404 handler
 * catches unmatched URLs; the error handler catches everything thrown anywhere
 * in the stack. Registering them earlier would swallow your real routes.
 * ------------------------------------------------------------------------ */
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
