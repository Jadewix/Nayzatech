import Link from 'next/link';
import Image from 'next/image';
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
 *
 * WHAT IS NOT ON THIS PAGE, AND WHY
 * ---------------------------------
 * The layout it is modelled on carries a five-star review badge and a strip of
 * manufacturer logos. Both are omitted: this shop has no reviews yet, and it
 * does not stock those manufacturers. A shop that opens with a borrowed badge
 * is the kind customers stop trusting the moment they notice.
 *
 * What replaces them is the thing that is true and unusual here — you pay the
 * courier, in cash, at the door — so the hero and the strip below it both say
 * that instead.
 */
export default async function HomePage() {
  /**
   * Promise.all runs these requests at the same time rather than one after
   * another. Sequential awaits here would make the page three times slower for
   * no reason.
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
  const threshold = Number(storeInfo?.delivery?.free_delivery_threshold) || 0;

  /**
   * With a small catalogue, Featured and New arrivals can be the same eight
   * products. Showing one grid twice is what makes a shop look padded, so the
   * second section drops anything already shown above it.
   */
  const featuredIds = new Set(featured.map((p) => p.id));
  const arrivals = newest.filter((p) => !featuredIds.has(p.id)).slice(0, 8);

  return (
    <div>
      {/* ================= HERO ================= */}
      <section className="mx-auto max-w-6xl px-4 pt-6">
        <div className="overflow-hidden rounded-2xl bg-brand text-white">
          <div className="grid items-center gap-8 p-8 sm:p-12 lg:grid-cols-[1.1fr_0.9fr] lg:p-14">
            <div>
              <p className="eyebrow text-white/70">Cash on delivery</p>
              <h1 className="display mt-4 text-4xl sm:text-5xl lg:text-[3.4rem]">
                Nothing to pay
                <br />
                until it arrives.
              </h1>
              <p className="mt-5 max-w-md leading-relaxed text-white/80">
                Laptops, PC parts, phone cases and everyday electronics. Order in a
                minute, we call to confirm, and you hand the courier the cash at your
                door.
              </p>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link
                  href="/products"
                  className="inline-flex min-h-12 items-center rounded-lg bg-ink px-6 py-3 text-[0.95rem] font-medium text-white transition-opacity hover:opacity-90"
                >
                  Browse everything
                </Link>
                {threshold > 0 && (
                  <span className="inline-flex min-h-12 items-center rounded-lg bg-white/10 px-4 py-3 text-sm text-white/90">
                    Free delivery over {money(threshold)}
                  </span>
                )}
              </div>
            </div>

            {/*
              The reference fills this half with a lifestyle photograph. There
              isn't one, so it holds the docket instead: the three steps of a
              cash-on-delivery order, which is the actual difference between
              this shop and every other electronics shop. Hidden on small
              screens, where the headline above already says it.
            */}
            <div className="hidden rounded-xl bg-ink/25 p-6 lg:block">
              <p className="eyebrow text-white/50">How an order works</p>
              <ol className="mt-5 space-y-5">
                <Step number="01" title="You order">
                  Product ids and quantities only. No card, no account.
                </Step>
                <Step number="02" title="We call">
                  A real person confirms the order before anything is packed.
                </Step>
                <Step number="03" title="You pay the courier">
                  Cash, at the door, once it is in your hands.
                </Step>
              </ol>
            </div>
          </div>
        </div>
      </section>

      {/* ================= CATEGORIES ================= */}
      {topLevel.length > 0 && (
        <Section
          eyebrow="Departments"
          title="Shop by category"
          className="mx-auto max-w-6xl px-4"
        >
          <div className="rail sm:grid sm:grid-cols-2 lg:grid-cols-4">
            {topLevel.map((category) => (
              <Link
                key={category.id}
                href={`/products?category=${category.slug}`}
                className="group relative w-[68vw] max-w-[16rem] overflow-hidden rounded-xl border border-line bg-surface transition-colors hover:border-brand sm:w-auto sm:max-w-none"
              >
                <div className="relative aspect-[4/3]">
                  {category.image_url ? (
                    <Image
                      src={category.image_url}
                      alt={category.name}
                      fill
                      sizes="(max-width: 640px) 68vw, 25vw"
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    /* Same treatment as an image-less product: dark tray, real
                       information, no apology. The description is clamped to one
                       line so every tile's name sits on the same baseline. */
                    <div className="relative flex h-full flex-col justify-end bg-tray p-4">
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 opacity-[0.16]"
                        style={{
                          backgroundImage:
                            'linear-gradient(to right, var(--color-tray-2) 1px, transparent 1px), linear-gradient(to bottom, var(--color-tray-2) 1px, transparent 1px)',
                          backgroundSize: '24px 24px',
                        }}
                      />
                      <p className="relative display text-lg text-white">{category.name}</p>
                      {category.description && (
                        <p className="relative mt-1 line-clamp-1 text-xs leading-relaxed text-tray-ink">
                          {category.description}
                        </p>
                      )}
                    </div>
                  )}
                </div>
                {category.image_url && (
                  <div className="p-4">
                    <p className="font-semibold">{category.name}</p>
                  </div>
                )}
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

      {/* ================= FULL-BLEED BAND ================= */}
      <section className="mt-20 bg-ink text-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 lg:grid-cols-[1.2fr_0.8fr] lg:items-end lg:py-20">
          <div>
            <p className="eyebrow text-white/40">Why cash on delivery</p>
            <h2 className="display mt-4 text-3xl sm:text-4xl">
              You have not spent anything
              <br className="hidden sm:block" /> until you are holding it.
            </h2>
          </div>
          <p className="leading-relaxed text-white/60">
            No card details are entered on this site, so there is nothing to be
            leaked and nothing to charge back. If the courier arrives and the
            order is wrong, you simply do not pay.
          </p>
        </div>
      </section>

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

/**
 * One step of the hero docket. Numbered because these genuinely are a sequence
 * — the call has to happen before the courier leaves — not because numbers look
 * tidy.
 */
function Step({ number, title, children }) {
  return (
    <li className="flex gap-4">
      <span className="mt-0.5 font-mono text-xs tracking-widest text-white/40">{number}</span>
      <div>
        <p className="font-semibold">{title}</p>
        <p className="mt-0.5 text-sm leading-relaxed text-white/60">{children}</p>
      </div>
    </li>
  );
}
