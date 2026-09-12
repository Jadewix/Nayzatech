import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { ADMIN_COOKIE } from '@/lib/adminSession';
import AdminNav from '@/components/admin/AdminNav';

export const metadata = {
  title: { default: 'Admin', template: '%s — Admin' },
  // Keep the panel out of Google even if it is ever reachable from outside.
  robots: { index: false, follow: false },
};

/**
 * Guard + frame for every admin screen.
 *
 * (panel) is a route group, so these URLs stay /admin and /admin/products —
 * the parentheses only exist so that /admin/login can sit OUTSIDE this layout
 * and not be redirected to itself.
 *
 * <AdminNav> is rendered here rather than per page, which is what lets it keep
 * its unread counts across a navigation instead of re-fetching them on every
 * screen. It supplies its own chrome at both sizes: a bottom tab bar and top
 * bar on a phone, a fixed sidebar from lg: up — hence the left padding and the
 * bottom padding below, which reserve the space each one occupies.
 */
export default async function AdminLayout({ children }) {
  const key = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!key) redirect('/admin/login');

  return (
    <div className="min-h-screen bg-admin-bg lg:pl-60">
      <AdminNav />
      <main className="mx-auto w-full max-w-4xl px-4 pb-28 lg:px-8 lg:pb-16">{children}</main>
    </div>
  );
}
