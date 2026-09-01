import './globals.css';
import { CartProvider } from '@/components/CartProvider';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

const STORE_NAME = process.env.NEXT_PUBLIC_STORE_NAME || 'Tech Store';

/**
 * Metadata here becomes the <head> of every page.
 *
 * The `template` in title means a page setting its title to "Laptops" renders
 * as "Laptops — Tech Store" in the browser tab and in Google results, without
 * every page having to repeat the store name.
 */
export const metadata = {
  title: {
    default: `${STORE_NAME} — Laptops, PC parts and electronics`,
    template: `%s — ${STORE_NAME}`,
  },
  description:
    'Laptops, PC parts, phone cases and electronics. Cash on delivery — pay the courier when your order arrives.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap"
        />
      </head>
      <body className="min-h-screen flex flex-col">
        {/* CartProvider wraps everything so any page can read the cart. */}
        <CartProvider>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </CartProvider>
      </body>
    </html>
  );
}
