'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from '@/lib/adminApi';
import AdminHeader from '@/components/admin/AdminHeader';

/**
 * Categories.
 *
 * Small on purpose. A category is a name, an optional parent, and a position —
 * there is nothing else worth a screen of its own, and every extra field here
 * is one more thing to fill in before you can file a product.
 *
 * Two-level nesting is what the storefront renders (top-level tiles on the home
 * page, children inside them), so the parent picker only offers top-level
 * categories. Deeper nesting would be accepted by the database and then quietly
 * ignored by the shop, which is worse than not offering it.
 */
export default function CategoriesPage() {
  const router = useRouter();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);   // category object, or 'new', or null

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data } = await listCategories();
      setCategories(Array.isArray(data) ? data : []);
    } catch (err) {
      if (err.code === 'NOT_AUTHENTICATED' || err.status === 401) {
        router.replace('/admin/login');
        return;
      }
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  const parents = useMemo(() => categories.filter((c) => !c.parent_id), [categories]);
  const childrenOf = useCallback(
    (id) => categories.filter((c) => c.parent_id === id),
    [categories]
  );

  async function handleDelete(category) {
    const ok = window.confirm(
      `Delete “${category.name}”?\n\nThis only works if no products and no sub-categories still point at it.`
    );
    if (!ok) return;
    try {
      await deleteCategory(category.id);
      await load();
    } catch (err) {
      // The backend refuses to orphan products, and says so. Show its reason.
      setError(err.message);
    }
  }

  return (
    <div>
      <AdminHeader current="categories">
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="rounded-md bg-accent px-5 py-3 text-xs font-semibold tracking-[0.12em] uppercase text-paper hover:opacity-90"
        >
          + Add category
        </button>
      </AdminHeader>

      {error && (
        <p className="mt-4 rounded-md border border-alert/20 bg-alert-dim px-3 py-2 text-sm text-alert">
          {error}
        </p>
      )}

      {editing && (
        <CategoryForm
          category={editing === 'new' ? null : editing}
          parents={parents.filter((p) => editing === 'new' || p.id !== editing.id)}
          onCancel={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}

      <div className="mt-6 space-y-3 pb-16">
        {loading && <p className="py-10 text-center text-sm text-muted">Loading…</p>}

        {!loading && categories.length === 0 && (
          <p className="rounded-xl border border-dashed border-line py-12 text-center text-sm text-muted">
            No categories yet. Products need one before they can be filed, so start here.
          </p>
        )}

        {!loading &&
          parents.map((parent) => (
            <div key={parent.id} className="rounded-lg border border-line bg-paper">
              <Row
                category={parent}
                onEdit={() => setEditing(parent)}
                onDelete={() => handleDelete(parent)}
              />
              {childrenOf(parent.id).map((child) => (
                <div key={child.id} className="border-t border-line pl-6">
                  <Row
                    category={child}
                    onEdit={() => setEditing(child)}
                    onDelete={() => handleDelete(child)}
                  />
                </div>
              ))}
            </div>
          ))}
      </div>
    </div>
  );
}

function Row({ category, onEdit, onDelete }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-ink">{category.name}</p>
          {!category.is_active && (
            <span className="rounded bg-surface px-1.5 py-0.5 font-mono text-[0.6rem] font-semibold uppercase text-muted">
              Hidden
            </span>
          )}
        </div>
        <p className="truncate font-mono text-[0.7rem] text-faint">/{category.slug}</p>
      </div>

      <button
        type="button"
        onClick={onEdit}
        className="rounded-md border border-line px-3 py-2 text-[0.7rem] font-semibold tracking-[0.1em] uppercase text-ink hover:bg-surface"
      >
        Edit
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="rounded-md border border-alert/30 px-3 py-2 text-[0.7rem] font-semibold tracking-[0.1em] uppercase text-alert hover:bg-alert-dim"
      >
        Delete
      </button>
    </div>
  );
}

/** Inline create/edit panel. Kept on the same screen so the list stays in view. */
function CategoryForm({ category, parents, onCancel, onSaved }) {
  const isEdit = Boolean(category);
  const [values, setValues] = useState({
    name: category?.name ?? '',
    description: category?.description ?? '',
    parent_id: category?.parent_id ?? '',
    display_order: String(category?.display_order ?? 0),
    is_active: category?.is_active ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const set = (field, value) => setValues((current) => ({ ...current, [field]: value }));

  async function handleSubmit(event) {
    event.preventDefault();
    if (values.name.trim().length < 2) {
      setError('Give it a name of at least 2 characters.');
      return;
    }
    setSaving(true);
    setError(null);

    // slug is deliberately never sent. The backend generates it from the name
    // on create; re-sending it on every edit would make it uniquify itself into
    // laptops-2, laptops-3... and break the storefront URLs.
    const payload = {
      name: values.name.trim(),
      description: values.description.trim() || null,
      parent_id: values.parent_id || null,
      display_order: Number(values.display_order) || 0,
      is_active: values.is_active,
    };

    try {
      if (isEdit) await updateCategory(category.id, payload);
      else await createCategory(payload);
      await onSaved();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 rounded-lg border border-accent/30 bg-paper p-4">
      <p className="font-mono text-[0.7rem] font-semibold tracking-[0.14em] uppercase text-accent">
        {isEdit ? '// Edit category' : '// New category'}
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2 block">
          <span className="font-mono text-[0.65rem] font-semibold tracking-[0.12em] uppercase text-muted">
            Name
          </span>
          <input
            type="text"
            value={values.name}
            onChange={(event) => set('name', event.target.value)}
            autoFocus
            className="mt-1 w-full rounded-md border border-line px-3 py-2.5 text-sm outline-none focus:border-accent"
          />
        </label>

        <label className="sm:col-span-2 block">
          <span className="font-mono text-[0.65rem] font-semibold tracking-[0.12em] uppercase text-muted">
            Description
          </span>
          <input
            type="text"
            value={values.description}
            onChange={(event) => set('description', event.target.value)}
            placeholder="One line, shown under the name on the storefront."
            className="mt-1 w-full rounded-md border border-line px-3 py-2.5 text-sm outline-none focus:border-accent"
          />
        </label>

        <label className="block">
          <span className="font-mono text-[0.65rem] font-semibold tracking-[0.12em] uppercase text-muted">
            Sits under
          </span>
          <select
            value={values.parent_id}
            onChange={(event) => set('parent_id', event.target.value)}
            className="mt-1 w-full rounded-md border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-accent"
          >
            <option value="">Nothing — it is top level</option>
            {parents.map((parent) => (
              <option key={parent.id} value={parent.id}>
                {parent.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="font-mono text-[0.65rem] font-semibold tracking-[0.12em] uppercase text-muted">
            Position
          </span>
          <input
            type="number"
            value={values.display_order}
            onChange={(event) => set('display_order', event.target.value)}
            className="tabular mt-1 w-full rounded-md border border-line px-3 py-2.5 text-sm outline-none focus:border-accent"
          />
          <span className="mt-1 block text-xs text-faint">Lower numbers come first.</span>
        </label>

        <label className="sm:col-span-2 flex items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={values.is_active}
            onChange={(event) => set('is_active', event.target.checked)}
            className="mt-0.5"
          />
          <span>
            <strong className="font-medium">Show on the storefront</strong>
            <span className="mt-0.5 block text-xs text-muted">
              Uncheck to hide the category while you fill it with products.
            </span>
          </span>
        </label>
      </div>

      {error && (
        <p className="mt-3 rounded-md border border-alert/20 bg-alert-dim px-3 py-2 text-sm text-alert">
          {error}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-accent px-5 py-2.5 text-xs font-semibold tracking-[0.12em] uppercase text-paper hover:opacity-90 disabled:opacity-50"
        >
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create category'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-line px-5 py-2.5 text-xs font-semibold tracking-[0.12em] uppercase text-ink hover:bg-surface"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
