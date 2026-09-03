import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { ADMIN_COOKIE } from '@/lib/adminSession';
import ProductForm from '@/components/admin/ProductForm';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

/**
 * Loaded on the server so the form opens already filled in, with no spinner.
 *
 * It calls the PUBLIC product endpoint but sends the admin key, because
 * `detectAdmin` on the backend uses that to include unpublished products —
 * without it, editing a hidden product would 404.
 */
export default async function EditProductPage({ params }) {
  const { id } = await params;                    // params is a promise in Next 16
  const key = (await cookies()).get(ADMIN_COOKIE)?.value;

  let response;
  try {
    response = await fetch(`${API_URL}/api/products/${id}`, {
      headers: { 'x-admin-key': key || '' },
      cache: 'no-store',                          // never edit against a cached copy
    });
  } catch {
    return (
      <p className="text-sm text-alert bg-alert-dim border border-alert/20 rounded px-3 py-2">
        Cannot reach the backend at {API_URL}. Is it running?
      </p>
    );
  }

  if (response.status === 404) notFound();
  if (!response.ok) {
    return (
      <p className="text-sm text-alert bg-alert-dim border border-alert/20 rounded px-3 py-2">
        Could not load this product ({response.status}).
      </p>
    );
  }

  const { data } = await response.json();
  return <ProductForm product={data} />;
}

export async function generateMetadata({ params }) {
  const { id } = await params;
  const key = (await cookies()).get(ADMIN_COOKIE)?.value;
  try {
    const response = await fetch(`${API_URL}/api/products/${id}`, {
      headers: { 'x-admin-key': key || '' },
      cache: 'no-store',
    });
    if (!response.ok) return { title: 'Edit product' };
    const { data } = await response.json();
    return { title: data?.name ? `Edit ${data.name}` : 'Edit product' };
  } catch {
    return { title: 'Edit product' };
  }
}
