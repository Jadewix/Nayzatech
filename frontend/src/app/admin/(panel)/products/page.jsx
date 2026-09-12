'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { listProducts } from '@/lib/adminApi';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import AdminProductCard from '@/components/admin/AdminProductCard';

export default function ProductsPage() {
  const router = useRouter();
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [section, setSection] = useState('active'); // 'active' | 'inactive'
  const [sectionOpen, setSectionOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data } = await listProducts({ search: search.trim() || undefined });
      setProducts(Array.isArray(data) ? data : []);
    } catch (err) {
      if (err.code === 'NOT_AUTHENTICATED' || err.status === 401) {
        router.replace('/admin/login');
        return;
      }
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [search, router]);

  // Debounced so typing does not fire a request per keystroke.
  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  const active = useMemo(() => products.filter((p) => p.is_active), [products]);
  const inactive = useMemo(() => products.filter((p) => !p.is_active), [products]);
  const shown = section === 'active' ? active : inactive;

  const SECTIONS = [
    { id: 'active', label: 'Active inventory', count: active.length },
    { id: 'inactive', label: 'Inactive inventory', count: inactive.length },
  ];
  const currentSection = SECTIONS.find((s) => s.id === section);

  return (
    <div>
      <AdminPageHeader title="Products">
        <Link
          href="/admin/products/new"
          className="inline-flex min-h-11 items-center rounded-lg bg-accent px-5 text-xs font-semibold uppercase tracking-[0.12em] text-paper hover:opacity-90"
        >
          + Add product
        </Link>
      </AdminPageHeader>

      {/* Search */}
      <div className="relative mt-6">
        <svg
          width="16"
          height="16"
          viewBox="0 0 20 20"
          fill="none"
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint"
          aria-hidden="true"
        >
          <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.6" />
          <line x1="13.5" y1="13.5" x2="17" y2="17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search name, brand or SKU..."
          className="w-full rounded-md border border-line bg-paper py-3 pl-10 pr-4 text-sm outline-none focus:border-accent"
        />
      </div>

      {/* Section switch: Active / Inactive inventory */}
      <div className="relative mt-6">
        <button
          type="button"
          onClick={() => setSectionOpen((value) => !value)}
          className="flex items-center gap-2"
          aria-haspopup="menu"
          aria-expanded={sectionOpen}
        >
          <span className="text-sm font-semibold tracking-[0.14em] uppercase text-ink">
            {currentSection.label}
          </span>
          <span className="text-sm text-faint tabular">({currentSection.count})</span>
          <Chevron open={sectionOpen} />
        </button>

        {sectionOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setSectionOpen(false)} />
            <div
              role="menu"
              className="absolute z-20 mt-2 w-72 max-w-[85vw] rounded-lg border border-line bg-paper shadow-lg overflow-hidden"
            >
              {SECTIONS.map((option) => {
                const isCurrent = option.id === section;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setSection(option.id);
                      setSectionOpen(false);
                    }}
                    className={`flex w-full items-center gap-2 px-4 py-3 text-sm font-semibold tracking-wide uppercase text-left hover:bg-surface ${
                      isCurrent ? 'text-ink' : 'text-muted'
                    }`}
                  >
                    <span className="w-4 shrink-0 text-accent">{isCurrent ? '✓' : ''}</span>
                    <span className="flex-1">{option.label}</span>
                    <span className="text-faint tabular">{option.count}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {error && (
        <p className="mt-4 rounded-md border border-alert/20 bg-alert-dim px-3 py-2 text-sm text-alert">
          {error}
        </p>
      )}

      {/* List */}
      <div className="mt-4 space-y-3 pb-16">
        {loading && <p className="py-10 text-center text-sm text-muted">Loading…</p>}

        {!loading && shown.length === 0 && (
          <p className="rounded-xl border border-dashed border-line py-12 text-center text-sm text-muted">
            {search
              ? 'No products match your search.'
              : section === 'active'
                ? 'No active products yet. Tap “Add new product” to create one.'
                : 'No inactive products.'}
          </p>
        )}

        {!loading &&
          shown.map((product) => (
            <AdminProductCard
              key={product.id}
              product={product}
              onChanged={load}
              onError={(err) => setError(err.message)}
            />
          ))}
      </div>
    </div>
  );
}

function Chevron({ open }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 20 20"
      fill="none"
      className={`text-muted transition-transform ${open ? 'rotate-180' : ''}`}
      aria-hidden="true"
    >
      <path d="M5 7.5 10 12.5 15 7.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
