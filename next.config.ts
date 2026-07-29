import type { NextConfig } from "next";

// Avatars are served from the project's Supabase Storage host, which differs
// per environment — derive it from the same env var the Supabase clients use
// rather than hardcoding a project ref.
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

// The build identifier stamped onto feedback submissions (see lib/appVersion.ts).
// Resolved here, at build time, because `VERCEL_GIT_COMMIT_SHA` is a server-side
// build variable — the `env` key below inlines it into the client bundle, which
// is what lets a report carry the version the REPORTER was running rather than
// the version currently deployed. An explicit NEXT_PUBLIC_APP_VERSION wins, as
// an escape hatch for non-Vercel builds.
const appVersion =
  process.env.NEXT_PUBLIC_APP_VERSION || process.env.VERCEL_GIT_COMMIT_SHA || "dev";

const nextConfig: NextConfig = {
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
};

export default nextConfig;
