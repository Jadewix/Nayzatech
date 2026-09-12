'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getDashboard } from '@/lib/adminApi';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import { StatusPill } from '@/components/admin/OrderStatus';
import { money, timeAgo } from '@/lib/format';

/**
 * The panel's home screen.
 *
 * WHAT IT IS FOR
 * --------------
 * /admin/dashboard has always returned the whole state of the shop — the call
 * queue with phone numbers, revenue, failed deliveries, products that are
 * published but unbuyable — and the panel used two numbers from it to draw
 * badges. Everything else was fetched again, screen by screen, or not shown.
 *
 * So this screen answers one question: what needs a human right now? Work comes
 * first and in the order it costs money to ignore, numbers come second, and
 * when there is genuinely nothing to do it says so rather than inventing
 * something to fill the space.
 *
 * The confirmation queue leads because it is the only item with a deadline
 * attached: cash on delivery has no payment proving an order is real, so an
 * unconfirmed order that sits here turns into a failed delivery and a courier
 * carrying goods nobody wants.
 */
export default function AdminDashboardPage() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data: payload } = await getDashboard();
      setData(payload);
    } catch (err) {
      if (err.code === 'NOT_AUTHENTICATED' || err.status === 401) {
        router.replace('/admin/login');
        return;
      }
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { load(); }, [load]);

  const queue = data?.orders_needing_confirmation || [];
  const soldOut = data?.sold_out_products || [];
  const unread = data?.unread_messages || 0;
  const failed = data?.orders?.failed_deliveries || 0;

  // "Nothing to do" has to be earned, so it is computed from every source of
  // work rather than from the queue alone.
  const allClear =
    !loading && !error && queue.length === 0 && unread === 0 && soldOut.length === 0;

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div>
      <AdminPageHeader eyebrow={today} title="Today" />

      {error && (
        <p className="mt-5 rounded-lg border border-alert/20 bg-alert-dim px-4 py-3 text-sm text-alert">
          {error}
        </p>
      )}

      {loading && <p className="py-16 text-center text-sm text-muted">Loading…</p>}

      {!loading && !error && (
        <>
          {allClear && (
            <div className="mt-6 rounded-xl border border-cash/20 bg-cash-dim px-5 py-8 text-center">
              <p className="text-sm font-semibold text-cash">Nothing needs you right now</p>
              <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-ink/70">
                Every order has been confirmed, the inbox is clear, and nothing on
                the storefront is sold out.
              </p>
            </div>
          )}

          {/* ============ 1. THE CALL QUEUE ============ */}
          {queue.length > 0 && (
            <section className="mt-7">
              <SectionHead
                title="Call these customers"
                count={queue.length}
                action={{ href: '/admin/orders', label: 'Open orders' }}
              />
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                Confirm each order is real before anything is packed. Oldest first.
              </p>

              <ul className="mt-4 space-y-2.5">
                {queue.map((order) => (
                  <li
                    key={order.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-line bg-paper p-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[0.7rem] font-semibold tracking-wide text-accent">
                          {order.order_number}
                        </span>
                        <span className="text-[0.7rem] text-faint">{timeAgo(order.created_at)}</span>
                      </div>
                      <p className="mt-0.5 truncate text-sm font-semibold text-ink">
                        {order.customer_name}
                      </p>
                      <p className="tabular text-xs text-muted">
                        {money(order.total_amount)} to collect
                      </p>
                    </div>

                    {/* A link, not text: on the phone this shop is actually run
                        from, one tap starts the call the queue exists for. */}
                    <a
                      href={`tel:${order.customer_phone}`}
                      className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg bg-accent px-4 text-xs font-semibold uppercase tracking-[0.1em] text-paper hover:opacity-90"
                    >
                      <PhoneIcon />
                      Call
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ============ 2. OTHER THINGS WAITING ============ */}
          {(unread > 0 || failed > 0 || soldOut.length > 0) && (
            <section className="mt-8 grid gap-3 sm:grid-cols-2">
              {unread > 0 && (
                <AlertCard
                  href="/admin/messages"
                  tone="accent"
                  count={unread}
                  title={`${unread} unread ${unread === 1 ? 'message' : 'messages'}`}
                  body="Someone asked a question through the contact form."
                />
              )}
              {soldOut.length > 0 && (
                <AlertCard
                  href="/admin/products"
                  tone="alert"
                  count={soldOut.length}
                  title={`${soldOut.length} sold out but published`}
                  body="Still on the storefront and still indexed, but nobody can order them."
                />
              )}
              {failed > 0 && (
                <AlertCard
                  href="/admin/orders"
                  tone="alert"
                  count={failed}
                  title={`${failed} failed ${failed === 1 ? 'delivery' : 'deliveries'}`}
                  body="The courier gave up and the stock went back on sale."
                />
              )}
            </section>
          )}

          {/* ============ 3. THE NUMBERS ============ */}
          <section className="mt-9">
            <SectionHead title="The numbers" />
            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat
                label="Collected, 30 days"
                value={money(data?.revenue?.last_30_days)}
                hint="Delivered orders only"
                strong
              />
              <Stat label="Collected, lifetime" value={money(data?.revenue?.lifetime)} />
              <Stat
                label="Out for delivery"
                value={data?.orders?.out_for_delivery ?? 0}
                hint="Courier carrying cash"
              />
              <Stat
                label="Live products"
                value={data?.products?.active ?? 0}
                hint={`${data?.products?.total ?? 0} in total`}
              />
            </div>
            <p className="mt-3 text-xs leading-relaxed text-faint">
              Revenue counts delivered orders only — with cash on delivery the money
              does not exist until the courier hands it over.
            </p>
          </section>

          {/* ============ 4. RECENT ORDERS ============ */}
          {(data?.recent_orders || []).length > 0 && (
            <section className="mt-9 pb-4">
              <SectionHead
                title="Latest orders"
                action={{ href: '/admin/orders', label: 'See all' }}
              />
              <ul className="mt-4 divide-y divide-line overflow-hidden rounded-xl border border-line bg-paper">
                {data.recent_orders.map((order) => (
                  <li
                    key={order.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[0.7rem] font-semibold tracking-wide text-accent">
                          {order.order_number}
                        </span>
                        <span className="text-[0.7rem] text-faint">{timeAgo(order.created_at)}</span>
                      </div>
                      <p className="mt-0.5 truncate text-sm text-ink">{order.customer_name}</p>
                    </div>
                    <span className="tabular shrink-0 text-sm font-semibold text-ink">
                      {money(order.total_amount)}
                    </span>
                    <StatusPill status={order.status} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------- */

function SectionHead({ title, count, action }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-ink">
        {title}
        {count != null && (
          <span className="tabular flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[0.65rem] text-paper">
            {count}
          </span>
        )}
      </h2>
      {action && (
        <Link href={action.href} className="shrink-0 text-xs font-medium text-accent hover:underline">
          {action.label}
        </Link>
      )}
    </div>
  );
}

/**
 * A piece of work, sized to be read in a glance and tapped.
 *
 * Tone is information, not decoration: accent means "someone is waiting on
 * you", alert means "the shop is losing something while this is true".
 */
function AlertCard({ href, tone, count, title, body }) {
  const tones = {
    accent: 'border-accent/20 bg-accent-dim',
    alert: 'border-alert/20 bg-alert-dim',
  };
  const numberTones = { accent: 'text-accent', alert: 'text-alert' };

  return (
    <Link
      href={href}
      className={`flex items-start gap-3 rounded-xl border p-4 transition-opacity hover:opacity-85 ${tones[tone]}`}
    >
      <span className={`tabular text-2xl font-bold leading-none ${numberTones[tone]}`}>
        {count}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-ink">{title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-ink/65">{body}</span>
      </span>
    </Link>
  );
}

function Stat({ label, value, hint, strong = false }) {
  return (
    <div className="rounded-xl border border-line bg-paper p-4">
      <p className="font-mono text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-muted">
        {label}
      </p>
      <p
        className={`tabular mt-1.5 font-bold leading-tight tracking-tight ${
          strong ? 'text-[1.6rem] text-cash' : 'text-[1.35rem] text-ink'
        }`}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[0.7rem] text-faint">{hint}</p>}
    </div>
  );
}

function PhoneIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M6.5 3.5h3l1.5 4-2 1.5a12 12 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
