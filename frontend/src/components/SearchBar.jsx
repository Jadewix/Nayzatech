'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Product search.
 *
 * The backend has always understood `?search=`; nothing on the storefront ever
 * offered a way to type into it. On a phone this is the first thing a shopper
 * reaches for, so it leads the header and the hero rather than hiding behind an
 * icon.
 *
 * A client component because it owns the input and pushes the result route.
 * Submitting navigates to the catalogue with the query in the URL, so the
 * results page stays server-rendered, shareable and back-button-friendly — the
 * search box is the only client-side part.
 *
 * @param {'bar'|'hero'} [variant]  visual size; behaviour is identical.
 */
export default function SearchBar({ variant = 'bar', autoFocus = false, className = '' }) {
  const router = useRouter();
  const [value, setValue] = useState('');

  function handleSubmit(event) {
    event.preventDefault();
    const term = value.trim();
    router.push(term ? `/products?search=${encodeURIComponent(term)}` : '/products');
  }

  const hero = variant === 'hero';

  return (
    <form
      role="search"
      onSubmit={handleSubmit}
      className={`relative flex items-center ${className}`}
    >
      <SearchIcon
        className={`pointer-events-none absolute left-3.5 ${
          hero ? 'text-muted' : 'text-faint'
        }`}
      />
      <input
        type="search"
        name="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoFocus={autoFocus}
        aria-label="Search products"
        placeholder="Search laptops, parts, cases…"
        className={`w-full rounded-full border bg-paper pl-10 pr-24 text-ink placeholder:text-faint focus:outline-none ${
          hero
            ? 'min-h-[3.25rem] border-transparent text-[0.95rem] shadow-lg shadow-ink/10 focus-visible:border-brand'
            : 'min-h-11 border-line text-sm focus:border-brand'
        }`}
      />
      <button
        type="submit"
        className={`absolute right-1.5 inline-flex items-center rounded-full bg-ink px-4 font-medium text-white transition-colors hover:bg-brand ${
          hero ? 'min-h-[2.5rem] text-sm' : 'min-h-[2.1rem] text-[0.8rem]'
        }`}
      >
        Search
      </button>
    </form>
  );
}

function SearchIcon({ className = '' }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <path d="m20 20-3.2-3.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
