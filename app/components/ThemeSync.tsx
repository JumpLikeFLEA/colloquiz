"use client";

import { use, useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import type { ThemePreference } from "@/lib/theme";

/**
 * Adopts a theme chosen on another device. Renders nothing.
 *
 * The write path is AppearanceSection, which sets next-themes AND writes
 * profiles.theme_preference. This is the read-back half: without it, storing the
 * preference would be pointless — a second device keeps whatever is in its own
 * localStorage and the choice never actually travels.
 *
 * WHY THIS RUNS AFTER HYDRATION RATHER THAN ON THE SERVER: next-themes reads
 * localStorage in an inline script that executes before the first paint, which
 * is the only way to avoid a flash of the wrong theme. A profile column cannot
 * participate in that — the row is fetched during the server render, but the
 * value would have to reach the client as markup and be applied by React, i.e.
 * after paint. So the local copy wins first paint by design, and this corrects
 * it a frame later on the one load after a cross-device change. The visible cost
 * is a single switch on that first load only; every load after it, localStorage
 * already agrees and this is a no-op.
 *
 * Runs ONCE per mount, guarded by a ref rather than by comparing values on every
 * render: `theme` changes the moment the user picks something in Settings, and
 * without the guard this effect would immediately shove it back to the
 * server-rendered `preference` — which is still the old value until the router
 * refreshes. The guard is what makes the local choice win while the page is open.
 */
export function ThemeSync({ themePromise }: { themePromise: Promise<ThemePreference | null> }) {
  const preference = use(themePromise);
  const { theme, setTheme } = useTheme();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    // `theme` is undefined until next-themes has read storage; waiting for it
    // avoids racing the value we are meant to be comparing against.
    if (theme === undefined) return;
    done.current = true;
    // null means "never chosen" — leave this device alone.
    if (preference && preference !== theme) setTheme(preference);
  }, [preference, theme, setTheme]);

  return null;
}
