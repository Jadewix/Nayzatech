/**
 * URL-slug helpers.
 *
 * "Raptor 15 RTX Gaming Laptop!" -> "raptor-15-rtx-gaming-laptop"
 * so product URLs read as /products/raptor-15-rtx-gaming-laptop rather than
 * an opaque UUID. Good for users and good for search engines.
 */

/**
 * Convert arbitrary text into a lowercase, hyphenated, ASCII-safe slug.
 * @param {string} text
 * @returns {string}
 */
export function slugify(text) {
  if (!text) return '';
  return String(text)
    .normalize('NFKD')                 // split accented letters: é -> e + ´
    .replace(/[\u0300-\u036f]/g, '')  // drop the accent marks
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')      // remove punctuation
    .replace(/[\s_-]+/g, '-')          // collapse spaces/underscores to one hyphen
    .replace(/^-+|-+$/g, '')           // trim stray hyphens
    .slice(0, 200);                    // keep URLs sane
}

/**
 * Produce a slug guaranteed not to collide with one already in the database.
 * Appends -2, -3, ... until it finds a free one.
 *
 * @param {string} text
 * @param {(slug: string) => Promise<boolean>} exists  Returns true if taken
 * @returns {Promise<string>}
 */
export async function uniqueSlug(text, exists) {
  const base = slugify(text) || 'item';
  let candidate = base;
  let suffix = 2;

  // Bounded loop: after 100 tries fall back to a random suffix rather than
  // spinning forever against the database.
  while (await exists(candidate)) {
    if (suffix > 100) {
      candidate = `${base}-${Math.random().toString(36).slice(2, 8)}`;
      break;
    }
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

export default { slugify, uniqueSlug };
