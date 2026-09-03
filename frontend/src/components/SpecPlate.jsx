import { specLabel, specValue } from '@/lib/format';

/**
 * What a product looks like before anyone has photographed it.
 *
 * THE PROBLEM
 * A new catalogue has no product photography. The usual answer is a grey box
 * reading "No image", which makes an entire page of them look broken and
 * unfinished — and a shop that looks unfinished does not get orders.
 *
 * THE ANSWER
 * Every product already carries a `specs` object, because that is what people
 * actually compare when buying electronics. So an image-less product renders
 * its real specification instead: white monospace on the dark ground of an
 * anti-static tray, the way a component is labelled before it goes in a box.
 *
 * It is not a placeholder pretending to be a photo. It shows true information,
 * it is specific to this shop rather than to any shop, and it disappears the
 * moment a photograph is uploaded.
 *
 * Nothing is invented here. If a product has no specs either, it falls back to
 * its brand and category, which every product has.
 */

/**
 * Pick the specs worth showing at this size.
 *
 * Short values first: "16 GB" reads on a card, an eight-item connectivity array
 * does not. Arrays and booleans are skipped for the same reason — they are
 * useful on the product page's full table, not in a tile 160 pixels wide.
 */
function pickSpecs(specs, limit) {
  if (!specs || typeof specs !== 'object') return [];
  return Object.entries(specs)
    .filter(([, value]) => {
      if (value == null || Array.isArray(value) || typeof value === 'boolean') return false;
      return String(value).length <= 18;
    })
    .sort((a, b) => String(a[1]).length - String(b[1]).length)
    .slice(0, limit)
    .map(([key, value]) => [specLabel(key), specValue(value)]);
}

/**
 * @param {object}  product
 * @param {'card'|'hero'} size  card = a grid tile, hero = the large product page slot
 */
export default function SpecPlate({ product, size = 'card' }) {
  const limit = size === 'hero' ? 6 : 3;
  const rows = pickSpecs(product.specs, limit);
  const hero = size === 'hero';

  return (
    <div className="relative flex h-full w-full flex-col justify-between overflow-hidden bg-tray">
      {/*
        A faint grid, like the silkscreen on a circuit board. Pure CSS so there
        is no image to load, and low enough contrast that the text stays the
        thing you read.
      */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.16]"
        style={{
          backgroundImage:
            'linear-gradient(to right, var(--color-tray-2) 1px, transparent 1px), linear-gradient(to bottom, var(--color-tray-2) 1px, transparent 1px)',
          backgroundSize: hero ? '32px 32px' : '18px 18px',
        }}
      />

      {/* Right-aligned: the discount badge sits in the top-LEFT corner of the
          card, and these two would otherwise print over each other. */}
      <div className={`relative ${hero ? 'p-7' : 'p-3.5'}`}>
        <p
          className={`text-right font-mono uppercase tracking-[0.2em] text-tray-ink ${
            hero ? 'text-[0.7rem]' : 'text-[0.55rem]'
          }`}
        >
          {product.brand || product.category_name || 'Specification'}
        </p>
      </div>

      <div className={`relative ${hero ? 'px-7 pb-7' : 'px-3.5 pb-3.5'}`}>
        {rows.length > 0 ? (
          <dl className={hero ? 'space-y-2.5' : 'space-y-1'}>
            {rows.map(([label, value]) => (
              <div
                key={label}
                className={`flex items-baseline justify-between gap-3 border-b border-tray-2 ${
                  hero ? 'pb-2.5' : 'pb-1'
                }`}
              >
                <dt
                  className={`truncate font-mono uppercase tracking-[0.12em] text-tray-ink ${
                    hero ? 'text-[0.7rem]' : 'text-[0.55rem]'
                  }`}
                >
                  {label}
                </dt>
                <dd
                  className={`shrink-0 font-mono text-white ${
                    hero ? 'text-sm' : 'text-[0.65rem]'
                  }`}
                >
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p
            className={`font-mono leading-snug text-tray-ink ${
              hero ? 'text-sm' : 'text-[0.6rem]'
            }`}
          >
            {product.category_name || 'Awaiting photography'}
          </p>
        )}
      </div>
    </div>
  );
}
