'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCart } from './CartProvider';

/**
 * Quantity picker plus the add button.
 *
 * A client component ('use client') because it holds state and responds to
 * clicks. Keeping it small matters: the product page around it stays a server
 * component, so only this button's JavaScript ships to the browser rather than
 * the whole page's.
 */
export default function AddToCart({ product }) {
  const { addItem } = useCart();
  const router = useRouter();
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  // This store does not count units, so there is no per-product ceiling —
  // just a sane cap on how many one customer can add in a single go.
  const soldOut = product.in_stock === false || !product.is_active;
  const max = 10;

  function handleAdd() {
    addItem(product, quantity);
    setAdded(true);
    setTimeout(() => setAdded(false), 2200);
  }

  if (soldOut) {
    return (
      <div className="border border-line rounded-lg px-4 py-3 text-sm text-muted bg-surface">
        Sold out. Check back soon.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <label htmlFor="qty" className="text-sm text-muted">Quantity</label>
        <select
          id="qty"
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value))}
          className="min-h-11 border border-line rounded-lg px-3 py-2 text-[0.95rem] bg-paper tabular"
        >
          {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </div>

      {/* ≥44pt touch targets (HIG: Accessibility > control sizes). */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleAdd}
          className="flex-1 min-h-12 bg-ink text-white rounded-lg px-5 py-3 text-[0.95rem] font-medium hover:bg-brand transition-colors"
        >
          {added ? 'Added to cart' : 'Add to cart'}
        </button>
        <button
          type="button"
          onClick={() => { addItem(product, quantity); router.push('/cart'); }}
          className="min-h-12 border border-line rounded-lg px-5 py-3 text-[0.95rem] font-medium hover:border-brand transition-colors"
        >
          Buy now
        </button>
      </div>
    </div>
  );
}
