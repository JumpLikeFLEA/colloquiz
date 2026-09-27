import { BRAND, BRAND_ACCENT } from "@/lib/site";

/**
 * SHELL-009 — shared JSX for the two course-scoped opengraph-image.tsx route
 * segments (courses/[courseSlug] and courses/[courseSlug]/[lessonSlug]).
 * Not a route file itself (no `opengraph-image`/`page`/`layout` name), so
 * Next attaches no convention to it — a plain shared component the two
 * ImageResponse callers both render, so their card layout can't drift apart.
 *
 * Satori (the ImageResponse renderer) only supports a subset of CSS —
 * flexbox and absolute positioning, no grid — see next/og docs.
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
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        fontFamily: "sans-serif",
        color: "#ffffff",
        background: coverImageUrl ? "#000000" : `linear-gradient(135deg, ${BRAND}, ${BRAND_ACCENT})`,
      }}
    >
      {coverImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- Satori's own <img>, not a browser render
        <img
          src={coverImageUrl}
          alt=""
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.55 }}
        />
      )}
      <div
        style={{
          position: coverImageUrl ? "absolute" : "static",
          inset: 0,
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          gap: 16,
          padding: 64,
          background: coverImageUrl
            ? "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.8) 100%)"
            : undefined,
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
