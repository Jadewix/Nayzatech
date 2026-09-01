/**
 * HTML email templates.
 *
 * Email HTML is not web HTML. Outlook still renders with Microsoft Word's
 * engine, Gmail strips <style> blocks in some contexts, and flexbox/grid are
 * unreliable. So these templates use tables for layout and inline styles only —
 * ugly by modern standards, but it actually renders everywhere.
 *
 * Every template returns { subject, html, text }. The plain-text version is not
 * optional: spam filters penalise HTML-only mail, and some people read in
 * text-only clients.
 */

import config from '../config/env.js';

/**
 * Escape user-supplied text before putting it in HTML.
 *
 * This matters more than it looks. A customer named `<script>` or a contact
 * message containing HTML would otherwise break your layout — or, in the admin
 * alert, inject markup into an email you are about to open. Always escape
 * anything that came from a form.
 */
function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Format a number as currency.
 * The code comes from your store_settings table, so changing it in the admin
 * panel changes what customers see here with no code edit.
 */
function money(amount, currency = 'USD') {
  const number = Number(amount) || 0;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(number);
  } catch {
    // An unrecognised currency code must not break the whole email.
    return `${currency} ${number.toFixed(2)}`;
  }
}

/** Render a JSONB shipping address into readable lines. */
function formatAddress(address) {
  if (!address) return '';
  if (typeof address === 'string') return address;
  return [
    address.line1,
    address.line2,
    [address.city, address.region].filter(Boolean).join(', '),
    address.postal_code,
    address.country,
  ]
    .filter(Boolean)
    .join('\n');
}

const COLORS = {
  text: '#1a1a1a',
  muted: '#6b7280',
  border: '#e5e7eb',
  background: '#f6f7f9',
  accent: '#1f6feb',
  // Used for the cash-due panel. It needs to be the most noticeable thing in
  // the email — a customer who does not read it answers the door without money.
  cash: '#0f7b3f',
  cashBg: '#eaf7ef',
  warn: '#b45309',
  warnBg: '#fef6e7',
};

