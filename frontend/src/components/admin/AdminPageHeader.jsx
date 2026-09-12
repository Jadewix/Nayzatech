/**
 * The title block at the top of an admin screen.
 *
 * Navigation and log-out moved to <AdminNav>, so all this does now is name the
 * screen and hold its primary action — which is why it no longer needs to be a
 * client component or know which dashboard is open.
 *
 * `children` is the page's primary action (e.g. "Add new product"), placed on
 * the title row where it reads as belonging to this screen rather than to the
 * panel as a whole.
 */
export default function AdminPageHeader({ eyebrow, title, description, children }) {
  return (
    <header className="pt-6 sm:pt-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && (
            <p className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-accent">
              {eyebrow}
            </p>
          )}
          <h1 className="mt-1 text-[1.75rem] font-bold leading-tight tracking-tight text-ink sm:text-[2rem]">
            {title}
          </h1>
        </div>
        {children && <div className="flex shrink-0 flex-wrap gap-2">{children}</div>}
      </div>
      {description && (
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">{description}</p>
      )}
    </header>
  );
}
