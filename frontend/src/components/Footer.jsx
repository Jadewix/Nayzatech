import Link from 'next/link';

const STORE_NAME = process.env.NEXT_PUBLIC_STORE_NAME || 'Tech Store';

export default function Footer() {
  return (
    <footer className="border-t border-line mt-20">
      <div className="max-w-6xl mx-auto px-4 py-10 grid gap-8 sm:grid-cols-3 text-sm">
        <div>
          <p className="font-semibold mb-2">{STORE_NAME}</p>
          <p className="text-muted leading-relaxed">
            Laptops, PC parts, phone cases and electronics.
          </p>
        </div>
        <div>
          <p className="font-semibold mb-2">Shop</p>
          <ul className="space-y-1.5 text-muted">
            <li><Link href="/products" className="hover:text-brand">All products</Link></li>
            <li><Link href="/products?featured=true" className="hover:text-brand">Featured</Link></li>
            <li><Link href="/track" className="hover:text-brand">Track an order</Link></li>
          </ul>
        </div>
        <div>
          <p className="font-semibold mb-2">Payment</p>
          <p className="text-muted leading-relaxed">
            Cash on delivery. Nothing is charged online — you pay the courier when
            your order arrives.
          </p>
        </div>
      </div>
      <div className="border-t border-line">
        <p className="max-w-6xl mx-auto px-4 py-4 text-xs text-faint">
          © {new Date().getFullYear()} {STORE_NAME}
        </p>
      </div>
    </footer>
  );
}
