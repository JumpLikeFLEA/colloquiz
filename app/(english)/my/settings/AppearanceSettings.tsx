"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { asThemePreference, THEME_STORAGE_KEY, type ThemePreference } from "@/lib/theme";
import { PAPER_PANEL_CLASS } from "../../surfaceClasses";
import type { AppearanceLabels } from "./settingsCopy";

const DARK_QUERY = "(prefers-color-scheme: dark)";

// This device's stored choice, as a tiny external store: the "storage" event
// covers another tab, `notify` covers this one (the event doesn't fire in the
// tab that wrote). useSyncExternalStore, not useEffect + setState, for the
// reason AppearanceSection gives (react-hooks/set-state-in-effect).
const listeners = new Set<() => void>();
function notify() {
  listeners.forEach((l) => l());
}
function subscribeStored(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}
function readStored(): ThemePreference {
  try {
    return asThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY)) ?? "system";
  } catch {
    return "system";
  }
}

function subscribeOs(onChange: () => void) {
  const mq = window.matchMedia(DARK_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
const readOsDark = () => window.matchMedia(DARK_QUERY).matches;

function applyTheme(preference: ThemePreference) {
  const dark = preference === "dark" || (preference === "system" && readOsDark());
  document.documentElement.classList.toggle("dark", dark);
}

const OPTIONS = [
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
  { value: "system", icon: Monitor },
] as const;

/**
 * Light / Dark / System for the English surface (docs/decisions/0181), the
 * Colloquiz AppearanceSection's control without next-themes, which this
 * surface doesn't load (0046). A choice applies at once: it is stored under
 * next-themes' own key, so Colloquiz and Studio follow it on this device, the
 * class on <html> is swapped here, and profiles.theme_preference is written
 * in the background, so the English layout (englishThemeScript) and
 * Colloquiz's ThemeSync adopt it on other devices. The write is not awaited
 * before the theme moves; a failure costs cross-device sync, not the theme,
 * and the line under the control says exactly that.
 *
 * Until hydration the server's value (the profile's) is shown; afterwards
 * this device's stored one, which the layout script already brought in line
 * with the profile on this load.
 */
export function AppearanceSettings({
  userId,
  initialPreference,
  labels,
}: {
  userId: string;
  initialPreference: ThemePreference | null;
  labels: AppearanceLabels;
}) {
  const selected = useSyncExternalStore(subscribeStored, readStored, () => initialPreference ?? "system");
  // null on the server and through hydration: there is no OS value there, and
  // guessing one would flash the wrong word.
  const osDark = useSyncExternalStore<boolean | null>(subscribeOs, readOsDark, () => null);
  const [syncError, setSyncError] = useState<string | null>(null);

  // While "system" is selected, follow the OS live on this page, as next-themes
  // does in Colloquiz. Syncs the DOM only; no state is set here.
  useEffect(() => {
    if (selected !== "system" || osDark === null) return;
    document.documentElement.classList.toggle("dark", osDark);
  }, [selected, osDark]);

  async function choose(next: ThemePreference) {
    setSyncError(null);
    // Local first, and unconditionally: the learner asked for this theme.
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage blocked: the theme still applies to this page below.
    }
    notify();
    applyTheme(next);

    // Loaded on the first choice, not with the page: no @supabase/ssr on an
    // English route's first load (eslint.config.mjs, OPS-013), the
    // LessonPlayer / VoiceRecorder precedent.
    const { createClient } = await import("@/lib/supabase/client");
    const { error } = await createClient().from("profiles").update({ theme_preference: next }).eq("id", userId);
    if (error) setSyncError(labels.syncError.replace("{error}", error.message));
  }

  const mode = osDark ? labels.modeDark : labels.modeLight;

  return (
    <div className="flex flex-col gap-3">
      <div className={`${PAPER_PANEL_CLASS} flex flex-col gap-4 p-4 sm:p-5`}>
        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-medium text-foreground">{labels.legend}</legend>

          <div className="flex w-fit max-w-full flex-wrap items-center gap-1 rounded-xl border border-border bg-background p-1">
            {OPTIONS.map(({ value, icon: Icon }) => {
              const active = selected === value;
              return (
                <label key={value} className="cursor-pointer">
                  <input
                    type="radio"
                    name="theme-preference"
                    value={value}
                    checked={active}
                    onChange={() => void choose(value)}
                    className="peer sr-only"
                  />
                  <span
                    className={cn(
                      "flex min-h-11 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors motion-reduce:transition-none",
                      "peer-focus-visible:ring-2 peer-focus-visible:ring-brand peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-card",
                      active ? "bg-brand-subtle font-medium text-brand-text" : "text-muted-foreground hover:bg-accent",
                    )}
                  >
                    <Icon size={14} aria-hidden="true" />
                    {labels[value]}
                  </span>
                </label>
              );
            })}
          </div>

          <p className="text-sm text-muted-foreground" aria-live="polite">
            {osDark === null
              ? " "
              : (selected === "system" ? labels.followingDevice : labels.deviceIs).replace("{mode}", mode)}
          </p>
        </fieldset>

        <p className="border-t border-border pt-4 text-xs text-muted-foreground">{labels.savedNote}</p>
      </div>

      {syncError && <p className="text-sm text-destructive-text">{syncError}</p>}
    </div>
  );
}
