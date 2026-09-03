import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getOrder } from '@/lib/api';
import { money, formatDate, STATUS_LABELS } from '@/lib/format';

export const metadata = { title: 'Your order' };

/**
 * Order confirmation and tracking.
 *
 * The order id is an unguessable UUID, so this URL works as a tracking link
 * without any login — the same idea as a parcel-tracking link. It is emailed to
 * the customer and it is where checkout lands.
 */
export default async function OrderPage({ params, searchParams }) {
  const { id } = await params;
  const query = await searchParams;
  const justPlaced = query.placed === '1';

  let order;
  try {
    order = await getOrder(id);
  } catch (error) {
    if (error.status === 404 || error.code === 'ORDER_NOT_FOUND') notFound();
    throw error;
  }

  const address = order.shipping_address || {};
  const stillOwes = ['pending', 'confirmed', 'processing', 'shipped'].includes(order.status);

  const steps = ['pending', 'confirmed', 'processing', 'shipped', 'delivered'];
  const currentStep = steps.indexOf(order.status);
  const isTerminal = ['cancelled', 'failed_delivery'].includes(order.status);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">

      {justPlaced && (
        <div className="border border-cash bg-cash-dim rounded-lg px-4 py-3 mb-6">
          <p className="font-semibold text-cash">Order placed</p>
          <p className="text-sm text-ink/80 mt-0.5">
            We have emailed you a confirmation and will call shortly to confirm
            before delivery.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
        <h1 className="font-mono text-2xl font-semibold tracking-tight">{order.order_number}</h1>
        <span className="text-sm text-muted">{formatDate(order.created_at)}</span>
      </div>
      <p className="text-muted mb-6">
        Status: <strong className="text-ink">{STATUS_LABELS[order.status] || order.status}</strong>
      </p>

      {/* Cash due — the number that matters most until it is delivered */}
      {stillOwes && (
        <div className="border-2 border-cash bg-cash-dim rounded-xl px-5 py-4 mb-8 text-center">
          <p className="text-xs uppercase tracking-wide text-cash font-medium">
            Have this ready in cash
          </p>
          <p className="display tabular mt-1 text-3xl text-cash">{money(order.total_amount)}</p>
          <p className="text-sm text-ink/75 mt-1">Payable to the courier on delivery</p>
        </div>
      )}

      {/* Progress */}
      {!isTerminal ? (
        <ol className="flex items-center gap-1 mb-8" aria-label="Order progress">
          {steps.map((step, index) => (
            <li key={step} className="flex-1">
              <div
                className={`h-1.5 rounded-full ${index <= currentStep ? 'bg-cash' : 'bg-line'}`}
                aria-hidden="true"
              />
              <p className={`text-xs mt-1.5 ${index <= currentStep ? 'text-ink' : 'text-faint'}`}>
                {STATUS_LABELS[step]}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <div className="border border-line bg-surface rounded-lg px-4 py-3 mb-8 text-sm">
          <p className="font-medium">{STATUS_LABELS[order.status]}</p>
          <p className="text-muted mt-0.5">
            {order.status === 'cancelled'
              ? 'This order was cancelled. Nothing has been charged.'
              : `The courier could not complete delivery${
                  order.delivery_attempts ? ` after ${order.delivery_attempts} attempt(s)` : ''
                }. Nothing has been charged.`}
          </p>
        </div>
      )}

      {/* Items */}
      <section className="mb-8">
        <h2 className="font-semibold mb-3">Items</h2>
        <ul className="divide-y divide-line border-y border-line">
          {(order.items || []).map((item) => (
            <li key={item.id} className="py-3 flex justify-between gap-4 text-sm">
              <div>
                <p className="font-medium">{item.product_name}</p>
                <p className="text-muted text-xs font-mono mt-0.5">
                  {item.product_sku} · {item.quantity} × {money(item.price_at_purchase)}
                </p>
              </div>
              <p className="font-medium tabular shrink-0">{money(item.line_total)}</p>
            </li>
          ))}
        </ul>

        <dl className="mt-4 space-y-1.5 text-sm max-w-xs ml-auto">
          <div className="flex justify-between">
            <dt className="text-muted">Items</dt>
            <dd className="tabular">{money(order.subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Delivery</dt>
            <dd className="tabular">
              {Number(order.delivery_fee) > 0 ? money(order.delivery_fee) : 'Free'}
            </dd>
          </div>
          <div className="flex justify-between pt-1.5 border-t border-line font-semibold">
            <dt>Total</dt>
            <dd className="tabular">{money(order.total_amount)}</dd>
          </div>
        </dl>
      </section>

      {/* Delivery details */}
      <section className="mb-8">
        <h2 className="font-semibold mb-3">Delivering to</h2>
        <address className="not-italic text-sm text-muted leading-relaxed">
          <span className="text-ink font-medium">{order.customer_name}</span><br />
          {address.line1}<br />
          {address.line2 && <>{address.line2}<br /></>}
          {[address.city, address.region].filter(Boolean).join(', ')}<br />
          {address.postal_code && <>{address.postal_code}<br /></>}
          {address.country}<br />
          <span className="font-mono">{order.customer_phone}</span>
        </address>
        {order.notes && (
          <p className="text-sm text-muted mt-3">
            <span className="font-medium text-ink">Notes: </span>{order.notes}
          </p>
        )}
      </section>

      <div className="flex gap-3">
        <Link
          href="/products"
          className="bg-ink text-white rounded-lg px-5 py-2.5 text-sm font-medium hover:bg-brand transition-colors"
        >
          Keep shopping
        </Link>
      </div>

      <p className="text-xs text-muted mt-6">
        Save this page — it is your tracking link and does not need a login.
      </p>
    </div>
  );
}
