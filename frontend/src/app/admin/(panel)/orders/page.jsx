'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { listOrders } from '@/lib/adminApi';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import OrderCard from '@/components/admin/OrderCard';
import { ALL_STATUSES, STATUS_LABELS } from '@/components/admin/OrderStatus';

/**
 * The orders screen: every order, filtered.
 *
 * It used to open on a separate "needs a call" queue tab. That queue now lives
 * on the Today screen, where the rest of the day's work is — so this screen is
 * one list again, and the job it does is looking things up.
 *
 * Confirming an order has not moved: each card still offers exactly the
 * transitions the database will accept, and the database still owns the rules.
 *
 * Filters are held in React state rather than the URL. That is the opposite of
 * the storefront's catalogue, and deliberately so: nobody shares or bookmarks
 * an admin filter, and the panel is behind a login, so there is nothing to gain
 * from making these views linkable.
 */

/** Today, as an <input type="date"> value, in the shop's own timezone. */
function localDay(date = new Date()) {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return shifted.toISOString().slice(0, 10);
}

/** A date that many days before today. */
function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return localDay(date);
}

const PAGE_SIZE = 20;

export default function OrdersPage() {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);

  const [orders, setOrders] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data, meta } = await listOrders({
        status: status || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        page,
        limit: PAGE_SIZE,
      });
      setOrders(Array.isArray(data) ? data : []);
      setPagination(meta?.pagination || null);
    } catch (err) {
      if (err.code === 'NOT_AUTHENTICATED' || err.status === 401) {
        router.replace('/admin/login');
        return;
      }
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [status, fromDate, toDate, page, router]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  /** Any filter change invalidates the page number — page 4 of a new filter is
      usually empty, and landing on an empty page reads as "no orders". */
  function applyRange(from, to) {
    setFromDate(from);
    setToDate(to);
    setPage(1);
  }

  const presets = [
    { label: 'Today', from: localDay(), to: localDay() },
    { label: '7 days', from: daysAgo(6), to: localDay() },
    { label: '30 days', from: daysAgo(29), to: localDay() },
  ];

  const rangeActive = Boolean(fromDate || toDate);
  const filtered = rangeActive || Boolean(status);

  function isPreset(preset) {
    return fromDate === preset.from && toDate === preset.to;
  }

  return (
    <div>
      <AdminPageHeader title="Orders" />

      {/* ---------- Filters ---------- */}
      <div className="mt-6 rounded-xl border border-line bg-paper p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Status" className="min-w-[10rem] flex-1">
            <select
              value={status}
              onChange={(event) => { setStatus(event.target.value); setPage(1); }}
              className="min-h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm outline-none focus:border-accent"
            >
              <option value="">Every status</option>
              {ALL_STATUSES.map((value) => (
                <option key={value} value={value}>{STATUS_LABELS[value]}</option>
              ))}
            </select>
          </Field>

          <Field label="From" className="min-w-[8.5rem] flex-1">
            <input
              type="date"
              value={fromDate}
              max={toDate || undefined}
              onChange={(event) => applyRange(event.target.value, toDate)}
              className="min-h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm outline-none focus:border-accent"
            />
          </Field>

          <Field label="To" className="min-w-[8.5rem] flex-1">
            <input
              type="date"
              value={toDate}
              min={fromDate || undefined}
              onChange={(event) => applyRange(fromDate, event.target.value)}
              className="min-h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm outline-none focus:border-accent"
            />
          </Field>
        </div>

        {/* The ranges actually asked for, so the common case is one tap rather
            than two date pickers. */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {presets.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => applyRange(preset.from, preset.to)}
              aria-pressed={isPreset(preset)}
              className={`min-h-9 rounded-full px-3.5 text-[0.8rem] font-medium transition-colors ${
                isPreset(preset)
                  ? 'bg-ink text-paper'
                  : 'border border-line text-muted hover:border-accent hover:text-ink'
              }`}
            >
              {preset.label}
            </button>
          ))}
          {filtered && (
            <button
              type="button"
              onClick={() => { setStatus(''); applyRange('', ''); }}
              className="min-h-9 px-2 text-[0.8rem] font-medium text-accent hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-alert/20 bg-alert-dim px-4 py-3 text-sm text-alert">
          {error}
        </p>
      )}

      {/* ---------- Results ---------- */}
      {pagination && !loading && (
        <p className="tabular mt-4 text-sm text-muted">
          {pagination.total} {pagination.total === 1 ? 'order' : 'orders'}
          {filtered ? ' match these filters' : ''}
        </p>
      )}

      <div className="mt-3 space-y-3">
        {loading && <p className="py-10 text-center text-sm text-muted">Loading…</p>}

        {!loading && orders.length === 0 && (
          <p className="rounded-xl border border-dashed border-line py-12 text-center text-sm text-muted">
            {filtered
              ? 'No orders match these filters.'
              : 'No orders yet. They appear here the moment someone checks out.'}
          </p>
        )}

        {!loading && orders.map((order) => (
          <OrderCard key={order.id} order={order} onChanged={load} />
        ))}
      </div>

      {pagination && pagination.total_pages > 1 && (
        <nav aria-label="Pagination" className="mt-8 flex items-center justify-center gap-2">
          <PageButton
            enabled={pagination.has_previous}
            onClick={() => setPage((n) => Math.max(1, n - 1))}
            label="Previous page"
          >
            ←
          </PageButton>
          <span className="tabular px-3 text-sm text-muted">
            Page {pagination.page} of {pagination.total_pages}
          </span>
          <PageButton
            enabled={pagination.has_next}
            onClick={() => setPage((n) => n + 1)}
            label="Next page"
          >
            →
          </PageButton>
        </nav>
      )}
    </div>
  );
}

function Field({ label, className = '', children }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block font-mono text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

function PageButton({ enabled, onClick, label, children }) {
  return (
    <button
      type="button"
      disabled={!enabled}
      onClick={onClick}
      aria-label={label}
      className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-line bg-paper text-ink transition-colors hover:border-accent hover:text-accent disabled:opacity-40 disabled:hover:border-line disabled:hover:text-ink"
    >
      {children}
    </button>
  );
}
