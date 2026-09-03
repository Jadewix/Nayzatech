'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut, getDashboard } from '@/lib/adminApi';

/**
 * The header shared by every admin dashboard.
 *
 *   MANAGEMENT
 *   Inventory Dashboard  v      <- tap to switch dashboards
 *   [ LOG OUT ]  { children }   <- children is the page's primary action
 *
 * `current` names the open dashboard and decides the title and the tick in the
 * dropdown. Pages pass their primary action (e.g. "Add new product") as
 * children so it sits on the same row as Log out, matching the design.
 *
 * The dropdown carries two live counts — orders waiting on a confirmation call,
 * and unread messages — because both are work that arrives on its own while you
 * are looking at a different screen. One /admin/dashboard call feeds both.
 */

const DASHBOARDS = [
  { id: 'inventory',  label: 'Inventory Dashboard',  href: '/admin' },
  { id: 'orders',     label: 'Orders Dashboard',     href: '/admin/orders',     badge: 'orders' },
  { id: 'categories', label: 'Categories',           href: '/admin/categories' },
  { id: 'messages',   label: 'Messages',             href: '/admin/messages',   badge: 'messages' },
];

export default function AdminHeader({ current = 'inventory', children }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState({ orders: 0, messages: 0 });
  const active = DASHBOARDS.find((d) => d.id === current) ?? DASHBOARDS[0];

  // Best-effort. A failure here must not break the header the whole panel sits
  // in, so there is no error state — the badges simply do not appear.
  useEffect(() => {
    let cancelled = false;
    getDashboard()
      .then(({ data }) => {
        if (cancelled) return;
        setCounts({
          orders: data?.orders?.awaiting_confirmation ?? 0,
          messages: data?.unread_messages ?? 0,
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  async function handleSignOut() {
    await signOut();
    router.replace('/admin/login');
    router.refresh();
  }

  return (
    <header className="pt-8">
      <p className="font-mono text-[0.7rem] font-medium tracking-[0.28em] text-accent uppercase">
        {'// Nayzatech · Management'}
      </p>

      <div className="relative mt-1.5">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex items-center gap-2 text-left"
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <span className="text-[1.85rem] font-bold leading-tight tracking-tight text-ink">
            {active.label}
          </span>
          <Chevron open={open} />
        </button>

        {open && (
          <>
            {/* Click-away backdrop. */}
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div
              role="menu"
              className="absolute z-20 mt-2 w-72 max-w-[85vw] rounded-lg border border-line bg-paper shadow-lg overflow-hidden"
            >
              {DASHBOARDS.map((dashboard) => {
                const isActive = dashboard.id === current;
                const count = dashboard.badge ? counts[dashboard.badge] : 0;
                return (
                  <button
                    key={dashboard.id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setOpen(false);
                      if (!isActive) router.push(dashboard.href);
                    }}
                    className={`flex w-full items-center gap-2 px-4 py-3 text-sm font-semibold tracking-wide uppercase text-left hover:bg-surface ${
                      isActive ? 'text-ink' : 'text-muted'
                    }`}
                  >
                    <span className="w-4 shrink-0 text-accent">{isActive ? '✓' : ''}</span>
                    <span className="flex-1">{dashboard.label}</span>
                    {count > 0 && (
                      <span className="tabular rounded-full bg-accent px-1.5 text-[0.65rem] text-paper">
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-stretch gap-3">
        <button
          type="button"
          onClick={handleSignOut}
          className="rounded-md border border-line bg-paper px-5 py-3 text-xs font-semibold tracking-[0.12em] uppercase text-ink hover:bg-surface"
        >
          Log out
        </button>
        {children}
      </div>
    </header>
  );
}

function Chevron({ open }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      className={`text-muted transition-transform ${open ? 'rotate-180' : ''}`}
      aria-hidden="true"
    >
      <path d="M5 7.5 10 12.5 15 7.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
