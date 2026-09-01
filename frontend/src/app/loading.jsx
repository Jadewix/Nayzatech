/**
 * Shown automatically while a server component fetches its data.
 * Next.js wires this up by convention — no code needed to trigger it.
 */
export default function Loading() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-16">
      <div className="animate-pulse space-y-4">
        <div className="h-7 bg-surface rounded w-1/3" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="aspect-square bg-surface rounded-xl" />
              <div className="h-3 bg-surface rounded w-3/4" />
              <div className="h-3 bg-surface rounded w-1/2" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
