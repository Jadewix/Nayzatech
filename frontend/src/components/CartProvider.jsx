'use client';

/**
 * The shopping cart.
 *
 * WHAT IT STORES: product ids and quantities, plus a snapshot of name/price/
 * image purely so the cart page can render without re-fetching every product.
 *
 * WHAT IT DOES NOT DO: decide what anything costs. The stored price is for
 * display only. When the order is placed, only ids and quantities are sent, and
 * the server looks up the real prices. If a price changed while the item sat in
 * the cart, the server's number wins — which is what you want.
 *
 * Persisted to localStorage so a refresh does not empty the cart.
 */

import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';

const CartContext = createContext(null);
const STORAGE_KEY = 'techstore-cart';

export function CartProvider({ children }) {
  const [items, setItems] = useState([]);

  /**
   * `hydrated` guards against a hydration mismatch. The server renders with an
   * empty cart (it cannot read the browser's localStorage), so if we rendered
   * the real count on the first client pass, React would find markup that does
   * not match what the server sent and complain. Loading in an effect means the
   * first client render matches the server, then the real cart appears.
   */
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setItems(parsed);
      }
    } catch {
      // Private browsing or blocked storage — start with an empty cart.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return; // do not overwrite saved data before it is loaded
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Storage full or blocked. The cart still works for this page session.
    }
  }, [items, hydrated]);

  const addItem = useCallback((product, quantity = 1) => {
    setItems((current) => {
      const existing = current.find((i) => i.product_id === product.id);
      if (existing) {
        return current.map((i) =>
          i.product_id === product.id
            ? { ...i, quantity: Math.min(i.quantity + quantity, 99) }
            : i
        );
      }
      return [
        ...current,
        {
          product_id: product.id,
          quantity,
          // Display snapshot only — never trusted for the actual total.
          name: product.name,
          slug: product.slug,
          price: product.effective_price ?? product.sale_price ?? product.base_price,
          image_url: product.image_url,
          stock_quantity: product.stock_quantity,
        },
      ];
    });
  }, []);

  const updateQuantity = useCallback((productId, quantity) => {
    setItems((current) =>
      quantity <= 0
        ? current.filter((i) => i.product_id !== productId)
        : current.map((i) =>
            i.product_id === productId ? { ...i, quantity: Math.min(quantity, 99) } : i
          )
    );
  }, []);

  const removeItem = useCallback((productId) => {
    setItems((current) => current.filter((i) => i.product_id !== productId));
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const value = useMemo(() => {
    const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);
    // Indicative only. The real subtotal comes back from /api/orders/check-stock.
    const estimatedSubtotal = items.reduce(
      (sum, i) => sum + Number(i.price || 0) * i.quantity,
      0
    );
    return {
      items,
      itemCount,
      estimatedSubtotal,
      hydrated,
      addItem,
      updateQuantity,
      removeItem,
      clearCart,
      /** The shape the checkout endpoint expects: ids and quantities, nothing else. */
      toOrderItems: () =>
        items.map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
    };
  }, [items, hydrated, addItem, updateQuantity, removeItem, clearCart]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used inside <CartProvider>. Check src/app/layout.jsx.');
  }
  return context;
}
