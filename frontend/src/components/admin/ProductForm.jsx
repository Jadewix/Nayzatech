'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  createProduct,
  updateProduct,
  listCategories,
  uploadProductImage,
} from '@/lib/adminApi';

/**
 * Add / edit a product.
 *
 * ONE THING THIS FORM DELIBERATELY DOES NOT DO
 * --------------------------------------------
 * It sends only the fields that actually changed. PATCHing every field back
 * would overwrite a value someone else edited in the meantime, and would
 * re-send `slug`, which the backend then uniquifies into name-2, name-3... on
 * every save.
 *
 * This store does not count units. Availability is one boolean, `in_stock`,
 * edited here like any other field — so there are no quantity, low-stock or
 * restock fields anywhere in this panel.
 */

const BLANK = {
  name: '',
  sku: '',
  brand: '',
  category_id: '',
  base_price: '',
  sale_price: '',
  short_description: '',
  description: '',
  in_stock: true,
  is_active: true,
  is_featured: false,
};

/** Turn the API's record into form state (all strings, never null). */
function toFormState(product) {
  return {
    name: product.name ?? '',
    sku: product.sku ?? '',
    brand: product.brand ?? '',
    category_id: product.category_id ?? '',
    base_price: product.base_price != null ? String(product.base_price) : '',
    sale_price: product.sale_price != null ? String(product.sale_price) : '',
    short_description: product.short_description ?? '',
    description: product.description ?? '',
    in_stock: product.in_stock ?? true,
    is_active: product.is_active ?? true,
    is_featured: product.is_featured ?? false,
  };
}

