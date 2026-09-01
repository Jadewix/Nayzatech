import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="max-w-md mx-auto px-4 py-24 text-center">
      <h1 className="text-2xl font-bold mb-2">Page not found</h1>
      <p className="text-muted mb-6">
        That link may be out of date, or the product is no longer listed.
      </p>
      <Link
        href="/products"
        className="inline-block bg-ink text-white rounded-lg px-5 py-2.5 text-sm font-medium hover:bg-brand transition-colors"
      >
        Browse products
      </Link>
    </div>
  );
}
