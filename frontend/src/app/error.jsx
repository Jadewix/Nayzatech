'use client';

import Link from 'next/link';

/**
 * Catches anything thrown while rendering a page.
 *
 * The most common cause while developing is the backend not running, so say
 * that plainly rather than showing a stack trace.
 */
export default function Error({ error, reset }) {
  const cannotReachApi = error?.message?.includes('Cannot reach the store server');

  return (
    <div className="max-w-md mx-auto px-4 py-24 text-center">
      <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
      <p className="text-muted mb-6">
        {cannotReachApi
          ? 'The store server is not responding. If you are developing, check that the backend is running on port 5000.'
          : 'Please try again in a moment.'}
      </p>
      <div className="flex gap-3 justify-center">
        <button
          type="button"
          onClick={reset}
          className="bg-ink text-white rounded-lg px-5 py-2.5 text-sm font-medium hover:bg-brand transition-colors"
        >
          Try again
        </button>
        <Link href="/" className="border border-line rounded-lg px-5 py-2.5 text-sm font-medium hover:border-brand">
          Go home
        </Link>
      </div>
    </div>
  );
}
