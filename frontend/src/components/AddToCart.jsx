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

  const outOfStock = product.stock_quantity === 0 || !product.is_active;
  const max = Math.min(product.stock_quantity, 10);

  function handleAdd() {
    addItem(product, quantity);
    setAdded(true);
    setTimeout(() => setAdded(false), 2200);
  }

  if (outOfStock) {
    return (
      <div className="border border-line rounded-lg px-4 py-3 text-sm text-muted bg-surface">
        Out of stock. Check back soon.
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
          className="border border-line rounded-lg px-3 py-2 text-sm bg-paper tabular"
        >
          {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
        {product.stock_quantity <= 5 && (
          <span className="text-sm text-alert tabular">
            Only {product.stock_quantity} left
          </span>
        )}
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleAdd}
          className="flex-1 bg-ink text-white rounded-lg px-5 py-3 text-sm font-medium hover:bg-brand transition-colors"
        >
          {added ? 'Added to cart' : 'Add to cart'}
        </button>
        <button
          type="button"
          onClick={() => { addItem(product, quantity); router.push('/cart'); }}
          className="border border-line rounded-lg px-5 py-3 text-sm font-medium hover:border-brand transition-colors"
        >
          Buy now
        </button>
      </div>
    </div>
  );
}
