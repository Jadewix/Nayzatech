import Link from 'next/link';
import Image from 'next/image';
import { getProducts, getCategories, getStoreInfo } from '@/lib/api';
import ProductGrid from '@/components/ProductGrid';
import SearchBar from '@/components/SearchBar';
import SpecPlate from '@/components/SpecPlate';
import { money } from '@/lib/format';

/**
 * Home page.
 *
 * A SERVER component (no 'use client'): data is fetched on the server and the
 * browser receives finished HTML, so Google indexes product names and prices.
 * The only client island is the search box, which ships its own small bundle.
 *
 * Designed phone-first. The order down the page — search, departments, featured
 * gear, the catalogue — is the order a shopper on a phone actually wants: find
 * the thing, or browse into it. What this page does NOT do is lecture about how
 * paying works; cash on delivery is explained once, at checkout, where it is
 * about to matter.
 */
export default async function HomePage() {
  const [featured, newest, categories, storeInfo] = await Promise.all([
    getProducts({ featured: true, limit: 4 }).catch(() => []),
    getProducts({ sort: 'newest', limit: 8 }).catch(() => []),
    getCategories().catch(() => []),
    getStoreInfo().catch(() => null),
  ]);

  const topLevel = categories.filter((c) => !c.parent_id);
  const threshold = Number(storeInfo?.delivery?.free_delivery_threshold) || 0;

  /**
   * With a small catalogue, Featured and New arrivals can be the same eight
   * products. Showing one grid twice is what makes a shop look padded, so the
   * second section drops anything already shown above it.
   */
  const featuredIds = new Set(featured.map((p) => p.id));
  const arrivals = newest.filter((p) => !featuredIds.has(p.id)).slice(0, 8);
  const spotlight = featured[0] || newest[0] || null;

  return (
    <div>
      {/* ================= HERO ================= */}
      <section className="mx-auto max-w-6xl px-4 pt-4 sm:pt-6">
        <div className="hero-mesh overflow-hidden rounded-3xl text-white">
          <div className="grid items-center gap-8 p-6 sm:p-10 lg:grid-cols-[1.1fr_0.9fr] lg:p-14">
            <div>
              <p className="eyebrow text-white/70">Laptops · PC parts · Accessories</p>
              <h1 className="display mt-4 text-[2.5rem] leading-[1.02] sm:text-5xl lg:text-[3.4rem]">
                Everything your
                <br />
                setup needs.
              </h1>
              <p className="mt-5 max-w-md leading-relaxed text-white/80">
                Laptops, components, phone cases and everyday electronics —
                search for what you came for, or browse the whole shop.
              </p>

              {/* The search box is the hero's primary action on every screen. */}
              <div className="mt-7 max-w-md">
                <SearchBar variant="hero" />
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Link
                  href="/products"
                  className="inline-flex min-h-12 items-center rounded-full bg-white px-6 py-3 text-[0.95rem] font-semibold text-ink transition-transform hover:-translate-y-0.5"
                >
                  Browse everything
                </Link>
                {threshold > 0 && (
                  <span className="inline-flex min-h-12 items-center rounded-full bg-white/10 px-4 py-3 text-sm text-white/90 ring-1 ring-inset ring-white/15">
                    Free delivery over {money(threshold)}
                  </span>
                )}
              </div>
            </div>

            {/*
              The reference fills this half with a lifestyle photograph. There
              isn't one, so it holds a real product instead — the first featured
              item, floated on the gradient as a single glowing card. Real gear,
              real price, one tap in. Hidden on phones, where the search above is
              already the whole point.
            */}
            {spotlight && (
              <Link
                href={`/products/${spotlight.slug}`}
                className="group hidden lg:block"
              >
                <div className="rounded-2xl bg-white/10 p-3 ring-1 ring-inset ring-white/15 backdrop-blur-sm transition-transform duration-300 group-hover:-translate-y-1">
                  <div className="relative aspect-square overflow-hidden rounded-xl bg-surface">
                    {spotlight.image_url ? (
                      <Image
                        src={spotlight.image_url}
                        alt={spotlight.name}
                        fill
                        sizes="40vw"
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <SpecPlate product={spotlight} />
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-3 px-1 pb-1 pt-3 text-white">
                    <div className="min-w-0">
                      <p className="eyebrow text-white/50">Featured</p>
                      <p className="mt-1 truncate font-semibold">{spotlight.name}</p>
                    </div>
                    <span className="tabular shrink-0 rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-ink">
                      {money(
                        spotlight.effective_price ??
                          spotlight.sale_price ??
                          spotlight.base_price
                      )}
                    </span>
                  </div>
                </div>
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* ================= CATEGORIES ================= */}
      {topLevel.length > 0 && (
        <Section
          eyebrow="Departments"
          title="Shop by category"
          action={{ href: '/products', label: 'View all' }}
          className="mx-auto max-w-6xl px-4"
        >
          <div className="rail sm:grid sm:grid-cols-2 lg:grid-cols-4">
            {topLevel.map((category, i) => (
              <Link
                key={category.id}
                href={`/products?category=${category.slug}`}
                className="card-lift group w-[62vw] max-w-[15rem] overflow-hidden rounded-2xl border border-line bg-paper sm:w-auto sm:max-w-none"
              >
                <div className="relative aspect-[4/3]">
                  {category.image_url ? (
                    <Image
                      src={category.image_url}
                      alt={category.name}
                      fill
                      sizes="(max-width: 640px) 62vw, 25vw"
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    /* No photo yet: a bright, tinted panel rather than a grey box,
                       cycling through a few brand-family washes so a row of them
                       reads as a set instead of a repeat. */
                    <div
                      className={`flex h-full flex-col justify-end p-4 ${CATEGORY_TINTS[i % CATEGORY_TINTS.length]}`}
                    >
                      <p className="display text-xl text-ink">{category.name}</p>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 p-4">
                  <p className="font-semibold">{category.name}</p>
                  <span
                    aria-hidden="true"
                    className="text-brand transition-transform group-hover:translate-x-1"
                  >
                    →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </Section>
      )}

      {/* ================= FEATURED ================= */}
      {featured.length > 0 && (
        <Section
          eyebrow="Hand picked"
          title="Featured"
          action={{ href: '/products?featured=true', label: 'See all featured' }}
          className="mx-auto max-w-6xl px-4"
        >
          <ProductGrid products={featured} />
        </Section>
      )}

      {/* ================= DELIVERY BAND ================= */}
      {threshold > 0 && (
        <section className="mx-auto mt-20 max-w-6xl px-4">
          <div className="hero-mesh flex flex-col items-start justify-between gap-5 rounded-3xl p-7 text-white sm:flex-row sm:items-center sm:p-9">
            <div>
              <p className="eyebrow text-white/60">On the house</p>
              <p className="display mt-2 text-2xl sm:text-3xl">
                Free delivery over {money(threshold)}
              </p>
            </div>
            <Link
              href="/products"
              className="inline-flex min-h-12 items-center rounded-full bg-white px-6 py-3 text-[0.95rem] font-semibold text-ink transition-transform hover:-translate-y-0.5"
            >
              Fill the cart
            </Link>
          </div>
        </section>
      )}

      {/* ================= NEW ARRIVALS ================= */}
      <Section
        eyebrow="Just added"
        title="New arrivals"
        action={{ href: '/products', label: 'See the whole catalogue' }}
        className="mx-auto max-w-6xl px-4"
      >
        <ProductGrid
          products={arrivals}
          emptyMessage="Nothing new since the products above. Browse the full catalogue for everything in stock."
        />
      </Section>
    </div>
  );
}

/* A few brand-family washes for photo-less category tiles. */
const CATEGORY_TINTS = [
  'bg-brand-dim',
  'bg-surface',
  'bg-sale-dim',
  'bg-cash-dim',
];

/**
 * A page section: monospace eyebrow, display heading, optional link on the
 * right. Consistent spacing lives here rather than being retyped per section,
 * which is what stops the rhythm drifting as sections are added.
 */
function Section({ eyebrow, title, action, className = '', children }) {
  return (
    <section className={`mt-20 ${className}`}>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <p className="eyebrow text-faint">{eyebrow}</p>
          <h2 className="display mt-2 text-2xl sm:text-3xl">{title}</h2>
        </div>
        {action && (
          <Link
            href={action.href}
            className="shrink-0 text-sm font-medium text-brand hover:underline"
          >
            {action.label}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}
