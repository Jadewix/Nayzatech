'use client';

import Link from 'next/link';
import { useCart } from './CartProvider';

const STORE_NAME = process.env.NEXT_PUBLIC_STORE_NAME || 'Tech Store';

export default function Header() {
  const { itemCount, hydrated } = useCart();

  return (
    <header className="border-b border-line sticky top-0 bg-paper/95 backdrop-blur z-40">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-6">
        <Link href="/" className="font-bold text-lg tracking-tight shrink-0">
          {STORE_NAME}
        </Link>

        <nav className="hidden sm:flex items-center gap-5 text-sm text-muted">
          <Link href="/products" className="hover:text-ink">All products</Link>
          <Link href="/products?category=laptops" className="hover:text-ink">Laptops</Link>
          <Link href="/products?category=pc-parts" className="hover:text-ink">PC parts</Link>
          <Link href="/products?category=phone-cases" className="hover:text-ink">Cases</Link>
        </nav>

        <div className="ml-auto flex items-center gap-4">
          <Link href="/track" className="text-sm text-muted hover:text-ink hidden sm:inline">
            Track order
          </Link>
          <Link
            href="/cart"
            className="relative flex items-center gap-2 text-sm font-medium border border-line rounded-lg px-3 py-1.5 hover:border-brand transition-colors"
          >
            Cart
            {/*
              Only render the badge after hydration. The server has no access to
              localStorage, so it always renders zero; showing the real count on
              the first client pass would be a hydration mismatch.
            */}
            {hydrated && itemCount > 0 && (
              <span className="bg-brand text-white text-xs rounded-full min-w-5 h-5 px-1.5 flex items-center justify-center tabular">
                {itemCount}
              </span>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}
