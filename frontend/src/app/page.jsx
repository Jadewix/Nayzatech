import Link from 'next/link';
import { getProducts, getCategories, getStoreInfo } from '@/lib/api';
import ProductGrid from '@/components/ProductGrid';
import { money } from '@/lib/format';

/**
 * Home page.
 *
 * This is a SERVER component (the default in the App Router — note there is no
 * 'use client' at the top). The data is fetched on the server and the browser
 * receives finished HTML. That is the whole reason to use Next.js for a store:
 * Google sees your product names and prices, so people can find them by
 * searching. A client-rendered app would serve an empty page to the crawler.
 */
export default async function HomePage() {
  /**
   * Promise.all runs these three requests at the same time rather than one
   * after another. Sequential awaits here would make the page three times
   * slower for no reason.
   *
   * .catch() on each one means a single failing endpoint degrades that section
   * instead of blanking the whole homepage.
   */
  const [featured, newest, categories, storeInfo] = await Promise.all([
    getProducts({ featured: true, limit: 4 }).catch(() => []),
    getProducts({ sort: 'newest', limit: 8 }).catch(() => []),
    getCategories().catch(() => []),
    getStoreInfo().catch(() => null),
  ]);

  const topLevel = categories.filter((c) => !c.parent_id);
  const threshold = storeInfo?.delivery?.free_delivery_threshold;

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">

      {/* Hero */}
      <section className="mb-14">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3 text-balance">
          Tech that arrives at your door
        </h1>
        <p className="text-muted max-w-xl mb-5 leading-relaxed">
          Laptops, PC parts, phone cases and electronics. Pay the courier in cash
          when your order arrives — nothing is charged online.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/products"
            className="bg-ink text-white rounded-lg px-5 py-2.5 text-sm font-medium hover:bg-brand transition-colors"
          >
            Browse everything
          </Link>
          {threshold ? (
            <span className="inline-flex items-center rounded-lg border border-cash bg-cash-dim text-cash px-4 py-2.5 text-sm">
              Free delivery over {money(threshold)}
            </span>
          ) : null}
        </div>
      </section>

      {/* Categories */}
      {topLevel.length > 0 && (
        <section className="mb-14">
          <h2 className="text-lg font-semibold mb-4">Shop by category</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {topLevel.map((category) => (
              <Link
                key={category.id}
                href={`/products?category=${category.slug}`}
                className="border border-line rounded-xl p-4 hover:border-brand hover:bg-surface transition-colors"
              >
                <p className="font-medium text-sm mb-0.5">{category.name}</p>
                {category.description && (
                  <p className="text-xs text-muted line-clamp-2">{category.description}</p>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Featured */}
      {featured.length > 0 && (
        <section className="mb-14">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-lg font-semibold">Featured</h2>
            <Link href="/products?featured=true" className="text-sm text-brand hover:underline">
              See all
            </Link>
          </div>
          <ProductGrid products={featured} />
        </section>
      )}

      {/* Newest */}
      <section>
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-lg font-semibold">New arrivals</h2>
          <Link href="/products" className="text-sm text-brand hover:underline">
            See all
          </Link>
        </div>
        <ProductGrid
          products={newest}
          emptyMessage="No products yet. If the backend is running, check that you ran 04_seed.sql."
        />
      </section>
    </div>
  );
}
