import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { ADMIN_COOKIE } from '@/lib/adminSession';

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
 * The visible header (title, dashboard switch, log out) lives inside each page
 * via <AdminHeader>, because the primary action differs per dashboard. This
 * layout only enforces auth and sets the mobile-first frame: a warm background
 * and a single narrow column, matching the design.
 */
export default async function AdminLayout({ children }) {
  const key = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!key) redirect('/admin/login');

  return (
    <div className="min-h-screen bg-admin-bg">
      <div className="mx-auto w-full max-w-xl px-4">{children}</div>
    </div>
  );
}
