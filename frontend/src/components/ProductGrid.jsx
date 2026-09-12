import Link from 'next/link';
import ProductCard from './ProductCard';

/**
 * A grid of products, or a considered empty state.
 *
 * HIG (Patterns > Empty states): an empty screen is an invitation to act, not
 * an apology. So it says what happened, and offers the one control that undoes
 * it — rather than a dashed box reading "No products found."
 */
export default function ProductGrid({ products, emptyMessage = 'No products found.', emptyAction }) {
  if (!products || products.length === 0) {
    return (
      <div className="rounded-2xl bg-surface px-6 py-16 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-paper text-faint">
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" fill="none" />
            <path d="m20 20-3.2-3.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </div>
        <p className="mx-auto mt-4 max-w-sm text-sm leading-relaxed text-muted">{emptyMessage}</p>
        {emptyAction && (
          <Link
            href={emptyAction.href}
            className="mt-5 inline-flex min-h-11 items-center rounded-full bg-ink px-5 text-sm font-medium text-white transition-colors hover:bg-brand"
          >
            {emptyAction.label}
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 sm:gap-5">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
