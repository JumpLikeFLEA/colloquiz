"use client";

import { useState, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { ThemePreference } from "@/lib/theme";

const OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

/**
 * False through SSR and the hydration pass, true afterwards.
 *
 * Deliberately useSyncExternalStore and not the usual
 * `useEffect(() => setMounted(true), [])`: that pattern is a setState in an
 * effect body, which schedules a second render pass and which
 * react-hooks/set-state-in-effect rejects. This gets the same answer from the
 * one thing that genuinely differs between server and client — whether a
 * server snapshot was used — with no state and no extra commit.
 */
const NEVER_CHANGES = () => () => {};
function useHydrated() {
  return useSyncExternalStore(
    NEVER_CHANGES,
    () => true,
    () => false,
  );
}

/**
 * Light / Dark / System, applied on selection. No save button and no reload:
 * next-themes swaps the class on <html> synchronously, so the change is done
 * before the click handler returns. The database write is a background
 * write-through for other devices and is deliberately NOT awaited before the
 * theme moves.
 *
 * SEMANTICS: real radio inputs, visually hidden behind styled labels, rather
 * than buttons with role="radio". A radiogroup is expected to support arrow-key
 * traversal with a single tab stop, and the platform gives that for free here —
 * hand-rolling it on buttons means reimplementing roving tabindex and getting
 * Home/End and wrap-around right. `sr-only` clips the input without removing it
 * from the accessibility tree or the focus order, so :focus-visible still fires
 * and the ring is drawn on the label via peer-focus-visible.
 *
 * The visual pattern (bordered pill rail, brand-subtle active segment) matches
 * the Quick Play difficulty filter in SubjectGrid. That one is a set of links
 * because its state lives in the URL; this is a preference, hence the different
 * markup for the same look.
 */
export function AppearanceSection({
  userId,
  initialPreference,
}: {
  userId: string;
  /** profiles.theme_preference, for a sensible server-rendered active segment. */
  initialPreference: ThemePreference | null;
}) {
  const { theme, setTheme, systemTheme } = useTheme();
  const [syncError, setSyncError] = useState<string | null>(null);

  // next-themes cannot know the stored value during SSR or the hydration pass,
  // so `theme` is undefined until then. Until it resolves, the profile copy is
  // the best guess available and usually the right one — the two only disagree
  // on the first load after a change made elsewhere, which ThemeSync resolves.
  const mounted = useHydrated();
  const selected: ThemePreference = mounted
    ? ((theme ?? "system") as ThemePreference)
    : (initialPreference ?? "system");

  async function choose(next: ThemePreference) {
    setSyncError(null);
    // Local first, and unconditionally: the user asked for this theme, so it
    // applies whether or not the account write succeeds.
    setTheme(next);

    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ theme_preference: next })
      .eq("id", userId);
    // A failure costs cross-device sync, not the theme itself — say exactly
    // that rather than reverting a change the user can plainly see worked.
    if (error) setSyncError(error.message);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-border bg-card p-5 flex flex-col gap-4">
        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-medium text-foreground">Theme</legend>

          <div className="flex items-center gap-1 p-1 rounded-xl border border-border bg-background w-fit">
            {OPTIONS.map(({ value, label, icon: Icon }) => {
              const active = selected === value;
              return (
                <label key={value} className="cursor-pointer">
                  <input
                    type="radio"
                    name="theme-preference"
                    value={value}
                    checked={active}
                    onChange={() => choose(value)}
                    className="peer sr-only"
                  />
                  <span
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors",
                      // The theme swap itself is never animated — the provider
                      // sets disableTransitionOnChange, which suppresses every
                      // transition for the frame the class changes, for all
                      // users. This is the segment's own hover/select fade, and
                      // it is the one thing here that honours reduced motion:
                      // the colour still changes, only the tween is dropped.
                      "motion-reduce:transition-none",
                      "peer-focus-visible:ring-2 peer-focus-visible:ring-brand peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-card",
                      active
                        ? "bg-brand-subtle text-brand-text font-medium"
                        : "text-muted-foreground hover:bg-accent",
                    )}
                  >
                    <Icon size={14} aria-hidden="true" />
                    {label}
                  </span>
                </label>
              );
            })}
          </div>

          {/* What "System" actually means right now. next-themes keeps
              systemTheme current from a matchMedia listener, so changing the OS
              appearance updates this line — and the page — with no reload.
              Rendered only after mount: there is no system value on the server,
              and guessing one would flash the wrong word. aria-live so the
              change is announced rather than only seen. */}
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {mounted && systemTheme
              ? selected === "system"
                ? `Following your device, which is currently ${systemTheme === "dark" ? "dark" : "light"}.`
                : `Your device is currently ${systemTheme === "dark" ? "dark" : "light"}.`
              : " "}
          </p>
        </fieldset>

        <p className="text-xs text-muted-foreground border-t border-border pt-4">
          Saved to your account, so it follows you to your other devices.
        </p>
      </div>

      {syncError && (
        <p className="text-sm text-destructive-text">
          The theme changed on this device, but couldn&apos;t be saved to your account:{" "}
          {syncError}
        </p>
      )}
    </div>
  );
}
