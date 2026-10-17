import { alliengllCopy } from "@/lib/alliengll/copy";
import { BRAND, BRAND_ACCENT } from "@/lib/site";
import { isOgDecodableCoverUrl } from "@/lib/courseCover";

/**
 * SHELL-009 — shared JSX for the English surface's opengraph-image.tsx route
 * segments: the course and lesson cards, and since docs/decisions/0137 the
 * surface default (app/(english)/opengraph-image.tsx) and the invite card.
 * Every card carries the Alina Cher wordmark at the top left; `eyebrow` is a
 * pill before the level ("You're invited" on an invite).
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
  eyebrow,
}: {
  title: string;
  description: string | null;
  level: string | null;
  coverImageUrl: string | null;
  eyebrow?: string;
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
          justifyContent: "space-between",
          padding: 64,
          ...(cover
            ? { background: "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.8) 100%)" }
            : {}),
        }}
      >
        <div style={{ display: "flex", fontSize: 32, fontWeight: 700, letterSpacing: -0.5, opacity: 0.95 }}>
          {alliengllCopy.wordmark}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {(eyebrow || level) && (
            <div style={{ display: "flex", gap: 12 }}>
              {eyebrow && <Pill>{eyebrow}</Pill>}
              {level && <Pill>{level}</Pill>}
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
    </div>
  );
}

function Pill({ children }: { children: string }) {
  return (
    <div
      style={{
        display: "flex",
        padding: "6px 18px",
        borderRadius: 999,
        background: "rgba(255,255,255,0.18)",
        fontSize: 28,
        fontWeight: 600,
      }}
    >
      {children}
    </div>
  );
}
