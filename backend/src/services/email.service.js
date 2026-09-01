/**
 * Transactional email via Brevo.
 *
 * Uses Brevo's REST API directly with fetch (built into Node 18+) rather than
 * their SDK. The SDK is a large dependency wrapping one HTTP call, and its API
 * has changed shape between major versions; a plain fetch is stable, easy to
 * debug, and you can see exactly what goes over the wire.
 *
 * THE GOLDEN RULE: a failed email must NEVER fail an order.
 *
 * If Brevo is down when a customer checks out, the order is already safely in
 * the database. Throwing here would return a 500 and the customer would try
 * again, creating a duplicate order and double-deducting stock. So every send
 * catches its own errors, logs them, and returns a result object instead.
 * Callers check the result if they care and carry on if they do not.
 *
 * Setup checklist:
 *   1. Create an API key: app.brevo.com -> SMTP & API -> API Keys
 *   2. VERIFY YOUR SENDER: Brevo -> Senders, Domains & Dedicated IPs
 *      Unverified senders are rejected outright. This is the #1 cause of
 *      "my emails aren't sending".
 *   3. Set BREVO_API_KEY, BREVO_SENDER_EMAIL and ADMIN_EMAIL in .env
 */

import config from '../config/env.js';
import { supabase } from '../config/supabase.js';
import {
  orderConfirmationTemplate,
  contactAlertTemplate,
  orderStatusUpdateTemplate,
} from './email.templates.js';

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * The store currency lives in the store_settings table so you can change it
 * from the admin panel. Emails are sent often enough that hitting the database
 * for it every time would be wasteful, and stale enough not to matter, so it is
 * cached for five minutes.
 */
let currencyCache = { value: 'USD', fetchedAt: 0 };
const CURRENCY_TTL_MS = 5 * 60 * 1000;

async function getCurrency() {
  if (Date.now() - currencyCache.fetchedAt < CURRENCY_TTL_MS) {
    return currencyCache.value;
  }
  try {
    const { data } = await supabase
      .from('store_settings').select('value').eq('key', 'currency').maybeSingle();
    // The column is jsonb, so a string arrives already parsed.
    const value = typeof data?.value === 'string' ? data.value : 'USD';
    currencyCache = { value, fetchedAt: Date.now() };
    return value;
  } catch {
    // A settings lookup must never stop an email going out.
    return currencyCache.value;
  }
}

/**
 * Low-level send. Everything else in this file goes through here.
 *
 * @param {object} params
 * @param {Array<{email: string, name?: string}>} params.to
 * @param {string} params.subject
 * @param {string} params.htmlContent
 * @param {string} [params.textContent]  Plain-text fallback
 * @param {string} [params.replyTo]      Reply-to address
 * @param {object} [params.tags]         Brevo tags, for filtering in their dashboard
 * @returns {Promise<{sent: boolean, messageId?: string, error?: string, skipped?: boolean}>}
 */
