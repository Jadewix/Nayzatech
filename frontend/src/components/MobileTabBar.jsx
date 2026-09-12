'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCart } from './CartProvider';

/**
 * Primary navigation on phones.
 *
 * HIG (Layout > Platform > Mobile): the standard primary-navigation pattern on
 * mobile is a bottom tab bar, not a hidden menu. The desktop header's nav is
 * `hidden sm:flex`, so without this a phone user could reach only the cart.
 * Fixed to the bottom, where the thumb rests.
 *
 * Hidden from `sm:` up, where the top header takes over. Each target is a full
 * tab column, comfortably past the 44pt minimum touch size, and the whole bar
 * clears the home indicator via `pb-safe`.
 */

const TABS = [
  { href: '/', label: 'Home', match: (p) => p === '/', icon: HomeIcon },
  { href: '/products', label: 'Shop', match: (p) => p.startsWith('/products'), icon: GridIcon },
  { href: '/cart', label: 'Cart', match: (p) => p.startsWith('/cart') || p.startsWith('/checkout'), icon: BagIcon, badge: true },
];

export default function MobileTabBar() {
  const pathname = usePathname() || '/';
  const { itemCount, hydrated } = useCart();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 backdrop-blur pb-safe sm:hidden"
    >
      <ul className="flex">
        {TABS.map((tab) => {
          const active = tab.match(pathname);
          const Icon = tab.icon;
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`relative flex min-h-[3.25rem] flex-col items-center justify-center gap-1 py-2 text-[0.68rem] font-medium ${
                  active ? 'text-brand' : 'text-muted'
                }`}
              >
                <span className="relative">
                  <Icon active={active} />
                  {tab.badge && hydrated && itemCount > 0 && (
                    <span className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[0.6rem] font-semibold text-white tabular">
                      {itemCount}
                    </span>
                  )}
                </span>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/* --- Icons: inline, currentColor, filled when active for a clear selected state --- */

function HomeIcon({ active }) {
  return (
    <Svg>
      <path
        d="M3 10.5 12 3l9 7.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M5.5 9.5V20h13V9.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
        fill={active ? 'currentColor' : 'none'}
        fillOpacity={active ? 0.12 : 0}
      />
    </Svg>
  );
}

function GridIcon({ active }) {
  const fill = active ? 'currentColor' : 'none';
  const op = active ? 0.12 : 0;
  return (
    <Svg>
      {[
        [4, 4],
        [13, 4],
        [4, 13],
        [13, 13],
      ].map(([x, y]) => (
        <rect
          key={`${x}-${y}`}
          x={x}
          y={y}
          width="7"
          height="7"
          rx="1.6"
          stroke="currentColor"
          strokeWidth="1.7"
          fill={fill}
          fillOpacity={op}
        />
      ))}
    </Svg>
  );
}

function BagIcon({ active }) {
  return (
    <Svg>
      <path
        d="M6 8h12l-1 12H7L6 8Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
        fill={active ? 'currentColor' : 'none'}
        fillOpacity={active ? 0.12 : 0}
      />
      <path
        d="M9 8V6.5a3 3 0 0 1 6 0V8"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}

function Svg({ children }) {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  );
}
