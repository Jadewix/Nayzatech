'use client';

import { useState } from 'react';
import Link from 'next/link';
import { setInStock, deleteProduct } from '@/lib/adminApi';
import { money } from '@/lib/format';

/**
 * One product, as a card in the mobile-first list.
 *
 *   [img]  CATEGORY · SKU              [BRAND]
 *          Product name
 *          $199  $249
 *          ------------------------------------
 *          [AVAILABLE]  [EDIT]   [DELETE]
 *
 * Tech-store styling: sans type, monospace micro-labels, an electric-blue
 * accent and a dark "component tray" image tile — no serif, no gold.
 *
 * The AVAILABLE / SOLD OUT pill is a toggle. It writes the in_stock boolean on
 * the product. There is nothing to count: a product is orderable or it is not.
 */
export default function AdminProductCard({ product, onChanged, onError }) {
  const [inStock, setStock] = useState(product.in_stock ?? true);
  const [busy, setBusy] = useState(false);

  const onSale = product.sale_price != null;

  async function toggleStock() {
    const next = !inStock;
    setBusy(true);
    setStock(next); // optimistic
    try {
      const { data } = await setInStock(product.id, next);
      // Trust what came back rather than the optimistic guess.
      setStock(data?.in_stock ?? next);
      onChanged?.();
    } catch (err) {
      setStock(!next); // roll back
      onError?.(err);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    const ok = window.confirm(
      `Delete "${product.name}"?\n\nThis removes it and its image permanently. Past orders keep their own record, so receipts stay correct.`
    );
    if (!ok) return;
    setBusy(true);
    try {
      await deleteProduct(product.id, { hard: true });
      onChanged?.();
    } catch (err) {
      onError?.(err);
      setBusy(false);
    }
  }

  return (
    <article className="rounded-lg border border-line bg-paper p-4 transition-colors hover:border-accent/40">
      <div className="flex gap-4">
        <Thumb product={product} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {product.category_name && (
              <span className="font-mono text-[0.66rem] font-medium tracking-[0.1em] uppercase text-faint">
                {product.category_name}
              </span>
            )}
            <span className="font-mono text-[0.66rem] tracking-wide text-faint">
              {product.sku}
            </span>
            {product.brand && (
              <span className="ml-auto rounded border border-line bg-surface px-2 py-0.5 font-mono text-[0.62rem] font-medium tracking-[0.08em] uppercase text-muted">
                {product.brand}
              </span>
            )}
          </div>

          <h2 className="mt-1 text-[0.98rem] font-semibold leading-snug text-ink line-clamp-2">
            <Link href={`/admin/products/${product.id}`} className="hover:text-accent">
              {product.name}
            </Link>
          </h2>

          <div className="mt-1 flex items-baseline gap-2 tabular">
            <span className={`text-sm font-semibold ${onSale ? 'text-accent' : 'text-ink'}`}>
              {money(onSale ? product.sale_price : product.base_price)}
            </span>
            {onSale && (
              <span className="text-xs text-faint line-through">{money(product.base_price)}</span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={toggleStock}
          disabled={busy}
          aria-pressed={inStock}
          className={`rounded-md border px-2 py-2.5 text-xs font-semibold tracking-[0.08em] uppercase disabled:opacity-50 ${
            inStock
              ? 'border-cash/40 bg-cash-dim text-cash'
              : 'border-alert/40 bg-alert-dim text-alert'
          }`}
          title="Tap to switch"
        >
          <span className="inline-flex items-center justify-center gap-1.5">
            <span
              className={`h-1.5 w-1.5 rounded-full ${inStock ? 'bg-cash' : 'bg-alert'}`}
              aria-hidden="true"
            />
            {inStock ? 'Available' : 'Sold out'}
          </span>
        </button>

        <Link
          href={`/admin/products/${product.id}`}
          className="rounded-md border border-line bg-paper px-2 py-2.5 text-center text-xs font-semibold tracking-[0.08em] uppercase text-ink hover:border-accent/40 hover:text-accent"
        >
          Edit
        </Link>

        <button
          type="button"
          onClick={handleDelete}
          disabled={busy}
          className="rounded-md border border-alert/40 bg-paper px-2 py-2.5 text-xs font-semibold tracking-[0.08em] uppercase text-alert hover:bg-alert-dim disabled:opacity-50"
        >
          Delete
        </button>
      </div>
    </article>
  );
}

/**
 * Seed and not-yet-photographed products have no image. Instead of an empty
 * box, show a dark component tray with a faint chip glyph — reads "hardware"
 * at a glance and keeps the list tidy until real photos are uploaded.
 */
function Thumb({ product }) {
  const [failed, setFailed] = useState(false);
  const showImage = product.image_url && !failed;

  return (
    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-console">
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={product.image_url}
          alt=""
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <ChipIcon />
      )}
    </div>
  );
}

function ChipIcon() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      className="text-paper/25"
      aria-hidden="true"
    >
      <rect x="7" y="7" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <rect x="10" y="10" width="4" height="4" rx="0.5" fill="currentColor" />
      {[9, 12, 15].map((x) => (
        <line key={`t${x}`} x1={x} y1="4" x2={x} y2="7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      ))}
      {[9, 12, 15].map((x) => (
        <line key={`b${x}`} x1={x} y1="17" x2={x} y2="20" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      ))}
      {[9, 12, 15].map((y) => (
        <line key={`l${y}`} x1="4" y1={y} x2="7" y2={y} stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      ))}
      {[9, 12, 15].map((y) => (
        <line key={`r${y}`} x1="17" y1={y} x2="20" y2={y} stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      ))}
    </svg>
  );
}
