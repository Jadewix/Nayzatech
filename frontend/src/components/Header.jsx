'use client';

import Link from 'next/link';
import { useCart } from './CartProvider';

const STORE_NAME = process.env.NEXT_PUBLIC_STORE_NAME || 'Tech Store';

/**
 * The top bar.
 *
 * On phones the fixed MobileTabBar owns navigation and the cart, so this bar
 * carries only the wordmark and search there — no duplicate cart badge, no
 * hamburger hiding links that already have a permanent home at the bottom of
 * the screen. The inline nav and the cart button appear from `sm:` up, where
 * there is no bottom bar.
 */
export default function Header() {
  const { itemCount, hydrated } = useCart();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
        <Link href="/" className="display shrink-0 text-xl">
          {STORE_NAME}
        </Link>

        <nav className="hidden items-center gap-6 text-sm text-muted sm:flex">
          <Link href="/products" className="hover:text-ink">All products</Link>
          <Link href="/products?category=laptops" className="hover:text-ink">Laptops</Link>
          <Link href="/products?category=pc-parts" className="hover:text-ink">PC parts</Link>
          <Link href="/products?category=phone-cases" className="hover:text-ink">Cases</Link>
        </nav>

        <div className="ml-auto hidden items-center gap-4 sm:flex">
          <Link href="/track" className="text-sm text-muted hover:text-ink">
            Track order
          </Link>
          <Link
            href="/cart"
            className="relative flex items-center gap-2 rounded-lg border border-line px-3.5 py-2 text-sm font-medium transition-colors hover:border-brand"
          >
            Cart
            {/*
              Only render the badge after hydration. The server has no access to
              localStorage, so it always renders zero; showing the real count on
              the first client pass would be a hydration mismatch.
            */}
            {hydrated && itemCount > 0 && (
              <span className="tabular flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-xs text-white">
                {itemCount}
              </span>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}
