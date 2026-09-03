import './globals.css';

const STORE_NAME = process.env.NEXT_PUBLIC_STORE_NAME || 'Tech Store';

/**
 * The document shell, and nothing else.
 *
 * The storefront chrome (header, footer, cart) lives in (storefront)/layout.jsx
 * rather than here, because /admin must NOT render it — an operator editing
 * stock has no use for a shopping cart, and the admin panel having its own
 * chrome is what makes the two feel like separate applications.
 *
 * (storefront) is a route group: the parentheses mean it groups files without
 * appearing in the URL, so app/(storefront)/cart/page.jsx is still /cart.
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
          href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap"
        />
      </head>
      <body className="min-h-screen flex flex-col">{children}</body>
    </html>
  );
}
