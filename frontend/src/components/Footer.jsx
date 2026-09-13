import Link from 'next/link';

const STORE_NAME = process.env.NEXT_PUBLIC_STORE_NAME || 'Tech Store';

/**
 * The footer.
 *
 * Deliberately small. It used to end on an oversized wordmark set at 19vw,
 * which on a phone was most of a screen's height spent on decoration, plus
 * three columns of links and a paragraph about delivery. All of that pushed the
 * one row people actually look for — the credits — off the bottom of the
 * screen.
 *
 * What is left is the part that earns its space twice: a short row of
 * catalogue links, which is both the navigation someone scrolls down looking
 * for AND the internal linking that gives a crawler a path to every department
 * from any page on the site. Descriptive anchor text ("Laptops", not "here")
 * is doing SEO work, so it stays.
 *
 * THE BOTTOM PADDING IS NOT ARBITRARY
 * -----------------------------------
 * On phones a fixed tab bar sits over the bottom of the viewport. The layout
 * gives <main> bottom padding to clear it, but this footer is main's sibling,
 * so it never got any — the credits row was rendering underneath the tab bar.
 * pb-28 clears it, and drops back to normal spacing at sm: where the tab bar
 * is gone.
 */
export default function Footer() {
  const year = new Date().getFullYear();

  const links = [
    ['/products', 'All products'],
    ['/products?category=laptops', 'Laptops'],
    ['/products?category=pc-parts', 'PC parts'],
    ['/products?category=phone-cases', 'Phone cases'],
    ['/products?category=accessories', 'Accessories'],
  ];

  return (
    <footer className="mt-20 bg-ink text-white">
      <div className="mx-auto max-w-6xl px-4 pt-8 pb-28 sm:pt-10 sm:pb-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
          <Link href="/" className="display shrink-0 text-lg">
            {STORE_NAME}
          </Link>

          <nav aria-label="Footer">
            <ul className="flex flex-wrap gap-x-5 gap-y-1.5">
              {links.map(([href, label]) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="inline-block py-1 text-sm text-white/65 transition-colors hover:text-white"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        {/* Credits. Side by side at every width — both lines are short enough
            to fit a 320px screen without wrapping. */}
        <div className="mt-6 flex items-center justify-between gap-4 border-t border-white/10 pt-4 text-xs text-white/40">
          <p>© {year} {STORE_NAME}</p>
          <p>Developed by Planck</p>
        </div>
      </div>
    </footer>
  );
}
