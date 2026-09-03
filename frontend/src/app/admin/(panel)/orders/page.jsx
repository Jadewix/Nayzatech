'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { listPendingConfirmation, listOrders } from '@/lib/adminApi';
import AdminHeader from '@/components/admin/AdminHeader';
import OrderCard from '@/components/admin/OrderCard';
import { ALL_STATUSES, STATUS_LABELS } from '@/components/admin/OrderStatus';

/**
 * The orders dashboard.
 *
 * It opens on the confirmation queue rather than on all orders, because that is
 * the one screen with a deadline attached. Cash on delivery has no payment to
 * prove an order is real, so every new order waits for a human to phone the
 * customer before anything is packed. Orders that sit in that queue turn into
 * failed deliveries, so the queue is the default view and the wait time is
 * shown on every card.
 *
 * "All orders" is the second tab, for looking something up.
 */
export default function OrdersDashboardPage() {
  const router = useRouter();
  const [tab, setTab] = useState('queue');            // 'queue' | 'all'
  const [status, setStatus] = useState('');           // filter, 'all orders' tab only
  const [queue, setQueue] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      // Both are fetched together so the queue badge stays right while you are
      // looking at the other tab.
      const [pending, all] = await Promise.all([
        listPendingConfirmation(),
        listOrders({ status: status || undefined, limit: 50 }),
      ]);
      setQueue(pending.data?.orders || []);
      setOrders(Array.isArray(all.data) ? all.data : []);
    } catch (err) {
      if (err.code === 'NOT_AUTHENTICATED' || err.status === 401) {
        router.replace('/admin/login');
        return;
      }
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [status, router]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const shown = tab === 'queue' ? queue : orders;

  return (
    <div>
      <AdminHeader current="orders" />

      {/* Tabs */}
      <div className="mt-7 flex gap-2">
        <Tab active={tab === 'queue'} onClick={() => setTab('queue')} count={queue.length}>
          Needs a call
        </Tab>
        <Tab active={tab === 'all'} onClick={() => setTab('all')}>
          All orders
        </Tab>
      </div>

      {tab === 'queue' ? (
        <p className="mt-3 text-sm text-muted">
          Phone each customer to check the order is real, then confirm it. Nothing should be
          packed before this call.
        </p>
      ) : (
        <div className="mt-3">
          <label htmlFor="status" className="sr-only">
            Filter by status
          </label>
          <select
            id="status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="w-full rounded-md border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-accent"
          >
            <option value="">Every status</option>
            {ALL_STATUSES.map((value) => (
              <option key={value} value={value}>
                {STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
      )}

      {error && (
        <p className="mt-4 rounded-md border border-alert/20 bg-alert-dim px-3 py-2 text-sm text-alert">
          {error}
        </p>
      )}

      <div className="mt-4 space-y-3 pb-16">
        {loading && <p className="py-10 text-center text-sm text-muted">Loading…</p>}

        {!loading && shown.length === 0 && (
          <p className="rounded-xl border border-dashed border-line py-12 text-center text-sm text-muted">
            {tab === 'queue'
              ? 'Nothing waiting on a call. Every order has been confirmed.'
              : status
                ? `No orders with the status “${STATUS_LABELS[status]}”.`
                : 'No orders yet. They appear here the moment someone checks out.'}
          </p>
        )}

        {!loading &&
          shown.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onChanged={load}
              /* In the queue the next action is always "call and confirm", so
                 open the first card — one less tap on the job you do most. */
              defaultOpen={tab === 'queue' && order.id === shown[0]?.id}
            />
          ))}
      </div>
    </div>
  );
}

function Tab({ active, onClick, count, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded-md px-4 py-2.5 text-xs font-semibold tracking-[0.1em] uppercase transition-colors ${
        active ? 'bg-ink text-paper' : 'border border-line bg-paper text-muted hover:text-ink'
      }`}
    >
      {children}
      {count != null && count > 0 && (
        <span
          className={`tabular rounded-full px-1.5 text-[0.65rem] ${
            active ? 'bg-paper/20 text-paper' : 'bg-accent text-paper'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}
