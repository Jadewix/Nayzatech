'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { signOut, getDashboard } from '@/lib/adminApi';

/**
 * Primary navigation for the panel.
 *
 * WHY THIS REPLACED A DROPDOWN
 * ----------------------------
 * Every screen used to reach the others through a chevron beside the page
 * title. That hid the whole panel behind a tap and gave no sense of where you
 * were or what was waiting — the two things navigation exists to answer. Worse,
 * the counts that tell you there is work to do (orders needing a call, unread
 * messages) were only visible *after* opening the menu.
 *
 * Now the destinations are always on screen, and the counts sit on them:
 *   phone   — a bottom tab bar, thumb-reachable, the platform-standard pattern
 *   desktop — a fixed sidebar, which is the same information without the
 *             compromise a small screen forces
 *
 * Rendered once by the layout, so it survives navigation between screens and
 * does not re-fetch its counts on every page load.
 */

const ITEMS = [
  { href: '/admin',            label: 'Today',      icon: HomeIcon,  exact: true },
  { href: '/admin/orders',     label: 'Orders',     icon: OrderIcon, badge: 'orders' },
  { href: '/admin/products',   label: 'Products',   icon: BoxIcon },
  { href: '/admin/categories', label: 'Categories', icon: TagIcon },
  { href: '/admin/messages',   label: 'Inbox',      icon: MailIcon,  badge: 'messages' },
];

export default function AdminNav() {
  const pathname = usePathname() || '/admin';
  const router = useRouter();
  const [counts, setCounts] = useState({ orders: 0, messages: 0 });

  /**
   * Re-read the counts whenever the screen changes. The layout keeps this
   * component mounted, so without the pathname dependency the badges would
   * still show what was true when the panel was first opened — including after
   * you just cleared the queue they are counting.
   *
   * Best-effort: a failure here must never break the navigation the whole panel
   * sits in, so there is no error state. The badges simply do not appear.
   */
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
  }, [pathname]);

  async function handleSignOut() {
    await signOut();
    router.replace('/admin/login');
    router.refresh();
  }

  function isActive(item) {
    return item.exact ? pathname === item.href : pathname.startsWith(item.href);
  }

  return (
    <>
      {/* ---------- Desktop: fixed sidebar ---------- */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-console lg:flex">
        <div className="px-5 pt-7">
          <p className="font-mono text-[0.65rem] font-medium uppercase tracking-[0.28em] text-accent">
            {'// Nayzatech'}
          </p>
          <p className="mt-1 text-lg font-bold tracking-tight text-white">Management</p>
        </div>

        <nav aria-label="Admin sections" className="mt-7 flex-1 px-3">
          <ul className="space-y-1">
            {ITEMS.map((item) => {
              const active = isActive(item);
              const count = item.badge ? counts[item.badge] : 0;
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${
                      active
                        ? 'bg-console-2 text-white'
                        : 'text-white/55 hover:bg-console-2/60 hover:text-white'
                    }`}
                  >
                    <Icon active={active} />
                    <span className="flex-1">{item.label}</span>
                    {count > 0 && <Badge>{count}</Badge>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-white/10 p-3">
          <button
            type="button"
            onClick={handleSignOut}
            className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-white/55 transition-colors hover:bg-console-2/60 hover:text-white"
          >
            <ExitIcon />
            Log out
          </button>
        </div>
      </aside>

      {/* ---------- Mobile: top bar ---------- */}
      <header className="flex items-center justify-between bg-console px-4 py-3 lg:hidden">
        <p className="font-mono text-[0.65rem] font-medium uppercase tracking-[0.28em] text-accent">
          {'// Nayzatech · Management'}
        </p>
        <button
          type="button"
          onClick={handleSignOut}
          className="-mr-2 min-h-9 px-2 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-white/60 hover:text-white"
        >
          Log out
        </button>
      </header>

      {/* ---------- Mobile: bottom tab bar ---------- */}
      <nav
        aria-label="Admin sections"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 backdrop-blur pb-safe lg:hidden"
      >
        <ul className="flex">
          {ITEMS.map((item) => {
            const active = isActive(item);
            const count = item.badge ? counts[item.badge] : 0;
            const Icon = item.icon;
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`relative flex min-h-[3.25rem] flex-col items-center justify-center gap-1 py-2 text-[0.62rem] font-semibold ${
                    active ? 'text-accent' : 'text-muted'
                  }`}
                >
                  <span className="relative">
                    <Icon active={active} />
                    {count > 0 && (
                      <span className="tabular absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[0.6rem] font-semibold text-paper">
                        {count}
                      </span>
                    )}
                  </span>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

function Badge({ children }) {
  return (
    <span className="tabular flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[0.65rem] font-semibold text-paper">
      {children}
    </span>
  );
}

/* --- Icons: inline, currentColor, filled when active --- */

function Svg({ children }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      {children}
    </svg>
  );
}

const stroke = {
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  fill: 'none',
};

function fillWhenActive(active) {
  return { fill: active ? 'currentColor' : 'none', fillOpacity: active ? 0.15 : 0 };
}

function HomeIcon({ active }) {
  return (
    <Svg>
      <path d="M3 10.5 12 3l9 7.5" {...stroke} />
      <path d="M5.5 9.5V20h13V9.5" {...stroke} {...fillWhenActive(active)} />
    </Svg>
  );
}

function OrderIcon({ active }) {
  return (
    <Svg>
      <path d="M5 7h14l-1 13H6L5 7Z" {...stroke} {...fillWhenActive(active)} />
      <path d="M9 7V5.5a3 3 0 0 1 6 0V7" {...stroke} />
    </Svg>
  );
}

function BoxIcon({ active }) {
  return (
    <Svg>
      <path d="M12 3.5 20 8v8l-8 4.5L4 16V8l8-4.5Z" {...stroke} {...fillWhenActive(active)} />
      <path d="M4 8l8 4.5L20 8M12 12.5V20.5" {...stroke} />
    </Svg>
  );
}

function TagIcon({ active }) {
  return (
    <Svg>
      <path d="M11.5 3.5H20v8.5l-8.5 8.5L3 12l8.5-8.5Z" {...stroke} {...fillWhenActive(active)} />
      <circle cx="16" cy="8" r="1.5" {...stroke} />
    </Svg>
  );
}

function MailIcon({ active }) {
  return (
    <Svg>
      <rect x="3" y="5.5" width="18" height="13" rx="2" {...stroke} {...fillWhenActive(active)} />
      <path d="m3.5 7 8.5 6 8.5-6" {...stroke} />
    </Svg>
  );
}

function ExitIcon() {
  return (
    <Svg>
      <path d="M15 5.5H6.5v13H15M11 12h9M17 9l3 3-3 3" {...stroke} />
    </Svg>
  );
}
