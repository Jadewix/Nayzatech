'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { listMessages, setMessageRead, deleteMessage } from '@/lib/adminApi';
import AdminPageHeader from '@/components/admin/AdminPageHeader';

/**
 * The contact inbox.
 *
 * Deliberately not an email client. There is no reply box, because replying
 * from here would send from the store's address with no copy in your sent mail
 * and no thread for the customer to answer into. Every message shows the
 * sender's address as a mailto link instead — you reply in your own mail app,
 * where the conversation stays.
 *
 * Read state is the one thing tracked, so an inbox with fifty answered messages
 * still tells you the two that arrived overnight.
 */
export default function MessagesPage() {
  const router = useRouter();
  const [messages, setMessages] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data, meta } = await listMessages({ unreadOnly });
      setMessages(Array.isArray(data) ? data : []);
      // The backend returns the unread total alongside pagination, so the badge
      // stays right even while the "unread only" filter is off.
      setUnreadCount(meta?.unread_count ?? 0);
    } catch (err) {
      if (err.code === 'NOT_AUTHENTICATED' || err.status === 401) {
        router.replace('/admin/login');
        return;
      }
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [unreadOnly, router]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  /** Opening a message marks it read; collapsing it does not mark it unread. */
  async function toggleOpen(message) {
    const next = openId === message.id ? null : message.id;
    setOpenId(next);
    if (next && !message.is_read) {
      try {
        await setMessageRead(message.id, true);
        await load();
      } catch (err) {
        setError(err.message);
      }
    }
  }

  async function handleRead(message, isRead) {
    try {
      await setMessageRead(message.id, isRead);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(message) {
    const ok = window.confirm(`Delete the message from ${message.name}?\n\nThis cannot be undone.`);
    if (!ok) return;
    try {
      await deleteMessage(message.id);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <AdminPageHeader title="Inbox" />

      <div className="mt-6 flex items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {unreadCount > 0
            ? `${unreadCount} unread ${unreadCount === 1 ? 'message' : 'messages'}`
            : 'Nothing unread'}
        </p>
        <label className="flex items-center gap-2 text-xs font-semibold tracking-[0.1em] uppercase text-muted">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(event) => setUnreadOnly(event.target.checked)}
          />
          Unread only
        </label>
      </div>

      {error && (
        <p className="mt-4 rounded-md border border-alert/20 bg-alert-dim px-3 py-2 text-sm text-alert">
          {error}
        </p>
      )}

      <div className="mt-4 space-y-3 pb-16">
        {loading && <p className="py-10 text-center text-sm text-muted">Loading…</p>}

        {!loading && messages.length === 0 && (
          <p className="rounded-xl border border-dashed border-line py-12 text-center text-sm text-muted">
            {unreadOnly ? 'Nothing unread.' : 'No messages yet.'}
          </p>
        )}

        {!loading &&
          messages.map((message) => {
            const open = openId === message.id;
            return (
              <div
                key={message.id}
                className={`rounded-lg border bg-paper ${
                  message.is_read ? 'border-line' : 'border-accent/40'
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleOpen(message)}
                  className="flex w-full items-start gap-3 px-4 py-3.5 text-left"
                  aria-expanded={open}
                >
                  {/* Unread dot, not bold text — it survives being scanned quickly. */}
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      message.is_read ? 'bg-transparent' : 'bg-accent'
                    }`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">
                      {message.subject || 'No subject'}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {message.name} · {message.email}
                    </p>
                    {!open && (
                      <p className="mt-1 truncate text-xs text-faint">{message.message}</p>
                    )}
                  </div>
                  <span className="shrink-0 font-mono text-[0.65rem] text-faint">
                    {new Date(message.created_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </button>

                {open && (
                  <div className="border-t border-line px-4 py-4">
                    <p className="whitespace-pre-line text-sm text-ink">{message.message}</p>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <a
                        href={`mailto:${message.email}?subject=${encodeURIComponent(
                          `Re: ${message.subject || 'your message'}`
                        )}`}
                        className="rounded-md bg-accent px-4 py-2.5 text-xs font-semibold tracking-[0.1em] uppercase text-paper hover:opacity-90"
                      >
                        Reply by email
                      </a>
                      <button
                        type="button"
                        onClick={() => handleRead(message, !message.is_read)}
                        className="rounded-md border border-line px-4 py-2.5 text-xs font-semibold tracking-[0.1em] uppercase text-ink hover:bg-surface"
                      >
                        Mark {message.is_read ? 'unread' : 'read'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(message)}
                        className="rounded-md border border-alert/30 px-4 py-2.5 text-xs font-semibold tracking-[0.1em] uppercase text-alert hover:bg-alert-dim"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}
