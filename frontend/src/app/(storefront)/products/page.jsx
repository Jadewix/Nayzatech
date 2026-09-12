import Link from 'next/link';
import Image from 'next/image';
import { getProducts, getCategories } from '@/lib/api';
import ProductGrid from '@/components/ProductGrid';

/**
 * The shop — browse and filter the catalogue.
 *
 * Filter state lives in the URL (?category=laptops&sort=price_asc) rather than
 * in React state. That is deliberate: a filtered view becomes a link you can
 * share, the back button works, and because this is a server component the
 * filtered results are rendered on the server and indexable.
 *
 * LAYOUT, AND WHY IT IS NOT A SIDEBAR
 * -----------------------------------
 * This page used to put a column of filter links to the left of the grid. On a
 * phone that column has nowhere to go, so it stacked *above* the products and a
 * shopper scrolled past fifteen text links before seeing a single thing for
 * sale. That inverts HIG's first principle — deference: content leads, controls
 * get out of its way.
 *
 * So the facets became a chip rail and a toolbar that read the same at every
 * width, the grid runs full-bleed to the container, and the page is one column.
 * Nothing was lost: category, sort and availability are the only facets the
 * catalogue actually has, and all three are now one tap away instead of a
 * scroll away.
 */

/** Find a category and its parent anywhere in the two-level tree. */
function findCategory(tree, slug) {
  if (!slug) return { category: null, parent: null };
  for (const top of tree) {
    if (top.slug === slug) return { category: top, parent: null };
    for (const child of top.children || []) {
      if (child.slug === slug) return { category: child, parent: top };
    }
  }
  return { category: null, parent: null };
}

/**
 * A collection gets its own title and description in the tab and in search
 * results, rather than every filtered view sharing one generic "All products".
 */
