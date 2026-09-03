import Link from 'next/link';

const STORE_NAME = process.env.NEXT_PUBLIC_STORE_NAME || 'Tech Store';

/**
 * The footer.
 *
 * The reference layout ends on a row of card logos. This shop takes no cards —
 * it takes cash, at the door — so that row would be a lie told in pictograms.
 * The same slot says what is actually true instead, which is also the strongest
 * thing the shop has to say about paying.
 *
 * The oversized wordmark is the one piece of pure decoration on the page, and
 * it is cropped by the viewport on purpose: it reads as a printed edge rather
 * than a logo that failed to fit.
 */
export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-24 bg-ink text-white">
      <div className="mx-auto max-w-6xl px-4 pt-14">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-1">
            <p className="display text-2xl">{STORE_NAME}</p>
            <p className="mt-2 max-w-xs text-sm leading-relaxed text-white/60">
              Laptops, PC parts, phone cases and everyday electronics.
            </p>
          </div>

          <FooterColumn title="Shop">
            <FooterLink href="/products">All products</FooterLink>
            <FooterLink href="/products?featured=true">Featured</FooterLink>
            <FooterLink href="/products?category=laptops">Laptops</FooterLink>
            <FooterLink href="/products?category=pc-parts">PC parts</FooterLink>
          </FooterColumn>

          <FooterColumn title="Your order">
            <FooterLink href="/cart">Cart</FooterLink>
            <FooterLink href="/track">Track an order</FooterLink>
            <FooterLink href="/checkout">Checkout</FooterLink>
          </FooterColumn>

          <div>
            <p className="eyebrow text-white/40">How you pay</p>
            <p className="mt-3 text-sm leading-relaxed text-white/70">
              Cash on delivery. Nothing is charged online and no card details are ever
              entered — you hand the money to the courier when your order arrives, and
              not before.
            </p>
          </div>
        </div>

        {/*
          The wordmark, set to the full width of the container and clipped at the
          baseline. `select-none` because it is texture, not text to copy.
        */}
        <p
          aria-hidden="true"
          className="display mt-14 -mb-3 select-none overflow-hidden text-[19vw] leading-[0.78] text-white/[0.06] lg:text-[11rem]"
        >
          {STORE_NAME}
        </p>
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-5 text-xs text-white/40">
          <p>© {year} {STORE_NAME}</p>
          <p className="eyebrow">Cash on delivery only</p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, children }) {
  return (
    <div>
      <p className="eyebrow text-white/40">{title}</p>
      <ul className="mt-3 space-y-2 text-sm">{children}</ul>
    </div>
  );
}

function FooterLink({ href, children }) {
  return (
    <li>
      <Link href={href} className="text-white/70 transition-colors hover:text-white">
        {children}
      </Link>
    </li>
  );
}
