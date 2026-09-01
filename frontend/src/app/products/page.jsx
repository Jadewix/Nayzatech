import Link from 'next/link';
import { getProducts, getCategories } from '@/lib/api';
import ProductGrid from '@/components/ProductGrid';

export const metadata = { title: 'All products' };

/**
 * Product listing with filters.
 *
 * Filter state lives in the URL (?category=laptops&sort=price_asc) rather than
 * in React state. That is worth doing deliberately: a filtered view becomes a
 * link you can share, the back button works, and because this is a server
 * component the filtered results are rendered on the server and indexable.
 *
 * In Next.js 15+ `searchParams` is a Promise and must be awaited.
 */
export default async function ProductsPage({ searchParams }) {
  const params = await searchParams;

  const filters = {
    category: params.category,
    search: params.search,
    sort: params.sort || 'newest',
    in_stock: params.in_stock,
    featured: params.featured,
    min_price: params.min_price,
    max_price: params.max_price,
    page: params.page || 1,
    limit: 12,
  };

  const [products, categories] = await Promise.all([
    getProducts(filters).catch(() => []),
    getCategories({ format: 'tree' }).catch(() => []),
  ]);

  const pagination = products.meta?.pagination;
  const activeCategory = params.category;

  /** Rebuild the current URL with one parameter changed. */
  function buildUrl(changes) {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...params, ...changes })) {
      if (value !== undefined && value !== null && value !== '') next.set(key, String(value));
    }
    const qs = next.toString();
    return `/products${qs ? `?${qs}` : ''}`;
  }

  const sortOptions = [
    ['newest', 'Newest'],
    ['price_asc', 'Price: low to high'],
    ['price_desc', 'Price: high to low'],
    ['name_asc', 'Name A–Z'],
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight mb-1">
        {params.search ? `Results for “${params.search}”` : 'All products'}
      </h1>
      <p className="text-sm text-muted mb-6 tabular">
        {pagination ? `${pagination.total} product${pagination.total === 1 ? '' : 's'}` : ''}
      </p>

      <div className="grid lg:grid-cols-[220px_1fr] gap-8">

        {/* Filters */}
        <aside className="space-y-6">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-faint mb-2.5">
              Category
            </h2>
            <ul className="space-y-1 text-sm">
              <li>
                <Link
                  href={buildUrl({ category: undefined, page: undefined })}
                  className={!activeCategory ? 'text-brand font-medium' : 'text-muted hover:text-ink'}
                >
                  All categories
                </Link>
              </li>
              {categories.map((category) => (
                <li key={category.id}>
                  <Link
                    href={buildUrl({ category: category.slug, page: undefined })}
                    className={
                      activeCategory === category.slug
                        ? 'text-brand font-medium'
                        : 'text-muted hover:text-ink'
                    }
                  >
                    {category.name}
                  </Link>
                  {category.children?.length > 0 && (
                    <ul className="ml-3 mt-1 space-y-1 border-l border-line pl-3">
                      {category.children.map((child) => (
                        <li key={child.id}>
                          <Link
                            href={buildUrl({ category: child.slug, page: undefined })}
                            className={
                              activeCategory === child.slug
                                ? 'text-brand font-medium'
                                : 'text-muted hover:text-ink'
                            }
                          >
                            {child.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-faint mb-2.5">
              Sort by
            </h2>
            <ul className="space-y-1 text-sm">
              {sortOptions.map(([value, label]) => (
                <li key={value}>
                  <Link
                    href={buildUrl({ sort: value, page: undefined })}
                    className={
                      filters.sort === value ? 'text-brand font-medium' : 'text-muted hover:text-ink'
                    }
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-faint mb-2.5">
              Availability
            </h2>
            <Link
              href={buildUrl({ in_stock: params.in_stock ? undefined : 'true', page: undefined })}
              className={`text-sm ${params.in_stock ? 'text-brand font-medium' : 'text-muted hover:text-ink'}`}
            >
              {params.in_stock ? '✓ In stock only' : 'In stock only'}
            </Link>
          </div>

          {(params.category || params.search || params.in_stock || params.featured) && (
            <Link href="/products" className="inline-block text-sm text-alert hover:underline">
              Clear all filters
            </Link>
          )}
        </aside>

        {/* Results */}
        <div>
          <ProductGrid
            products={products}
            emptyMessage="Nothing matches those filters. Try clearing one."
          />

          {pagination && pagination.total_pages > 1 && (
            <nav className="flex items-center justify-center gap-2 mt-10">
              {pagination.has_previous && (
                <Link
                  href={buildUrl({ page: pagination.page - 1 })}
                  className="border border-line rounded-lg px-4 py-2 text-sm hover:border-brand"
                >
                  Previous
                </Link>
              )}
              <span className="text-sm text-muted px-3 tabular">
                Page {pagination.page} of {pagination.total_pages}
              </span>
              {pagination.has_next && (
                <Link
                  href={buildUrl({ page: pagination.page + 1 })}
                  className="border border-line rounded-lg px-4 py-2 text-sm hover:border-brand"
                >
                  Next
                </Link>
              )}
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}
