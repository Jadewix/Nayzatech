import Link from 'next/link';
import Image from 'next/image';
import SpecPlate from './SpecPlate';
import { money } from '@/lib/format';

/**
 * One product in a grid.
 *
 * A plain server component — no 'use client'. It renders to HTML on the server,
 * which is exactly what you want for a catalogue: Google indexes the product
 * names and prices, and the page shows content before any JavaScript loads.
 *
 * Two states for the image slot: a photograph if one has been uploaded, and
 * otherwise a SpecPlate showing the product's real specification. Neither reads
 * as missing.
 *
 * The discount badge shows the percentage rather than the word "Sale", because
 * "28% off" is a number a shopper can act on and "Sale" is not.
 */
export default function ProductCard({ product }) {
  const price = product.effective_price ?? product.sale_price ?? product.base_price;
  const onSale =
    product.sale_price != null && Number(product.sale_price) < Number(product.base_price);
  const soldOut = product.in_stock === false;

  const discount = onSale
    ? Math.round((1 - Number(product.sale_price) / Number(product.base_price)) * 100)
    : 0;

  return (
    <Link
      href={`/products/${product.slug}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-line bg-paper transition-colors hover:border-brand"
    >
      <div className="relative aspect-square overflow-hidden bg-surface">
        {product.image_url ? (
          <Image
            src={product.image_url}
            alt={product.name}
            fill
            /* Tells the browser which image size to download at each breakpoint,
               so phones do not fetch a desktop-sized file. */
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <SpecPlate product={product} />
        )}

        {/* Only one badge can win the corner. A discount outranks "new". */}
        {onSale && !soldOut && discount > 0 && (
          <span className="absolute left-2 top-2 rounded bg-sale px-2 py-1 font-mono text-[0.6rem] font-semibold uppercase tracking-wider text-white">
            −{discount}%
          </span>
        )}

        {/* Dark veil, not a light one: this sits over a photograph on some
            cards and over a dark spec plate on others, and only a dark scrim
            keeps the label legible on both. */}
        {soldOut && (
          <span className="absolute inset-0 flex items-center justify-center bg-ink/70 font-mono text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-white">
            Sold out
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <p className="eyebrow mb-1.5 truncate text-faint">
          {product.category_name || product.brand || 'Product'}
        </p>
        <h3 className="mb-2 line-clamp-2 text-[0.95rem] font-semibold leading-snug transition-colors group-hover:text-brand">
          {product.name}
        </h3>
        <div className="mt-auto flex items-baseline gap-2">
          <span className="tabular text-[1.05rem] font-semibold">{money(price)}</span>
          {onSale && (
            <span className="tabular text-xs text-faint line-through">
              {money(product.base_price)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
