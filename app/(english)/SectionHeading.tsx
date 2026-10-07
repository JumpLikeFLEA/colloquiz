/**
 * A section title on the English surface's page background: optional
 * uppercase brand eyebrow, `h2`, optional subtitle (docs/decisions/0078).
 * Moved out of LandingContent.tsx so the course page (docs/decisions/0079)
 * uses the same one. No hooks, so it renders inside the client
 * `LandingContent` and in Server Components alike.
 */
export function SectionHeading({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      {eyebrow && <span className="text-xs font-semibold uppercase tracking-wider text-brand-text">{eyebrow}</span>}
      <h2 className="text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">{title}</h2>
      {subtitle && <p className="text-sm text-muted-foreground sm:text-base">{subtitle}</p>}
    </div>
  );
}
