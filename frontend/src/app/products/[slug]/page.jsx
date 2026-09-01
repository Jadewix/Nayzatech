import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getProduct } from '@/lib/api';
import { money, specLabel, specValue } from '@/lib/format';
import AddToCart from '@/components/AddToCart';
import ProductGrid from '@/components/ProductGrid';

/**
 * generateMetadata runs on the server before the page renders, so the real
 * product name and description end up in the <title> and meta tags. This is
 * what makes an individual product findable on Google — the single biggest
 * reason to build a store on Next.js rather than a plain React SPA.
 */
export async function generateMetadata({ params }) {
  const { slug } = await params;
  try {
    const product = await getProduct(slug);
    return {
      title: product.name,
      description:
        product.short_description ||
        product.description?.slice(0, 155) ||
        `Buy ${product.name}. Cash on delivery.`,
      openGraph: {
        title: product.name,
        description: product.short_description || '',
        images: product.image_url ? [product.image_url] : [],
      },
    };
  } catch {
    return { title: 'Product not found' };
  }
}

export default async function ProductPage({ params }) {
  const { slug } = await params;

  let product;
  try {
    product = await getProduct(slug);
  } catch (error) {
    // A missing product must render the 404 page, not a crash.
    if (error.code === 'PRODUCT_NOT_FOUND' || error.status === 404) notFound();
    throw error;
  }

  const price = product.effective_price ?? product.sale_price ?? product.base_price;
  const onSale =
    product.sale_price != null && Number(product.sale_price) < Number(product.base_price);
  const specs = Object.entries(product.specs || {});

  /** Spec keys the admin marked as display-worthy, in their chosen order. */
  const specOrder = (product.spec_fields || []).map((f) => f.spec_key);
  const orderedSpecs = [
    ...specs.filter(([key]) => specOrder.includes(key))
           .sort(([a], [b]) => specOrder.indexOf(a) - specOrder.indexOf(b)),
    ...specs.filter(([key]) => !specOrder.includes(key)),
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">

      <nav className="text-sm text-muted mb-6 flex flex-wrap items-center gap-1.5">
        <Link href="/products" className="hover:text-ink">Products</Link>
        {product.category_slug && (
          <>
            <span className="text-faint">/</span>
            <Link href={`/products?category=${product.category_slug}`} className="hover:text-ink">
              {product.category_name}
            </Link>
          </>
        )}
      </nav>

      <div className="grid md:grid-cols-2 gap-10 mb-16">

        {/* Images */}
        <div className="space-y-3">
          <div className="aspect-square bg-surface rounded-xl relative overflow-hidden border border-line">
            {product.image_url ? (
              <Image
                src={product.image_url}
                alt={product.name}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover"
                priority
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-faint text-sm">
                No image
              </div>
            )}
          </div>
          {product.gallery_urls?.length > 0 && (
            <div className="grid grid-cols-4 gap-3">
              {product.gallery_urls.slice(0, 4).map((url) => (
                <div key={url} className="aspect-square bg-surface rounded-lg relative overflow-hidden border border-line">
                  <Image src={url} alt="" fill sizes="12vw" className="object-cover" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Details */}
        <div>
          {product.brand && (
            <p className="text-xs text-faint uppercase tracking-wide mb-1.5">{product.brand}</p>
          )}
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3 text-balance">
            {product.name}
          </h1>

          <div className="flex items-baseline gap-3 mb-1">
            <span className="text-2xl font-bold tabular">{money(price)}</span>
            {onSale && (
              <span className="text-base text-faint line-through tabular">
                {money(product.base_price)}
              </span>
            )}
          </div>
          <p className="text-xs text-muted mb-5 font-mono">SKU {product.sku}</p>

          {product.short_description && (
            <p className="text-muted leading-relaxed mb-6">{product.short_description}</p>
          )}

          <div className="mb-6">
            <AddToCart product={product} />
          </div>

          {/* Cash on delivery is the store's whole payment model — say so plainly
              on the page where someone decides to buy. */}
          <div className="border border-cash bg-cash-dim rounded-lg px-4 py-3 text-sm">
            <p className="font-medium text-cash mb-0.5">Cash on delivery</p>
            <p className="text-ink/80">
              Nothing is charged online. You pay the courier when it arrives.
            </p>
          </div>
        </div>
      </div>

      {/* Description */}
      {product.description && (
        <section className="mb-14 max-w-2xl">
          <h2 className="text-lg font-semibold mb-3">About this product</h2>
          <p className="text-muted leading-relaxed whitespace-pre-line">{product.description}</p>
        </section>
      )}

      {/* Specs — the JSONB column rendered with the admin's labels and units */}
      {orderedSpecs.length > 0 && (
        <section className="mb-14 max-w-2xl">
          <h2 className="text-lg font-semibold mb-3">Specifications</h2>
          <div className="border border-line rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <tbody>
                {orderedSpecs.map(([key, value], index) => {
                  const field = (product.spec_fields || []).find((f) => f.spec_key === key);
                  return (
                    <tr key={key} className={index % 2 ? 'bg-surface' : ''}>
                      <th scope="row" className="text-left font-medium px-4 py-2.5 w-2/5 align-top">
                        {field?.label || specLabel(key)}
                      </th>
                      <td className="px-4 py-2.5 text-muted">
                        {specValue(value)}{field?.unit ? ` ${field.unit}` : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {product.related_products?.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-4">You might also like</h2>
          <ProductGrid products={product.related_products} />
        </section>
      )}
    </div>
  );
}
