'use client';

import { useState } from 'react';
import {
  setOrderStatus,
  recordDeliveryAttempt,
  ApiError,
} from '@/lib/adminApi';
import { money } from '@/lib/format';
import {
  STATUS_FLOW,
  ACTION_LABELS,
  ACTION_HINTS,
  StatusPill,
  isTerminal,
} from './OrderStatus';

/**
 * One order, expandable into the actions you can take on it.
 *
 * Collapsed it is a scannable row: number, customer, cash to collect, status.
 * Expanded it shows the phone number (the single most important field in a COD
 * shop — you cannot confirm an order without calling), the address, the line
 * items, and the buttons for the transitions the database will accept.
 *
 * THE TWO ACTIONS THAT LOOK ALIKE AND ARE NOT
 * -------------------------------------------
 * "Log a failed visit" and "Give up on delivery" both describe a courier
 * coming back with the goods, and conflating them is the classic COD mistake.
 *
 *   Log a failed visit  — nobody home, no cash on hand, wrong address. The
 *                         order stays out for delivery so tomorrow's round can
 *                         try again. Just increments the attempt counter.
 *   Give up             — terminal. The order is closed and cannot be reopened.
 *
 * They are visually separated below for that reason: the retry is a quiet
 * secondary button, the give-up sits with the other destructive actions.
 */
