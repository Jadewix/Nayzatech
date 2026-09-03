'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { lookupOrder } from '@/lib/api';

/**
 * "Where is my order?" without an account.
 *
 * Both the order number AND the email are required. Order numbers run in
 * sequence (TS-20260824-00001, -00002...), so the number alone would let anyone
 * read a stranger's address by counting upwards. Requiring the matching email
 * closes that.
 */
export default function TrackPage() {
  const router = useRouter();
  const [orderNumber, setOrderNumber] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const order = await lookupOrder(orderNumber.trim(), email.trim());
      router.push(`/orders/${order.id}`);
    } catch (err) {
      setError(err.message || 'We could not find that order.');
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <h1 className="display mb-2 text-3xl">Track your order</h1>
      <p className="text-muted text-sm mb-6">
        Enter your order number and the email you used at checkout.
      </p>

      {error && (
        <div role="alert" className="border border-alert bg-alert-dim rounded-lg px-4 py-3 mb-5 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="order_number" className="block text-sm font-medium mb-1">
            Order number
          </label>
          <input
            id="order_number"
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
            placeholder="TS-20260824-00042"
            required
            className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-paper font-mono"
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium mb-1">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-paper"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-ink text-white rounded-lg px-5 py-3 text-sm font-medium hover:bg-brand transition-colors disabled:opacity-50"
        >
          {loading ? 'Looking…' : 'Find my order'}
        </button>
      </form>

      <p className="text-xs text-muted mt-6 text-center">
        Your confirmation email also has a direct link that skips this form.
      </p>
    </div>
  );
}
