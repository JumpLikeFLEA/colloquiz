import { BRAND, BRAND_ACCENT } from "@/lib/site";
import { isOgDecodableCoverUrl } from "@/lib/courseCover";

/**
 * SHELL-009 — shared JSX for the two course-scoped opengraph-image.tsx route
 * segments (courses/[courseSlug] and courses/[courseSlug]/[lessonSlug]).
 * Not a route file itself (no `opengraph-image`/`page`/`layout` name), so
 * Next attaches no convention to it — a plain shared component the two
 * ImageResponse callers both render, so their card layout can't drift apart.
 *
 * Satori (the ImageResponse renderer) only supports a subset of CSS —
 * flexbox and absolute positioning, no grid — see next/og docs.
 *
 * Never pass an explicit `undefined` as a style value here — Satori throws
 * "Cannot read properties of undefined (reading 'toString')" on it instead
 * of treating it as absent. Use a conditional spread. See
 * docs/decisions/0074-vis001-cover-crop.md §7.
 */
export function OgImageCard({
  title,
  description,
  level,
  coverImageUrl,
}: {
  title: string;
  description: string | null;
  level: string | null;
  coverImageUrl: string | null;
}) {
  // Satori (this component's own renderer) can't decode WebP — VIS-001 step
  // 4c. A cover URL it can't decode is treated as absent, falling back to
  // the branded gradient card, rather than letting ImageResponse 500.
  const cover = isOgDecodableCoverUrl(coverImageUrl) ? coverImageUrl : null;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        fontFamily: "sans-serif",
        color: "#ffffff",
        background: cover ? "#000000" : `linear-gradient(135deg, ${BRAND}, ${BRAND_ACCENT})`,
      }}
    >
      {cover && (
        // eslint-disable-next-line @next/next/no-img-element -- Satori's own <img>, not a browser render
        <img
          src={cover}
          alt=""
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.55 }}
        />
      )}
      <div
        style={{
          position: cover ? "absolute" : "static",
          inset: 0,
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          gap: 16,
          padding: 64,
          ...(cover
            ? { background: "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.8) 100%)" }
            : {}),
        }}
      >
        {level && (
          <div
            style={{
              display: "flex",
              alignSelf: "flex-start",
              padding: "6px 18px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.18)",
              fontSize: 28,
              fontWeight: 600,
            }}
          >
            {level}
          </div>
        )}
        <div style={{ display: "flex", fontSize: 56, fontWeight: 700, lineHeight: 1.15 }}>{title}</div>
        {description && (
          <div style={{ display: "flex", fontSize: 28, opacity: 0.9, lineHeight: 1.35 }}>
            {description.length > 160 ? `${description.slice(0, 160)}…` : description}
          </div>
        )}
      </div>
    </div>
  );
}
