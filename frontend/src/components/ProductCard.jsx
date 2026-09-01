import Link from 'next/link';
import Image from 'next/image';
import { money } from '@/lib/format';

/**
 * One product in a grid.
 *
 * A plain server component — no 'use client'. It renders to HTML on the server,
 * which is exactly what you want for a catalogue: Google indexes the product
 * names and prices, and the page shows content before any JavaScript loads.
 */
export default function ProductCard({ product }) {
  const price = product.effective_price ?? product.sale_price ?? product.base_price;
  const onSale = product.sale_price != null && Number(product.sale_price) < Number(product.base_price);
  const outOfStock = product.stock_quantity === 0;

  return (
    <Link
      href={`/products/${product.slug}`}
      className="group border border-line rounded-xl overflow-hidden hover:border-brand transition-colors flex flex-col"
    >
      <div className="aspect-square bg-surface relative overflow-hidden">
        {product.image_url ? (
          <Image
            src={product.image_url}
            alt={product.name}
            fill
            /* Tells the browser which image size to download at each breakpoint,
               so phones do not fetch a desktop-sized file. */
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-faint text-xs">
            No image
          </div>
        )}

        {onSale && !outOfStock && (
          <span className="absolute top-2 left-2 bg-alert text-white text-xs font-medium px-2 py-1 rounded">
            Sale
          </span>
        )}
        {outOfStock && (
          <span className="absolute inset-0 bg-paper/75 flex items-center justify-center text-sm font-medium">
            Out of stock
          </span>
        )}
      </div>

      <div className="p-3.5 flex flex-col flex-1">
        {product.brand && (
          <p className="text-xs text-faint uppercase tracking-wide mb-1">{product.brand}</p>
        )}
        <h3 className="text-sm font-medium leading-snug line-clamp-2 mb-2 group-hover:text-brand transition-colors">
          {product.name}
        </h3>
        <div className="mt-auto flex items-baseline gap-2">
          <span className="font-semibold tabular">{money(price)}</span>
          {onSale && (
            <span className="text-xs text-faint line-through tabular">
              {money(product.base_price)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