export default function ProductForm({ product = null }) {
  const isEdit = Boolean(product);
  const router = useRouter();

  const [values, setValues] = useState(product ? toFormState(product) : BLANK);
  const [categories, setCategories] = useState([]);
  const [imageFile, setImageFile] = useState(null);
  const [preview, setPreview] = useState(product?.image_url || null);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listCategories()
      .then(({ data }) => setCategories(Array.isArray(data) ? data : []))
      .catch(() => setCategories([]));   // the form still works without them
  }, []);

  function set(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function handleImageChange(event) {
    const file = event.target.files?.[0] || null;
    setImageFile(file);
    setPreview(file ? URL.createObjectURL(file) : product?.image_url || null);
  }

  /** Build the payload the API expects, converting types and dropping blanks. */
  function buildPayload() {
    const payload = {
      name: values.name.trim(),
      sku: values.sku.trim(),
      brand: values.brand.trim() || null,
      category_id: values.category_id || null,
      base_price: Number(values.base_price),
      // An empty sale price means "no sale", which is null rather than 0.
      sale_price: values.sale_price.trim() === '' ? null : Number(values.sale_price),
      short_description: values.short_description.trim() || null,
      description: values.description.trim() || null,
      is_active: values.is_active,
      is_featured: values.is_featured,
      in_stock: values.in_stock,
    };

    return payload;
  }

  /** Only the keys that differ from what we loaded. */
  function changedOnly(payload) {
    const original = toFormState(product);
    const changed = {};
    for (const [key, value] of Object.entries(payload)) {
      const before =
        key === 'base_price' || key === 'sale_price'
          ? original[key] === '' ? null : Number(original[key])
          : key === 'is_active' || key === 'is_featured' || key === 'in_stock'
            ? original[key]
            : (original[key] || null) === '' ? null : (original[key] || null);

      if (value !== before) changed[key] = value;
    }
    return changed;
  }

  function validate(payload) {
    const errors = {};
    if (payload.name.length < 2) errors.name = 'At least 2 characters.';
    if (!payload.sku) errors.sku = 'Required.';
    if (!Number.isFinite(payload.base_price) || payload.base_price < 0) {
      errors.base_price = 'Enter a price.';
    }
    if (payload.sale_price != null) {
      if (!Number.isFinite(payload.sale_price)) errors.sale_price = 'Enter a number.';
      else if (payload.sale_price > payload.base_price) {
        errors.sale_price = 'Cannot be higher than the regular price.';
      }
    }
    return errors;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);

    const payload = buildPayload();
    const errors = validate(payload);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      let saved;
      if (isEdit) {
        const diff = changedOnly(payload);
        saved = Object.keys(diff).length
          ? (await updateProduct(product.id, diff)).data
          : product;
      } else {
        saved = (await createProduct(payload)).data;
      }

      /**
       * The image goes in a second request because it is multipart while the
       * rest is JSON. Doing it after the save means a failed upload leaves a
       * correct product with no picture, rather than losing the whole edit.
       */
      if (imageFile && saved?.id) {
        try {
          await uploadProductImage(saved.id, imageFile);
        } catch (uploadError) {
          setError(`Product saved, but the image failed: ${uploadError.message}`);
          setSaving(false);
          router.refresh();
          return;
        }
      }

      router.push('/admin/products');
      router.refresh();
    } catch (err) {
      if (err.code === 'VALIDATION_ERROR' && err.details) {
        setFieldErrors(err.details);
        setError('Please check the highlighted fields.');
      } else {
        setError(err.message);
      }
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl pt-8 pb-16">
      <p className="font-mono text-[0.7rem] font-medium tracking-[0.28em] text-accent uppercase">
        {isEdit ? '// Edit product' : '// New product'}
      </p>
      <div className="mt-1.5 flex items-center justify-between gap-3">
        <h1 className="text-[1.85rem] font-bold leading-tight tracking-tight text-ink">
          {isEdit ? 'Edit product' : 'Add product'}
        </h1>
        <Link href="/admin/products" className="text-sm text-muted hover:text-ink">
          Cancel
        </Link>
      </div>

      {error && (
        <p className="mt-4 text-sm text-alert bg-alert-dim border border-alert/20 rounded-md px-3 py-2">
          {error}
        </p>
      )}

      <div className="mt-6 rounded-xl border border-line bg-paper p-5 sm:p-6">
      <Section title="Basics">
        <Field label="Name" error={fieldErrors.name} className="sm:col-span-2">
          <input
            type="text"
            value={values.name}
            onChange={(event) => set('name', event.target.value)}
            className={inputClass(fieldErrors.name)}
          />
        </Field>

        <Field
          label="SKU"
          error={fieldErrors.sku}
          hint="Your own product code. Must be unique."
        >
          <input
            type="text"
            value={values.sku}
            onChange={(event) => set('sku', event.target.value)}
            className={`${inputClass(fieldErrors.sku)} font-mono`}
          />
        </Field>

        <Field label="Brand">
          <input
            type="text"
            value={values.brand}
            onChange={(event) => set('brand', event.target.value)}
            className={inputClass()}
          />
        </Field>

        <Field label="Category" className="sm:col-span-2">
          <select
            value={values.category_id}
            onChange={(event) => set('category_id', event.target.value)}
            className={inputClass()}
          >
            <option value="">No category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </Field>
      </Section>

      <Section title="Price">
        <Field label="Regular price" error={fieldErrors.base_price}>
          <input
            type="number"
            min="0"
            step="0.01"
            value={values.base_price}
            onChange={(event) => set('base_price', event.target.value)}
            className={`${inputClass(fieldErrors.base_price)} tabular`}
          />
        </Field>

        <Field
          label="Sale price"
          error={fieldErrors.sale_price}
          hint="Leave empty if it is not on sale."
        >
          <input
            type="number"
            min="0"
            step="0.01"
            value={values.sale_price}
            onChange={(event) => set('sale_price', event.target.value)}
            className={`${inputClass(fieldErrors.sale_price)} tabular`}
          />
        </Field>
      </Section>

      <Section title="Availability">
        <label className="sm:col-span-2 flex items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={values.in_stock}
            onChange={(event) => set('in_stock', event.target.checked)}
            className="mt-0.5"
          />
          <span>
            <strong className="font-medium">Available to order</strong>
            <span className="mt-0.5 block text-xs text-muted">
              Uncheck to show it as sold out: the page stays live and keeps its search
              ranking, but Add to cart is disabled. To take it off the storefront
              altogether, untick Published instead. You can flip this any time from the
              product list.
            </span>
          </span>
        </label>
      </Section>

      <Section title="Description">
        <Field
          label="Short description"
          hint="One line, shown on product cards."
          className="sm:col-span-2"
        >
          <input
            type="text"
            value={values.short_description}
            onChange={(event) => set('short_description', event.target.value)}
            className={inputClass()}
          />
        </Field>

        <Field label="Full description" className="sm:col-span-2">
          <textarea
            rows={5}
            value={values.description}
            onChange={(event) => set('description', event.target.value)}
            className={inputClass()}
          />
        </Field>
      </Section>

      <Section title="Image">
        <div className="sm:col-span-2 flex items-start gap-4">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt=""
              className="w-24 h-24 rounded object-cover border border-line bg-surface"
            />
          ) : (
            <div className="w-24 h-24 rounded border border-line bg-surface" />
          )}
          <div className="flex-1">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
              onChange={handleImageChange}
              className="block w-full text-sm text-muted file:mr-3 file:rounded file:border-0 file:bg-surface file:px-3 file:py-1.5 file:text-sm file:text-ink"
            />
            <p className="mt-1.5 text-xs text-faint">
              JPEG, PNG, WebP, AVIF or GIF. Up to 5 MB. Uploading a new one replaces the old file.
            </p>
          </div>
        </div>
      </Section>

      <Section title="Visibility">
        <label className="sm:col-span-2 flex items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={values.is_active}
            onChange={(event) => set('is_active', event.target.checked)}
            className="mt-0.5"
          />
          <span>
            <strong className="font-medium">Published</strong>
            <span className="block text-muted text-xs mt-0.5">
              Unpublished products are hidden from the store but keep their record and history.
            </span>
          </span>
        </label>

        <label className="sm:col-span-2 flex items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={values.is_featured}
            onChange={(event) => set('is_featured', event.target.checked)}
            className="mt-0.5"
          />
          <span>
            <strong className="font-medium">Featured</strong>
            <span className="block text-muted text-xs mt-0.5">
              Shows on the home page.
            </span>
          </span>
        </label>
      </Section>

      <div className="mt-8 flex items-center gap-3 border-t border-line pt-6">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-accent px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.1em] text-paper hover:opacity-90 disabled:opacity-50"
        >
          {saving ? 'Saving...' : isEdit ? 'Save changes' : 'Create product'}
        </button>
        <Link href="/admin/products" className="text-sm text-muted hover:text-ink">
          Cancel
        </Link>
      </div>
      </div>
    </form>
  );
}

/* --- Small presentational helpers --------------------------------------- */

function inputClass(hasError) {
  return `w-full rounded-md border px-3 py-2 text-sm outline-none bg-paper ${
    hasError ? 'border-alert' : 'border-line focus:border-accent'
  }`;
}

function Section({ title, children }) {
  return (
    <fieldset className="mt-7 border-t border-line pt-5 first:mt-0 first:border-0 first:pt-0">
      <legend className="flex items-center gap-2 font-mono text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted">
        <span className="h-2 w-0.5 bg-accent" aria-hidden="true" />
        {title}
      </legend>
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
    </fieldset>
  );
}

function Field({ label, hint, error, className = '', children }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-sm font-medium mb-1">{label}</span>
      {children}
      {error && <span className="block text-xs text-alert mt-1">{error}</span>}
      {!error && hint && <span className="block text-xs text-faint mt-1">{hint}</span>}
    </label>
  );
}
