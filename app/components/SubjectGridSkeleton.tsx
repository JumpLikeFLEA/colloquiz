// Suspense fallback for the Quick Play subject grid (app/(main)/page.tsx).
// Mirrors SubjectGrid's header + card grid so the static shell can paint
// immediately while the (cached, per-user) grid data streams in — and, because
// the placeholders match the real card dimensions, without a layout shift when
// the content swaps in. Same precedent as the Progress tab's TabSkeleton;
// composed only from classes already used in SubjectGrid. Not a Figma surface.
export function SubjectGridSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-hidden="true">
      {/* Header: title block + Random Quiz button */}
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="space-y-2">
            <div className="h-7 w-40 rounded-lg bg-muted animate-pulse" />
            <div className="h-4 w-80 max-w-full rounded bg-muted animate-pulse" />
          </div>
          <div className="h-10 w-36 rounded-xl bg-muted animate-pulse" />
        </div>

        {/* Filter row: search field + difficulty segmented control */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="h-11 flex-1 min-w-56 max-w-sm rounded-xl bg-muted animate-pulse" />
          <div className="h-11 w-64 rounded-xl bg-muted animate-pulse" />
        </div>
      </div>

      {/* Card grid — same template as the real grid so nothing shifts. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex w-full items-center gap-3 p-4 rounded-2xl border border-border bg-card"
          >
            <div className="w-10 h-10 rounded-xl bg-muted animate-pulse shrink-0" />
            <div className="flex-1 min-w-0 space-y-2">
              <div className="h-4 w-2/3 rounded bg-muted animate-pulse" />
              <div className="h-3 w-1/3 rounded bg-muted animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