export default function OrderCard({ order, onChanged, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [note, setNote] = useState('');

  const next = STATUS_FLOW[order.status] || [];
  const terminal = isTerminal(order.status);
  const address = order.shipping_address || {};
  const items = order.items || [];

  async function run(action) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setNote('');
      await onChanged?.();
    } catch (err) {
      // The database's message is better than anything we could invent here:
      // on an illegal transition it names the moves that WOULD be accepted.
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  function move(status) {
    const confirmNeeded = status === 'cancelled' || status === 'failed_delivery';
    if (confirmNeeded) {
      const ok = window.confirm(
        `${ACTION_LABELS[status]} for ${order.order_number}?\n\nThis is final — the order cannot be reopened afterwards.`
      );
      if (!ok) return;
    }
    run(() => setOrderStatus(order.id, status, { note: note.trim() || undefined }));
  }

  return (
    <div className="rounded-lg border border-line bg-paper">
      {/* --- Collapsed row ------------------------------------------------ */}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
        aria-expanded={open}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[0.7rem] font-semibold tracking-wide text-accent">
              {order.order_number}
            </span>
            {order.delivery_attempts > 0 && (
              <span className="rounded bg-alert-dim px-1.5 py-0.5 font-mono text-[0.6rem] font-semibold uppercase text-alert">
                {order.delivery_attempts} failed {order.delivery_attempts === 1 ? 'visit' : 'visits'}
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-sm font-semibold text-ink">{order.customer_name}</p>
          <p className="truncate text-xs text-muted">
            {order.hours_waiting != null && order.status === 'pending'
              ? `Waiting ${order.hours_waiting}h · `
              : ''}
            {items.length} {items.length === 1 ? 'item' : 'items'}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className="tabular text-sm font-semibold text-ink">{money(order.total_amount)}</p>
          <StatusPill status={order.status} className="mt-1" />
        </div>
      </button>

      {/* --- Expanded -------------------------------------------------------- */}
      {open && (
        <div className="border-t border-line px-4 py-4">
          {/*
            The phone number is a link, not text. On a phone this dials; that is
            the whole confirmation workflow in one tap.
          */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <a
              href={`tel:${order.customer_phone}`}
              className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2.5 text-xs font-semibold tracking-[0.1em] uppercase text-paper hover:opacity-90"
            >
              Call {order.customer_phone}
            </a>
            {order.customer_email && (
              <a href={`mailto:${order.customer_email}`} className="text-xs text-muted hover:text-ink">
                {order.customer_email}
              </a>
            )}
          </div>

          <Detail label="Deliver to">
            {[address.line1, address.line2, address.city, address.region, address.postal_code, address.country]
              .filter(Boolean)
              .join(', ') || '—'}
          </Detail>

          {order.notes && <Detail label="Customer note">{order.notes}</Detail>}
          {order.admin_notes && (
            <Detail label="Internal notes">
              <span className="whitespace-pre-line">{order.admin_notes}</span>
            </Detail>
          )}

          {/* Items */}
          <Detail label="Items">
            <ul className="space-y-1">
              {items.map((item) => (
                <li key={item.id} className="flex justify-between gap-3">
                  <span className="min-w-0 truncate">
                    {item.quantity} × {item.product_name}
                  </span>
                  <span className="tabular shrink-0">
                    {money(Number(item.price_at_purchase) * item.quantity)}
                  </span>
                </li>
              ))}
            </ul>
          </Detail>

          {/* Money. Delivery is shown separately because the courier collects
              one number and needs to know what it is made of. */}
          <div className="mt-3 space-y-1 rounded-md bg-surface px-3 py-2.5 text-sm">
            <Row label="Items" value={money(order.subtotal)} />
            <Row label="Delivery" value={money(order.delivery_fee)} />
            <div className="flex justify-between border-t border-line pt-1.5 font-semibold text-ink">
              <span>Collect in cash</span>
              <span className="tabular text-cash">{money(order.total_amount)}</span>
            </div>
          </div>

          {error && (
            <p className="mt-3 rounded-md border border-alert/20 bg-alert-dim px-3 py-2 text-sm text-alert">
              {error}
            </p>
          )}

          {terminal ? (
            <p className="mt-4 rounded-md border border-dashed border-line px-3 py-2.5 text-xs text-muted">
              This order is closed. Its status is final and cannot be changed.
            </p>
          ) : (
            <div className="mt-4">
              <label
                htmlFor={`note-${order.id}`}
                className="block font-mono text-[0.65rem] font-semibold tracking-[0.12em] uppercase text-muted"
              >
                Note (optional)
              </label>
              <input
                id={`note-${order.id}`}
                type="text"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Courier name, what the customer said..."
                className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <p className="mt-1 text-xs text-faint">
                Saved to the order's internal notes. Customers never see it.
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                {next
                  .filter((status) => status !== 'cancelled' && status !== 'failed_delivery')
                  .map((status) => (
                    <ActionButton
                      key={status}
                      status={status}
                      busy={busy}
                      primary
                      onClick={() => move(status)}
                    />
                  ))}
              </div>

              {/* The retry, kept away from the terminal actions on purpose. */}
              {order.status === 'shipped' && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(() => recordDeliveryAttempt(order.id, note.trim() || undefined))}
                  className="mt-2 w-full rounded-md border border-line px-4 py-2.5 text-xs font-semibold tracking-[0.1em] uppercase text-ink hover:bg-surface disabled:opacity-50"
                >
                  Log a failed visit — keep trying
                </button>
              )}

              <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
                {next
                  .filter((status) => status === 'cancelled' || status === 'failed_delivery')
                  .map((status) => (
                    <ActionButton
                      key={status}
                      status={status}
                      busy={busy}
                      onClick={() => move(status)}
                    />
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ActionButton({ status, busy, primary = false, onClick }) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      title={ACTION_HINTS[status]}
      className={
        primary
          ? 'flex-1 rounded-md bg-accent px-4 py-2.5 text-xs font-semibold tracking-[0.1em] uppercase text-paper hover:opacity-90 disabled:opacity-50'
          : 'rounded-md border border-alert/30 px-4 py-2 text-xs font-semibold tracking-[0.1em] uppercase text-alert hover:bg-alert-dim disabled:opacity-50'
      }
    >
      {ACTION_LABELS[status] || status}
    </button>
  );
}

function Detail({ label, children }) {
  return (
    <div className="mt-3">
      <p className="font-mono text-[0.65rem] font-semibold tracking-[0.12em] uppercase text-muted">
        {label}
      </p>
      <div className="mt-0.5 text-sm text-ink">{children}</div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between text-muted">
      <span>{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
}