export async function generateMetadata({ searchParams }) {
  const params = await searchParams;

  if (params.search) return { title: `Results for “${params.search}”` };

  if (params.category) {
    const categories = await getCategories({ format: 'tree' }).catch(() => []);
    const { category } = findCategory(categories, params.category);
    if (category) {
      return {
        title: category.name,
        description: category.description || undefined,
      };
    }
  }

  return { title: 'Shop all products' };
}

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
  const activeSlug = params.category;
  const { category: activeCategory, parent: activeParent } = findCategory(categories, activeSlug);

  // The top-level ancestor of whatever is selected — it stays lit in the first
  // rail while a shopper drills into one of its children.
  const activeTop = activeParent || activeCategory;
  const children = activeTop?.children || [];

  /** Rebuild the current URL with one parameter changed. */
  function buildUrl(changes) {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...params, ...changes })) {
      if (value !== undefined && value !== null && value !== '') next.set(key, String(value));
    }
    const qs = next.toString();
    return `/products${qs ? `?${qs}` : ''}`;
  }

  /**
   * Short labels, spelled-out accessible names. A segmented control only works
   * while every segment fits on one line of a phone; "Price: low to high" does
   * not, and an arrow does. Screen readers still hear the full sentence.
   */
  const sortOptions = [
    ['newest', 'Newest', 'Sort by newest'],
    ['price_asc', 'Price ↑', 'Sort by price, low to high'],
    ['price_desc', 'Price ↓', 'Sort by price, high to low'],
    ['name_asc', 'A–Z', 'Sort by name, A to Z'],
  ];

  const heading = params.search
    ? `Results for “${params.search}”`
    : activeCategory?.name || 'All products';

  const count = pagination
    ? `${pagination.total} product${pagination.total === 1 ? '' : 's'}`
    : '';

  // A collection with artwork earns a proper hero; one without falls back to a
  // large title, which is the same information without a decorative grey box.
  const showHero = Boolean(activeCategory?.image_url) && !params.search;

  const hasFilters = Boolean(
    params.category || params.search || params.in_stock || params.featured
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">

      {/* ================= TITLE / COLLECTION HERO ================= */}
      {showHero ? (
        <header className="relative overflow-hidden rounded-3xl">
          <div className="relative aspect-[16/9] sm:aspect-[21/7]">
            <Image
              src={activeCategory.image_url}
              alt=""
              fill
              priority
              sizes="(max-width: 1152px) 100vw, 1152px"
              className="object-cover"
            />
            {/* A scrim, not a tint: the artwork is unknown, and only a gradient
                this dark guarantees the title stays legible over all of them. */}
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/45 to-ink/10"
            />
            <div className="absolute inset-x-0 bottom-0 p-5 sm:p-8">
              <p className="eyebrow text-white/70">Collection</p>
              <h1 className="display mt-2 text-[2rem] text-white sm:text-4xl">{heading}</h1>
              {activeCategory.description && (
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/80">
                  {activeCategory.description}
                </p>
              )}
            </div>
          </div>
        </header>
      ) : (
        <header>
          {/* HIG: Large Title. The page announces where you are before it
              offers anything to change about it. */}
          <h1 className="display text-[2rem] sm:text-4xl">{heading}</h1>
          {activeCategory?.description && (
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
              {activeCategory.description}
            </p>
          )}
        </header>
      )}

      {/* ================= COLLECTION RAIL ================= */}
      {categories.length > 0 && (
        <ChipRail label="Collections" className="mt-6">
          <Chip href={buildUrl({ category: undefined, page: undefined })} active={!activeSlug}>
            All
          </Chip>
          {categories.map((category) => (
            <Chip
              key={category.id}
              href={buildUrl({ category: category.slug, page: undefined })}
              active={activeTop?.slug === category.slug}
            >
              {category.name}
            </Chip>
          ))}
        </ChipRail>
      )}

      {/* Second level, shown only once you are inside a collection that has one.
          Progressive disclosure (HIG): depth appears when it becomes relevant. */}
      {children.length > 0 && (
        <ChipRail label={`Inside ${activeTop.name}`} className="mt-2.5" subtle>
          <Chip
            href={buildUrl({ category: activeTop.slug, page: undefined })}
            active={activeSlug === activeTop.slug}
            subtle
          >
            Everything
          </Chip>
          {children.map((child) => (
            <Chip
              key={child.id}
              href={buildUrl({ category: child.slug, page: undefined })}
              active={activeSlug === child.slug}
              subtle
            >
              {child.name}
            </Chip>
          ))}
        </ChipRail>
      )}

      {/* ================= TOOLBAR ================= */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-line pb-5">
        <div className="flex items-center gap-3">
          <p className="tabular text-sm text-muted">{count}</p>
          <Link
            href={buildUrl({ in_stock: params.in_stock ? undefined : 'true', page: undefined })}
            aria-pressed={Boolean(params.in_stock)}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-[0.8rem] font-medium transition-colors ${
              params.in_stock
                ? 'bg-cash-dim text-cash ring-1 ring-inset ring-cash/25'
                : 'border border-line text-muted hover:border-brand hover:text-ink'
            }`}
          >
            {params.in_stock && <CheckIcon />}
            In stock
          </Link>
        </div>

        {/*
          HIG: a segmented control is the right shape for a small set of
          mutually exclusive choices. The selected segment is a raised white
          thumb on a recessed track — the same depth cue Apple uses, which is
          what makes the state readable at a glance instead of by reading.
        */}
        <div
          role="group"
          aria-label="Sort products"
          className="no-scrollbar flex max-w-full gap-1 overflow-x-auto rounded-full bg-surface p-1"
        >
          {sortOptions.map(([value, label, description]) => {
            const active = filters.sort === value;
            return (
              <Link
                key={value}
                href={buildUrl({ sort: value, page: undefined })}
                aria-label={description}
                aria-current={active ? 'true' : undefined}
                className={`inline-flex min-h-9 shrink-0 items-center rounded-full px-3.5 text-[0.8rem] font-medium transition-colors ${
                  active
                    ? 'bg-paper text-ink shadow-sm'
                    : 'text-muted hover:text-ink'
                }`}
              >
                {label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* ================= ACTIVE FILTERS ================= */}
      {hasFilters && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {params.search && (
            <FilterTag href={buildUrl({ search: undefined, page: undefined })}>
              “{params.search}”
            </FilterTag>
          )}
          {activeCategory && (
            <FilterTag href={buildUrl({ category: undefined, page: undefined })}>
              {activeCategory.name}
            </FilterTag>
          )}
          {params.featured && (
            <FilterTag href={buildUrl({ featured: undefined, page: undefined })}>
              Featured
            </FilterTag>
          )}
          {params.in_stock && (
            <FilterTag href={buildUrl({ in_stock: undefined, page: undefined })}>
              In stock
            </FilterTag>
          )}
          <Link
            href="/products"
            className="ml-1 text-sm font-medium text-brand hover:underline"
          >
            Clear all
          </Link>
        </div>
      )}

      {/* ================= RESULTS ================= */}
      <div className="mt-6">
        <ProductGrid
          products={products}
          emptyMessage={
            hasFilters
              ? 'Nothing matches those filters yet. Try removing one, or browse another collection.'
              : 'No products in the shop yet. Check back shortly.'
          }
          emptyAction={hasFilters ? { href: '/products', label: 'Clear filters' } : null}
        />

        {pagination && pagination.total_pages > 1 && (
          <nav
            aria-label="Pagination"
            className="mt-12 flex items-center justify-center gap-2"
          >
            <PageButton
              href={buildUrl({ page: pagination.page - 1 })}
              enabled={pagination.has_previous}
              label="Previous page"
            >
              ←
            </PageButton>
            <span className="tabular px-4 text-sm text-muted">
              Page {pagination.page} of {pagination.total_pages}
            </span>
            <PageButton
              href={buildUrl({ page: pagination.page + 1 })}
              enabled={pagination.has_next}
              label="Next page"
            >
              →
            </PageButton>
          </nav>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 *  Controls
 * ------------------------------------------------------------------------ */

/**
 * A horizontally scrolling row of chips that bleeds to the screen edge.
 *
 * The negative margin plus matching padding is what makes the first chip align
 * with the page text while the row still scrolls out to the bezel — the detail
 * that separates a native-feeling rail from a boxed-in one.
 */
function ChipRail({ label, className = '', subtle = false, children }) {
  return (
    <nav
      aria-label={label}
      className={`no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 ${
        subtle ? 'pb-0.5' : 'pb-1'
      } ${className}`}
    >
      {children}
    </nav>
  );
}

function Chip({ href, active, subtle = false, children }) {
  const base =
    'inline-flex shrink-0 items-center rounded-full font-medium transition-colors';
  const size = subtle ? 'min-h-9 px-3.5 text-[0.8rem]' : 'min-h-11 px-4 text-sm';

  const tone = active
    ? 'bg-ink text-white'
    : subtle
      ? 'bg-surface text-muted hover:text-ink'
      : 'border border-line bg-paper text-muted hover:border-brand hover:text-ink';

  return (
    <Link href={href} aria-current={active ? 'page' : undefined} className={`${base} ${size} ${tone}`}>
      {children}
    </Link>
  );
}

/** A removable filter. The × is the affordance; the whole tag is the target. */
function FilterTag({ href, children }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-brand-dim px-3.5 text-[0.8rem] font-medium text-brand transition-colors hover:bg-brand hover:text-white"
    >
      {children}
      <span aria-hidden="true" className="text-[0.95rem] leading-none">×</span>
      <span className="sr-only">Remove filter</span>
    </Link>
  );
}

/**
 * A pagination control keeps its footprint when disabled rather than vanishing,
 * so the row does not reflow between pages and the arrows stay where the thumb
 * left them.
 */
function PageButton({ href, enabled, label, children }) {
  if (!enabled) {
    return (
      <span
        aria-hidden="true"
        className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-line text-faint opacity-40"
      >
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      aria-label={label}
      className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-line text-ink transition-colors hover:border-brand hover:text-brand"
    >
      {children}
    </Link>
  );
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="m5 12.5 4.5 4.5L19 7"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
