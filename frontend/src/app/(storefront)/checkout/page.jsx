'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCart } from '@/components/CartProvider';
import { checkAvailability, createOrder } from '@/lib/api';
import { money } from '@/lib/format';

/**
 * Cash-on-delivery checkout.
 *
 * There is no payment step, so this form collects only what is needed to reach
 * the customer and hand them the goods. Two things differ from a prepaid store:
 *
 *   1. PHONE IS REQUIRED. The shop calls to confirm the order is real before
 *      dispatching, and the courier calls from the street. The backend rejects
 *      an order without one.
 *
 *   2. THE TOTAL IS THE CASH TO HAVE READY. It is shown prominently, because a
 *      customer who answers the door without the right money means a wasted
 *      trip and often a returned order.
 */
export default function CheckoutPage() {
  const router = useRouter();
  const { items, hydrated, clearCart, toOrderItems } = useCart();

  const [totals, setTotals] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const [form, setForm] = useState({
    customer_name: '',
    customer_email: '',
    customer_phone: '',
    line1: '',
    line2: '',
    city: '',
    region: '',
    postal_code: '',
    country: 'Lebanon',
    notes: '',
  });

  // Pull the authoritative totals so the cash figure on screen matches what the
  // server will actually charge.
  useEffect(() => {
    if (!hydrated || items.length === 0) return;
    let cancelled = false;
    checkAvailability(toOrderItems())
      .then((result) => { if (!cancelled) setTotals(result); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [hydrated, items, toOrderItems]);

  useEffect(() => {
    // Someone landing here with an empty cart (bookmark, back button) gets
    // sent somewhere useful rather than staring at a broken form.
    if (hydrated && items.length === 0 && !submitting) router.replace('/cart');
  }, [hydrated, items.length, submitting, router]);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    try {
      const order = await createOrder({
        customer_name: form.customer_name,
        customer_email: form.customer_email,
        customer_phone: form.customer_phone,
        shipping_address: {
          line1: form.line1,
          line2: form.line2,
          city: form.city,
          region: form.region,
          postal_code: form.postal_code,
          country: form.country,
        },
        notes: form.notes,
        // Ids and quantities only. Prices and the delivery fee are the
        // server's business.
        items: toOrderItems(),
      });

      clearCart();
      router.push(`/orders/${order.id}?placed=1`);
    } catch (err) {
      /**
       * The backend returns a per-field map for validation failures, so put
       * each message next to its own input instead of one vague banner.
       */
      if (err.code === 'VALIDATION_ERROR' && err.details) {
        const mapped = {};
        for (const [path, message] of Object.entries(err.details)) {
          // "shipping_address.city" -> "city", to match the flat form state
          mapped[path.replace('shipping_address.', '')] = message;
        }
        setFieldErrors(mapped);
        setError('Please check the highlighted fields.');
      } else if (err.code === 'INSUFFICIENT_STOCK') {
        setError(`${err.message} Please adjust your cart and try again.`);
      } else if (err.code === 'CHECKOUT_CLOSED') {
        setError(err.message);
      } else {
        setError(err.message || 'Something went wrong. Please try again.');
      }
      setSubmitting(false);
    }
  }

  if (!hydrated || items.length === 0) {
    return <div className="max-w-4xl mx-auto px-4 py-16 text-muted">Loading…</div>;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="display mb-6 text-3xl">Checkout</h1>

      {error && (
        <div
          role="alert"
          className="border border-alert bg-alert-dim rounded-lg px-4 py-3 mb-6 text-sm text-ink"
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid lg:grid-cols-[1fr_300px] gap-8 items-start">

        <div className="space-y-8">

          <fieldset>
            <legend className="font-semibold mb-3">Your details</legend>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field
                label="Full name" name="customer_name" value={form.customer_name}
                onChange={update} error={fieldErrors.customer_name} required autoComplete="name"
              />
              <Field
                label="Email" name="customer_email" type="email" value={form.customer_email}
                onChange={update} error={fieldErrors.customer_email} required autoComplete="email"
                hint="For your order confirmation"
              />
              <Field
                label="Phone" name="customer_phone" type="tel" value={form.customer_phone}
                onChange={update} error={fieldErrors.customer_phone} required autoComplete="tel"
                hint="We call to confirm before delivery"
                className="sm:col-span-2"
              />
            </div>
          </fieldset>

          <fieldset>
            <legend className="font-semibold mb-3">Delivery address</legend>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field
                label="Street address" name="line1" value={form.line1} onChange={update}
                error={fieldErrors.line1} required autoComplete="address-line1"
                className="sm:col-span-2"
              />
              <Field
                label="Apartment, floor (optional)" name="line2" value={form.line2}
                onChange={update} error={fieldErrors.line2} autoComplete="address-line2"
                className="sm:col-span-2"
              />
              <Field
                label="City" name="city" value={form.city} onChange={update}
                error={fieldErrors.city} required autoComplete="address-level2"
              />
              <Field
                label="Area (optional)" name="region" value={form.region} onChange={update}
                error={fieldErrors.region} autoComplete="address-level1"
              />
              <Field
                label="Postal code (optional)" name="postal_code" value={form.postal_code}
                onChange={update} error={fieldErrors.postal_code} autoComplete="postal-code"
              />
              <Field
                label="Country" name="country" value={form.country} onChange={update}
                error={fieldErrors.country} required autoComplete="country-name"
              />
            </div>
          </fieldset>

          <fieldset>
            <legend className="font-semibold mb-3">Delivery notes (optional)</legend>
            <textarea
              value={form.notes}
              onChange={(e) => update('notes', e.target.value)}
              rows={3}
              placeholder="Landmarks, best time to call, which bell to ring…"
              className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-paper resize-y"
            />
          </fieldset>
        </div>

        {/* Summary */}
        <aside className="lg:sticky lg:top-24 border border-line rounded-xl p-5">
          <h2 className="font-semibold mb-4">Your order</h2>

          <ul className="space-y-2 text-sm mb-4">
            {items.map((item) => (
              <li key={item.product_id} className="flex justify-between gap-3">
                <span className="text-muted line-clamp-1">
                  <span className="tabular">{item.quantity}×</span> {item.name}
                </span>
                <span className="tabular shrink-0">
                  {money(Number(item.price) * item.quantity)}
                </span>
              </li>
            ))}
          </ul>

          {totals && (
            <dl className="space-y-2 text-sm mb-4 pt-3 border-t border-line">
              <div className="flex justify-between">
                <dt className="text-muted">Items</dt>
                <dd className="tabular">{money(totals.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Delivery</dt>
                <dd className="tabular">
                  {Number(totals.delivery_fee) > 0 ? money(totals.delivery_fee) : 'Free'}
                </dd>
              </div>
            </dl>
          )}

          {/* The cash figure gets the most visual weight on the page. */}
          <div className="border border-cash bg-cash-dim rounded-lg px-4 py-3 mb-4 text-center">
            <p className="text-xs uppercase tracking-wide text-cash font-medium">
              Pay in cash on delivery
            </p>
            <p className="display tabular mt-1 text-2xl text-cash">
              {totals ? money(totals.total) : '—'}
            </p>
            <p className="text-xs text-ink/70 mt-1">Have this ready for the courier</p>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-ink text-white rounded-lg px-5 py-3 text-sm font-medium hover:bg-brand transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Placing your order…' : 'Place order'}
          </button>

          <p className="text-xs text-muted mt-3 text-center leading-relaxed">
            No payment is taken now. We will call to confirm before delivery.
          </p>

          <Link href="/cart" className="block text-center text-sm text-muted hover:text-ink mt-3">
            Back to cart
          </Link>
        </aside>
      </form>
    </div>
  );
}

/** One labelled input, with its own error message and hint. */
function Field({ label, name, value, onChange, error, hint, type = 'text', required, autoComplete, className = '' }) {
  return (
    <div className={className}>
      <label htmlFor={name} className="block text-sm font-medium mb-1">
        {label}
        {required && <span className="text-alert ml-0.5" aria-hidden="true">*</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        value={value}
        required={required}
        autoComplete={autoComplete}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? `${name}-error` : hint ? `${name}-hint` : undefined}
        onChange={(e) => onChange(name, e.target.value)}
        className={`w-full border rounded-lg px-3 py-2 text-sm bg-paper ${
          error ? 'border-alert' : 'border-line'
        }`}
      />
      {error ? (
        <p id={`${name}-error`} className="text-xs text-alert mt-1">{error}</p>
      ) : hint ? (
        <p id={`${name}-hint`} className="text-xs text-muted mt-1">{hint}</p>
      ) : null}
    </div>
  );
}
