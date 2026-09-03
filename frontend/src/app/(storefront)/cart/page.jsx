'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useCart } from '@/components/CartProvider';
import { checkAvailability } from '@/lib/api';
import { money } from '@/lib/format';

/**
 * The cart.
 *
 * The important detail: the totals shown here come from the SERVER, via
 * /api/orders/check-availability, not from adding up the prices stored in the
 * cart. That endpoint returns the real subtotal, the applicable delivery fee,
 * and flags anything that was marked sold out while the customer was browsing.
 *
 * Doing the arithmetic in the browser would eventually show a total that
 * disagrees with what the courier asks for — which is exactly the kind of
 * mistake that loses a sale at the door.
 */
export default function CartPage() {
  const { items, updateQuantity, removeItem, hydrated } = useCart();
  const [totals, setTotals] = useState(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!hydrated || items.length === 0) {
      setTotals(null);
      return;
    }
    let cancelled = false;
    setChecking(true);

    checkAvailability(items.map((i) => ({ product_id: i.product_id, quantity: i.quantity })))
      .then((result) => { if (!cancelled) setTotals(result); })
      .catch(() => { if (!cancelled) setTotals(null); })
      .finally(() => { if (!cancelled) setChecking(false); });

    // Cleanup: if the customer changes quantity quickly, ignore the older
    // in-flight response so a stale total cannot overwrite a newer one.
    return () => { cancelled = true; };
  }, [items, hydrated]);

  if (!hydrated) {
    return <div className="max-w-4xl mx-auto px-4 py-16 text-muted">Loading your cart…</div>;
  }

  if (items.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <h1 className="display mb-2 text-3xl">Your cart is empty</h1>
        <p className="text-muted mb-6">Have a look at what we are selling.</p>
        <Link
          href="/products"
          className="inline-block bg-ink text-white rounded-lg px-5 py-2.5 text-sm font-medium hover:bg-brand transition-colors"
        >
          Browse products
        </Link>
      </div>
    );
  }

  const unavailable = (totals?.items || []).filter((i) => !i.available);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="display mb-6 text-3xl">Your cart</h1>

      {unavailable.length > 0 && (
        <div className="border border-alert bg-alert-dim rounded-lg px-4 py-3 mb-6 text-sm">
          <p className="font-medium text-alert mb-1">Some items need attention</p>
          <ul className="space-y-0.5 text-ink/80">
            {unavailable.map((item) => (
              <li key={item.product_id}>
                {item.product_name || 'An item'} —{' '}
                {item.reason === 'sold_out' ? 'sold out' : 'no longer available'}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_300px] gap-8">

        {/* Lines */}
        <ul className="divide-y divide-line border-y border-line">
          {items.map((item) => (
            <li key={item.product_id} className="py-4 flex gap-4">
              <div className="w-20 h-20 bg-surface rounded-lg relative overflow-hidden shrink-0 border border-line">
                {item.image_url ? (
                  <Image src={item.image_url} alt="" fill sizes="80px" className="object-cover" />
                ) : null}
              </div>

              <div className="flex-1 min-w-0">
                <Link
                  href={`/products/${item.slug}`}
                  className="font-medium text-sm hover:text-brand line-clamp-2"
                >
                  {item.name}
                </Link>
                <p className="text-sm text-muted mt-0.5 tabular">{money(item.price)} each</p>

                <div className="flex items-center gap-3 mt-2">
                  <select
                    value={item.quantity}
                    onChange={(e) => updateQuantity(item.product_id, Number(e.target.value))}
                    aria-label={`Quantity for ${item.name}`}
                    className="border border-line rounded-lg px-2 py-1 text-sm bg-paper tabular"
                  >
                    {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => removeItem(item.product_id)}
                    className="text-sm text-muted hover:text-alert"
                  >
                    Remove
                  </button>
                </div>
              </div>

              <p className="font-semibold text-sm tabular shrink-0">
                {money(Number(item.price) * item.quantity)}
              </p>
            </li>
          ))}
        </ul>

        {/* Summary */}
        <aside className="lg:sticky lg:top-24 h-fit border border-line rounded-xl p-5">
          <h2 className="font-semibold mb-4">Order summary</h2>

          {checking && !totals ? (
            <p className="text-sm text-muted">Checking availability…</p>
          ) : totals ? (
            <dl className="space-y-2 text-sm mb-4">
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
              <div className="flex justify-between pt-2 border-t border-line font-semibold text-base">
                <dt>Total</dt>
                <dd className="tabular">{money(totals.total)}</dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-muted mb-4">
              Could not reach the store. Totals will be confirmed at checkout.
            </p>
          )}

          <div className="border border-cash bg-cash-dim rounded-lg px-3 py-2.5 text-xs mb-4">
            <p className="font-medium text-cash">Cash on delivery</p>
            <p className="text-ink/75 mt-0.5">Pay the courier when your order arrives.</p>
          </div>

          <Link
            href="/checkout"
            aria-disabled={unavailable.length > 0}
            className={`block text-center rounded-lg px-5 py-3 text-sm font-medium transition-colors ${
              unavailable.length > 0
                ? 'bg-surface text-faint pointer-events-none'
                : 'bg-ink text-white hover:bg-brand'
            }`}
          >
            {unavailable.length > 0 ? 'Fix items above to continue' : 'Continue to checkout'}
          </Link>

          <Link
            href="/products"
            className="block text-center text-sm text-muted hover:text-ink mt-3"
          >
            Keep shopping
          </Link>
        </aside>
      </div>
    </div>
  );
}