/** Shared shell so every email looks like it came from the same store. */
function wrapLayout({ heading, bodyHtml, footerNote }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background-color:${COLORS.background};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${COLORS.text};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${COLORS.background};padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border:1px solid ${COLORS.border};border-radius:8px;overflow:hidden;">
          <tr>
            <td style="padding:24px 32px;border-bottom:1px solid ${COLORS.border};">
              <span style="font-size:18px;font-weight:700;letter-spacing:-0.01em;">${escapeHtml(config.store.name)}</span>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 20px;font-size:22px;font-weight:600;line-height:1.3;">${escapeHtml(heading)}</h1>
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;background-color:#fafafa;border-top:1px solid ${COLORS.border};font-size:12px;color:${COLORS.muted};line-height:1.6;">
              ${footerNote || ''}
              ${config.store.supportEmail ? `<div style="margin-top:8px;">Questions? Reply to this email or write to <a href="mailto:${escapeHtml(config.store.supportEmail)}" style="color:${COLORS.accent};">${escapeHtml(config.store.supportEmail)}</a>.</div>` : ''}
              <div style="margin-top:8px;">&copy; ${new Date().getFullYear()} ${escapeHtml(config.store.name)}</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/* ===========================================================================
 *  A. ORDER CONFIRMATION  (customer)
 *
 *  For a cash-on-delivery store this email has one job above all others:
 *  tell the customer EXACTLY how much cash to have ready at the door. A
 *  customer who answers without the right money means a wasted courier trip
 *  and, often, a returned order — the single biggest avoidable cost in COD.
 *
 *  So the amount due gets its own panel, in large type, above the itemised
 *  breakdown. Everything else is secondary.
 * ======================================================================== */
export function orderConfirmationTemplate(order, { currency = 'USD' } = {}) {
  const items = Array.isArray(order.items) ? order.items : [];

  const itemRows = items
    .map(
      (item) => `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid ${COLORS.border};">
            <div style="font-weight:500;">${escapeHtml(item.product_name)}</div>
            <div style="font-size:12px;color:${COLORS.muted};margin-top:2px;">SKU ${escapeHtml(item.product_sku)} &middot; Qty ${escapeHtml(item.quantity)}</div>
          </td>
          <td align="right" style="padding:12px 0;border-bottom:1px solid ${COLORS.border};white-space:nowrap;vertical-align:top;">
            ${money(item.line_total ?? item.quantity * item.price_at_purchase, currency)}
          </td>
        </tr>`
    )
    .join('');

  const trackingUrl = config.store.url ? `${config.store.url}/orders/${order.id}` : null;
  const deliveryFee = Number(order.delivery_fee ?? 0);
  const subtotal = Number(order.subtotal ?? order.total_amount);

  const bodyHtml = `
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;">
      Thanks, ${escapeHtml(order.customer_name)} — we have your order. We will call you shortly on
      <strong>${escapeHtml(order.customer_phone || 'the number you gave us')}</strong> to confirm it before we send it out.
    </p>

    <!-- THE CASH PANEL: the one thing this email must communicate -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background-color:${COLORS.cashBg};border:1px solid ${COLORS.cash};border-radius:8px;">
      <tr>
        <td style="padding:20px 22px;text-align:center;">
          <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.06em;color:${COLORS.cash};font-weight:600;">Pay in cash on delivery</div>
          <div style="font-size:30px;font-weight:700;color:${COLORS.cash};margin:8px 0 4px;line-height:1.1;">${money(order.total_amount, currency)}</div>
          <div style="font-size:13px;color:${COLORS.text};">Please have this amount ready when the courier arrives.</div>
        </td>
      </tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background-color:#f9fafb;border-radius:6px;">
      <tr>
        <td style="padding:14px 16px;font-size:14px;">
          <strong>Order ${escapeHtml(order.order_number)}</strong><br>
          <span style="color:${COLORS.muted};">Placed ${new Date(order.created_at).toLocaleDateString('en-US', { dateStyle: 'long' })}</span>
        </td>
      </tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
      ${itemRows}
      <tr>
        <td style="padding:14px 0 4px;color:${COLORS.muted};">Items</td>
        <td align="right" style="padding:14px 0 4px;">${money(subtotal, currency)}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;color:${COLORS.muted};">Delivery</td>
        <td align="right" style="padding:4px 0;">${deliveryFee > 0 ? money(deliveryFee, currency) : 'Free'}</td>
      </tr>
      <tr>
        <td style="padding:12px 0 0;font-size:16px;font-weight:700;border-top:2px solid ${COLORS.text};">Total due in cash</td>
        <td align="right" style="padding:12px 0 0;font-size:16px;font-weight:700;border-top:2px solid ${COLORS.text};">${money(order.total_amount, currency)}</td>
      </tr>
    </table>

    <h2 style="margin:28px 0 8px;font-size:14px;text-transform:uppercase;letter-spacing:0.04em;color:${COLORS.muted};">Delivering to</h2>
    <p style="margin:0;font-size:14px;line-height:1.6;white-space:pre-line;">${escapeHtml(order.customer_name)}
${escapeHtml(formatAddress(order.shipping_address))}
${escapeHtml(order.customer_phone || '')}</p>

    ${
      trackingUrl
        ? `<div style="margin-top:28px;">
             <a href="${escapeHtml(trackingUrl)}" style="display:inline-block;background-color:${COLORS.accent};color:#ffffff;text-decoration:none;padding:11px 22px;border-radius:6px;font-size:14px;font-weight:500;">Track your order</a>
           </div>`
        : ''
    }
  `;

  const text = [
    `Thanks, ${order.customer_name} — we have your order.`,
    `We will call you on ${order.customer_phone || 'the number you gave us'} to confirm it before we send it out.`,
    ``,
    `**********************************************`,
    `  PAY IN CASH ON DELIVERY: ${money(order.total_amount, currency)}`,
    `  Please have this amount ready for the courier.`,
    `**********************************************`,
    ``,
    `Order ${order.order_number}`,
    `Placed ${new Date(order.created_at).toLocaleDateString('en-US', { dateStyle: 'long' })}`,
    ``,
    ...items.map(
      (item) =>
        `  ${item.quantity} x ${item.product_name} (${item.product_sku}) — ${money(item.line_total ?? item.quantity * item.price_at_purchase, currency)}`
    ),
    ``,
    `  Items:    ${money(subtotal, currency)}`,
    `  Delivery: ${deliveryFee > 0 ? money(deliveryFee, currency) : 'Free'}`,
    `  TOTAL:    ${money(order.total_amount, currency)}`,
    ``,
    `Delivering to:`,
    order.customer_name,
    formatAddress(order.shipping_address),
    order.customer_phone || '',
    ``,
    trackingUrl ? `Track your order: ${trackingUrl}` : '',
    ``,
    `— ${config.store.name}`,
  ].join('\n');

  return {
    subject: `Order ${order.order_number} received — ${money(order.total_amount, currency)} due on delivery`,
    html: wrapLayout({
      heading: 'We have your order',
      bodyHtml,
      footerNote: 'Payment is cash on delivery. Nothing is charged online.',
    }),
    text,
  };
}

/* ===========================================================================
 *  B. CONTACT FORM ALERT  (admin)
 * ======================================================================== */
export function contactAlertTemplate(submission) {
  const bodyHtml = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin-bottom:20px;">
      <tr>
        <td style="padding:6px 0;color:${COLORS.muted};width:80px;">From</td>
        <td style="padding:6px 0;font-weight:500;">${escapeHtml(submission.name)}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:${COLORS.muted};">Email</td>
        <td style="padding:6px 0;"><a href="mailto:${escapeHtml(submission.email)}" style="color:${COLORS.accent};">${escapeHtml(submission.email)}</a></td>
      </tr>
      ${
        submission.subject
          ? `<tr><td style="padding:6px 0;color:${COLORS.muted};">Subject</td><td style="padding:6px 0;">${escapeHtml(submission.subject)}</td></tr>`
          : ''
      }
      <tr>
        <td style="padding:6px 0;color:${COLORS.muted};">Received</td>
        <td style="padding:6px 0;">${new Date(submission.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</td>
      </tr>
    </table>

    <div style="padding:16px;background-color:#f9fafb;border-left:3px solid ${COLORS.accent};border-radius:4px;font-size:14px;line-height:1.65;white-space:pre-wrap;">${escapeHtml(submission.message)}</div>

    <p style="margin:24px 0 0;font-size:13px;color:${COLORS.muted};">
      Reply to this email to answer ${escapeHtml(submission.name)} directly.
    </p>
  `;

  const text = [
    `New contact form submission`,
    ``,
    `From:    ${submission.name}`,
    `Email:   ${submission.email}`,
    submission.subject ? `Subject: ${submission.subject}` : '',
    `Received: ${new Date(submission.created_at).toLocaleString()}`,
    ``,
    `Message:`,
    submission.message,
  ]
    .filter(Boolean)
    .join('\n');

  return {
    subject: `New enquiry: ${submission.subject || `message from ${submission.name}`}`,
    html: wrapLayout({
      heading: 'New contact form submission',
      bodyHtml,
      footerNote: `Submission ID ${escapeHtml(submission.id)}`,
    }),
    text,
  };
}

/* ===========================================================================
 *  C. ORDER STATUS UPDATE  (customer)
 *
 *  The 'shipped' email is the important one: it is the last chance to remind
 *  the customer to have cash ready before the courier is at the door.
 * ======================================================================== */
export function orderStatusUpdateTemplate(order, previousStatus, { currency = 'USD' } = {}) {
  const messages = {
    confirmed: 'We have confirmed your order and it is being prepared.',
    processing: 'Your order is being packed.',
    shipped: 'Your order is out for delivery.',
    delivered: 'Your order has been delivered and paid. Enjoy it.',
    cancelled: 'Your order has been cancelled. Nothing has been charged.',
    failed_delivery: 'We were not able to deliver your order.',
  };

  const headings = {
    confirmed: 'Order confirmed',
    processing: 'Your order is being prepared',
    shipped: 'Your order is on its way',
    delivered: 'Your order was delivered',
    cancelled: 'Your order was cancelled',
    failed_delivery: 'We could not deliver your order',
  };

  const trackingUrl = config.store.url ? `${config.store.url}/orders/${order.id}` : null;
  const stillOwes = ['confirmed', 'processing', 'shipped'].includes(order.status);

  const bodyHtml = `
    <p style="margin:0 0 18px;font-size:15px;line-height:1.6;">
      Hi ${escapeHtml(order.customer_name)}, ${escapeHtml(messages[order.status] || `your order status is now ${order.status}.`)}
    </p>

    ${
      stillOwes
        ? `<!-- Reminder of the cash due, right up to the moment of delivery -->
           <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;background-color:${COLORS.cashBg};border:1px solid ${COLORS.cash};border-radius:8px;">
             <tr>
               <td style="padding:18px 22px;text-align:center;">
                 <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.06em;color:${COLORS.cash};font-weight:600;">Have this ready in cash</div>
                 <div style="font-size:28px;font-weight:700;color:${COLORS.cash};margin:6px 0 2px;line-height:1.1;">${money(order.total_amount, currency)}</div>
                 <div style="font-size:13px;color:${COLORS.text};">Payable to the courier on delivery.</div>
               </td>
             </tr>
           </table>`
        : ''
    }

    ${
      order.status === 'failed_delivery'
        ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;background-color:${COLORS.warnBg};border-left:3px solid ${COLORS.warn};border-radius:4px;">
             <tr>
               <td style="padding:14px 16px;font-size:14px;line-height:1.6;color:${COLORS.text};">
                 The courier tried ${escapeHtml(order.delivery_attempts || 1)} time(s) but could not complete the delivery,
                 so the order has been closed and nothing has been charged.
                 ${config.store.supportEmail ? 'If you still want these items, reply to this email and we will arrange it.' : 'You are welcome to place the order again.'}
               </td>
             </tr>
           </table>`
        : ''
    }

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;background-color:#f9fafb;border-radius:6px;">
      <tr>
        <td style="padding:14px 16px;font-size:14px;">
          <strong>Order ${escapeHtml(order.order_number)}</strong><br>
          <span style="color:${COLORS.muted};">${escapeHtml(previousStatus || '')} &rarr; <strong style="color:${COLORS.text};">${escapeHtml(order.status)}</strong></span><br>
          <span style="color:${COLORS.muted};">Total ${money(order.total_amount, currency)}</span>
        </td>
      </tr>
    </table>

    ${
      trackingUrl
        ? `<a href="${escapeHtml(trackingUrl)}" style="display:inline-block;background-color:${COLORS.accent};color:#ffffff;text-decoration:none;padding:11px 22px;border-radius:6px;font-size:14px;font-weight:500;">View order</a>`
        : ''
    }
  `;

  // Built as sections so a skipped block leaves no stray blank lines.
  const textParts = [`Hi ${order.customer_name},`, ''];
  textParts.push(messages[order.status] || `Your order status is now ${order.status}.`, '');

  if (stillOwes) {
    textParts.push(
      `HAVE READY IN CASH: ${money(order.total_amount, currency)} (payable to the courier)`,
      ''
    );
  }

  if (order.status === 'failed_delivery') {
    textParts.push(
      `The courier tried ${order.delivery_attempts || 1} time(s) but could not complete the`,
      `delivery, so the order has been closed. Nothing has been charged.`,
      ''
    );
  }

  textParts.push(
    `Order ${order.order_number}`,
    `Status: ${order.status}`,
    `Total:  ${money(order.total_amount, currency)}`,
    ''
  );

  if (trackingUrl) textParts.push(`View your order: ${trackingUrl}`, '');
  textParts.push(`— ${config.store.name}`);

  const text = textParts.join('\n');

  return {
    subject: `${headings[order.status] || 'Order update'} — ${order.order_number}`,
    html: wrapLayout({
      heading: headings[order.status] || 'Order update',
      bodyHtml,
      footerNote: stillOwes ? 'Payment is cash on delivery. Nothing is charged online.' : '',
    }),
    text,
  };
}

export default {
  orderConfirmationTemplate,
  contactAlertTemplate,
  orderStatusUpdateTemplate,
};