async function sendEmail({ to, subject, htmlContent, textContent, replyTo, tags = [] }) {
  // Development mode: log instead of sending, so you are not burning your
  // Brevo quota (or spamming a real inbox) every time you test checkout.
  if (!config.brevo.enabled) {
    // eslint-disable-next-line no-console
    console.log(
      `\n[EMAIL — not sent, EMAIL_ENABLED is off]\n` +
      `  To:      ${to.map((r) => r.email).join(', ')}\n` +
      `  Subject: ${subject}\n`
    );
    return { sent: false, skipped: true };
  }

  if (!config.brevo.senderEmail) {
    // eslint-disable-next-line no-console
    console.error('[EMAIL] BREVO_SENDER_EMAIL is not set — cannot send.');
    return { sent: false, error: 'Sender email not configured' };
  }

  // AbortController stops a hung Brevo request from holding the checkout
  // response open indefinitely.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'api-key': config.brevo.apiKey,
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { email: config.brevo.senderEmail, name: config.brevo.senderName },
        to,
        subject,
        htmlContent,
        ...(textContent && { textContent }),
        ...(replyTo && { replyTo: { email: replyTo } }),
        ...(tags.length > 0 && { tags }),
      }),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      // Brevo returns a useful message here — surface it in the log so you are
      // not guessing why a send failed.
      // eslint-disable-next-line no-console
      console.error(`[EMAIL] Brevo rejected the send (${response.status}):`, payload);
      return {
        sent: false,
        error: payload.message || `Brevo returned HTTP ${response.status}`,
      };
    }

    // eslint-disable-next-line no-console
    console.log(`[EMAIL] Sent "${subject}" to ${to.map((r) => r.email).join(', ')}`);
    return { sent: true, messageId: payload.messageId };
  } catch (err) {
    const reason = err.name === 'AbortError'
      ? `Brevo did not respond within ${REQUEST_TIMEOUT_MS / 1000}s`
      : err.message;
    // eslint-disable-next-line no-console
    console.error('[EMAIL] Send failed:', reason);
    return { sent: false, error: reason };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * EVENT A — Order confirmation, sent to the customer after checkout.
 *
 * @param {object} order  The full order returned by the create_order function,
 *                        including its `items` array.
 */
export async function sendOrderConfirmation(order) {
  if (!order?.customer_email) {
    return { sent: false, error: 'Order has no customer email' };
  }

  const currency = await getCurrency();
  const { html, text, subject } = orderConfirmationTemplate(order, { currency });

  return sendEmail({
    to: [{ email: order.customer_email, name: order.customer_name }],
    subject,
    htmlContent: html,
    textContent: text,
    replyTo: config.store.supportEmail || undefined,
    tags: ['order-confirmation'],
  });
}

/**
 * EVENT B — Contact form alert, sent to the store admin.
 *
 * replyTo is set to the customer's address, so hitting Reply in your inbox
 * writes back to them rather than to your own noreply sender.
 *
 * @param {object} submission  The saved contact_submissions row
 */
export async function sendContactAlert(submission) {
  if (!config.brevo.adminEmail) {
    // eslint-disable-next-line no-console
    console.warn('[EMAIL] ADMIN_EMAIL is not set — contact alert not sent.');
    return { sent: false, error: 'Admin email not configured' };
  }

  const { html, text, subject } = contactAlertTemplate(submission);

  return sendEmail({
    to: [{ email: config.brevo.adminEmail, name: `${config.store.name} Admin` }],
    subject,
    htmlContent: html,
    textContent: text,
    replyTo: submission.email,
    tags: ['contact-form'],
  });
}

/**
 * Bonus — tells the customer when their order ships or is delivered.
 * Fired automatically from the admin order-status endpoint.
 */
export async function sendOrderStatusUpdate(order, previousStatus) {
  if (!order?.customer_email) return { sent: false, error: 'Order has no customer email' };

  /**
   * Which transitions are worth an email.
   *
   * 'confirmed' is included because in a COD store it is genuinely reassuring —
   * it tells the customer a real person checked their order. 'shipped' is the
   * most valuable of all: it is the last reminder to have cash ready before the
   * courier knocks.
   */
  const notifiable = ['confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'failed_delivery'];
  if (!notifiable.includes(order.status)) {
    return { sent: false, skipped: true };
  }

  const currency = await getCurrency();
  const { html, text, subject } = orderStatusUpdateTemplate(order, previousStatus, { currency });

  return sendEmail({
    to: [{ email: order.customer_email, name: order.customer_name }],
    subject,
    htmlContent: html,
    textContent: text,
    replyTo: config.store.supportEmail || undefined,
    tags: ['order-status'],
  });
}

/** Verifies the Brevo credentials on boot. Never throws. */
export async function verifyEmailService() {
  if (!config.brevo.enabled) return { ok: false, reason: 'disabled' };
  try {
    const response = await fetch('https://api.brevo.com/v3/account', {
      headers: { 'api-key': config.brevo.apiKey, accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return { ok: false, reason: `HTTP ${response.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

export default {
  sendOrderConfirmation,
  sendContactAlert,
  sendOrderStatusUpdate,
  verifyEmailService,
};
