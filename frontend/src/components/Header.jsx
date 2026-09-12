'use client';

import Link from 'next/link';
import { useCart } from './CartProvider';
import SearchBar from './SearchBar';

const STORE_NAME = process.env.NEXT_PUBLIC_STORE_NAME || 'Tech Store';

/**
 * The top bar.
 *
 * Mobile-first: the fixed MobileTabBar owns Home / Shop / Cart at the bottom, so
 * up here a phone gets the wordmark and a full-width search — the one control a
 * shopper opens the site to use — on its own row. From `sm:` up the bottom bar
 * disappears, so the inline nav, a compact search and the cart button all move
 * onto the single top row.
 */
export default function Header() {
  const { itemCount, hydrated } = useCart();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/95 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex h-16 items-center gap-6">
          <Link href="/" className="display shrink-0 text-xl">
            {STORE_NAME}
          </Link>

          <nav className="hidden items-center gap-6 text-sm text-muted lg:flex">
            <Link href="/products" className="hover:text-ink">All products</Link>
            <Link href="/products?category=laptops" className="hover:text-ink">Laptops</Link>
            <Link href="/products?category=pc-parts" className="hover:text-ink">PC parts</Link>
            <Link href="/products?category=phone-cases" className="hover:text-ink">Cases</Link>
          </nav>

          {/* Inline search from sm: up, where there is room on the row. */}
          <div className="ml-auto hidden max-w-xs flex-1 sm:block">
            <SearchBar />
          </div>

          <Link
            href="/cart"
            className="relative hidden items-center gap-2 rounded-lg border border-line px-3.5 py-2 text-sm font-medium transition-colors hover:border-brand sm:flex"
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

        {/* Phone-only search row. On sm: up the inline box above covers it. */}
        <div className="pb-3 sm:hidden">
          <SearchBar />
        </div>
      </div>
    </header>
  );
}
