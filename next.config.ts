import type { NextConfig } from "next";

// Avatars are served from the project's Supabase Storage host, which differs
// per environment — derive it from the same env var the Supabase clients use
// rather than hardcoding a project ref.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseHost = supabaseUrl ? new URL(supabaseUrl).hostname : undefined;

// The build identifier stamped onto feedback submissions (see lib/appVersion.ts).
// Resolved here, at build time, because `VERCEL_GIT_COMMIT_SHA` is a server-side
// build variable — the `env` key below inlines it into the client bundle, which
// is what lets a report carry the version the REPORTER was running rather than
// the version currently deployed. An explicit NEXT_PUBLIC_APP_VERSION wins, as
// an escape hatch for non-Vercel builds.
const appVersion =
  process.env.NEXT_PUBLIC_APP_VERSION || process.env.VERCEL_GIT_COMMIT_SHA || "dev";

const isDev = process.env.NODE_ENV === "development";

// ── Content Security Policy ──────────────────────────────────────────────
// Shipped REPORT-ONLY first (locked decision): it observes and logs violations
// without blocking anything, so the real policy can be tightened against real
// traffic before it is enforced. No nonces — a nonce-based CSP forces every page
// to render dynamically (Next injects nonces per request), which would throw
// away the static/streamed rendering the app is built around; the cost is
// keeping 'unsafe-inline' for the framework's and next-themes' inline scripts.
//
// Origins allowed beyond 'self':
//   • Supabase — REST + Realtime websocket (connect), avatar images (img)
//   • Vercel — analytics script (script) + Web Vitals beacon (connect)
const supabaseHttps = supabaseUrl ? new URL(supabaseUrl).origin : "";
const supabaseWss = supabaseHost ? `wss://${supabaseHost}` : "";

const csp = [
  `default-src 'self'`,
  // 'unsafe-eval' only in dev (React uses eval for better stack traces).
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://va.vercel-scripts.com`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' blob: data: ${supabaseHttps}`.trim(),
  `font-src 'self' data:`,
  `connect-src 'self' ${supabaseHttps} ${supabaseWss} https://vitals.vercel-insights.com https://va.vercel-scripts.com`.replace(/\s+/g, " ").trim(),
  // PLAY-001 lesson video facade: no iframe exists until the learner clicks
  // (see app/components/lesson-player/blocks/VideoBlock.tsx), so this only
  // ever permits an embed the learner opted into, never an eager one.
  `frame-src 'self' https://www.youtube-nocookie.com`,
  `frame-ancestors 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `object-src 'none'`,
  `upgrade-insecure-requests`,
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy-Report-Only", value: csp },
  // Defence in depth alongside the CSP frame-ancestors 'none' above.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  // Drop the `X-Powered-By: Next.js` banner — no reason to advertise the stack.
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
  },
  images: {
    remotePatterns: supabaseHost
      ? [
          {
            protocol: "https",
            hostname: supabaseHost,
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : [],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // SHELL-001: Colloquiz moved wholesale under /app so the English surface
  // (planned M2) can own the clean top-level URLs. Every route that used to
  // live directly under (main) gets a 308 here — enumerated from the route
  // tree (see `find "app/(colloquiz)/(main)/app" -name page.tsx`), not from
  // memory.
  // `redirects` run BEFORE proxy.ts (Next.js redirecting guide), so this list
  // is what a stale bookmark or an old share link actually hits first; the
  // proxy's own legacy `/dashboard` → `/progress` shortcut had to be
  // re-keyed onto the new `/app/...` paths for the same reason.
  async redirects() {
    const movedSegments = [
      "achievements",
      "admin",
      "advanced",
      "build",
      "courses",
      "custom",
      "dashboard",
      "duels",
      "groups",
      "invite",
      "leaderboard",
      "my-quizzes",
      "progress",
      "quiz",
      "results",
      "s",
      "settings",
      "students",
    ];
    return [
      // SHELL-013: temporary (307) — `/` will serve the English landing once
      // M2 lands, and a 308 here would be cached by browsers past the point
      // the entry is removed. SHELL-010 removes this redirect entirely.
      { source: "/", destination: "/app", permanent: false },
      ...movedSegments.map((segment) => ({
        source: `/${segment}/:path*`,
        destination: `/app/${segment}/:path*`,
        permanent: true,
      })),
    ];
  },
};

export default nextConfig;
