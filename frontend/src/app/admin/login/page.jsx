'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from '@/lib/adminApi';

/**
 * Sits outside the (panel) route group, so it is not behind the auth guard.
 *
 * The key typed here is posted to /api/admin-session, verified against the
 * backend, and stored in an httpOnly cookie. It is never held in React state
 * beyond this form and never written to localStorage — anything in
 * localStorage is readable by any script that ends up on the page.
 */
export default function AdminLoginPage() {
  const router = useRouter();
  const [key, setKey] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(key);
      setKey('');
      router.replace('/admin');
      router.refresh();   // re-runs the layout so it sees the new cookie
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-admin-bg flex items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl border border-line bg-paper p-7 shadow-sm"
      >
        <p className="font-mono text-[0.7rem] font-medium tracking-[0.28em] text-accent uppercase">
          {'// Nayzatech · Management'}
        </p>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-ink">Console sign in</h1>
        <p className="mt-1 text-sm text-muted">
          Enter the <code className="font-mono text-xs text-ink">ADMIN_API_KEY</code> from{' '}
          <code className="font-mono text-xs text-ink">backend/.env</code>.
        </p>

        <label
          htmlFor="key"
          className="mt-6 block font-mono text-[0.7rem] font-semibold tracking-[0.12em] uppercase text-muted"
        >
          Admin key
        </label>
        <input
          id="key"
          type="password"
          value={key}
          onChange={(event) => setKey(event.target.value)}
          autoComplete="current-password"
          autoFocus
          placeholder="••••••••••••••••"
          className="mt-1.5 w-full rounded-md border border-line px-3 py-2.5 font-mono text-sm outline-none focus:border-accent"
        />

        {error && (
          <p className="mt-3 rounded-md border border-alert/20 bg-alert-dim px-3 py-2 text-sm text-alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || !key.trim()}
          className="mt-6 w-full rounded-md bg-accent py-2.5 text-xs font-semibold tracking-[0.12em] uppercase text-paper hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Verifying…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
