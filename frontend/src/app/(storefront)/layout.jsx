import { CartProvider } from '@/components/CartProvider';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import MobileTabBar from '@/components/MobileTabBar';

/**
 * Chrome for the customer-facing store.
 *
 * CartProvider wraps everything so any storefront page can read the cart.
 * The admin panel deliberately sits outside this layout and gets none of it.
 *
 * Two navigations by design (HIG: platform-appropriate primary nav):
 *   - Header       — the top bar; full inline nav from `sm:` up.
 *   - MobileTabBar — a fixed bottom tab bar on phones only.
 * `main` gets bottom padding on mobile so the fixed bar never covers the last
 * row of content or a page's primary button.
 */
export default function StorefrontLayout({ children }) {
  return (
    <CartProvider>
      <Header />
      <main className="flex-1 pb-24 sm:pb-0">{children}</main>
      <Footer />
      <MobileTabBar />
    </CartProvider>
  );
}
