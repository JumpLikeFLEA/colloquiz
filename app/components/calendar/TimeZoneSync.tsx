"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { TZ_COOKIE } from "@/lib/calendar/calendar";

// COH-015 (docs/decisions/0159 Decision 7, revised by 0194) — how the server
// learns the viewer's time zone. A server-rendered month grid has to know the
// zone before it renders, and the browser only reveals it to JavaScript. This
// writes the `colloquiz_tz` cookie and refreshes the route ONCE, only when the
// cookie was missing or different and the write actually stuck, so a browser
// that blocks cookies can't loop. Without JS the server falls back to UTC and
// the page says so. It was an inline <script> until 0194: a script rendered
// during a client navigation (a Link into /my) never runs and makes React warn,
// so the zone was not learned on that path.
export function TimeZoneSync() {
  const router = useRouter();
  useEffect(() => {
    try {
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!zone) return;
      const match = document.cookie.match(new RegExp(`(?:^|; )${TZ_COOKIE}=([^;]*)`));
      if ((match ? decodeURIComponent(match[1]) : "") === zone) return;
      const written = `${TZ_COOKIE}=${encodeURIComponent(zone)}`;
      document.cookie = `${written}; path=/; max-age=31536000; samesite=lax`;
      if (document.cookie.includes(written)) router.refresh();
    } catch {
      // No Intl zone or no cookie access: the page stays in UTC and says so.
    }
  }, [router]);
  return null;
}
