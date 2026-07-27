"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  EMAIL_UNAVAILABLE_NOTE,
  NOTIFICATION_EVENTS,
  type NotificationEventKey,
} from "@/lib/notificationPrefs";
import { Switch } from "@/app/components/ui/switch";

/**
 * The event × channel preference matrix.
 *
 * A real <table>: this is a grid of events against delivery channels, and the
 * scope="col" / scope="row" headers are what let a screen reader say which
 * channel a given switch belongs to. The switches themselves are Radix buttons
 * with no text, so each also carries an explicit aria-label.
 *
 * Toggling is optimistic — the switch moves immediately and snaps back with an
 * explanation if the write fails, rather than sitting inert during the round
 * trip.
 */
export function NotificationsSection({
  userId,
  initial,
}: {
  userId: string;
  initial: Record<NotificationEventKey, boolean>;
}) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [busy, setBusy] = useState<NotificationEventKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggleInApp(key: NotificationEventKey, next: boolean) {
    setError(null);
    setBusy(key);
    setValues(v => ({ ...v, [key]: next }));

    const supabase = createClient();
    // Upsert rather than insert-or-delete: a row is written the first time an
    // event is changed and then updated in place. Absence still means "on", so
    // an account that has never touched this page stores nothing.
    const { error: writeError } = await supabase
      .from("notification_preferences")
      .upsert(
        { user_id: userId, event: key, in_app: next, updated_at: new Date().toISOString() },
        { onConflict: "user_id,event" },
      );

    setBusy(null);
    if (writeError) {
      setValues(v => ({ ...v, [key]: !next }));
      setError(writeError.message);
      return;
    }
    // Keep the server-rendered copy of this page authoritative, so navigating
    // away and back cannot show a stale switch from the router cache.
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th
                scope="col"
                className="text-left px-5 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                Event
              </th>
              <th
                scope="col"
                className="w-20 px-2 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                In-app
              </th>
              <th
                scope="col"
                className="w-20 px-2 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                Email
              </th>
            </tr>
          </thead>
          <tbody>
            {NOTIFICATION_EVENTS.map(event => (
              <tr key={event.key} className="border-b border-border last:border-0">
                <th scope="row" className="text-left font-normal px-5 py-4">
                  <span className="block text-sm text-foreground">{event.label}</span>
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    {event.description}
                  </span>
                </th>
                <td className="px-2 py-4 text-center">
                  <span className="inline-flex items-center justify-center gap-2">
                    <Switch
                      checked={values[event.key]}
                      disabled={busy === event.key}
                      onCheckedChange={next => void toggleInApp(event.key, next)}
                      aria-label={`In-app notifications for ${event.label.toLowerCase()}`}
                      className="cursor-pointer"
                    />
                    {busy === event.key && (
                      <Loader2 size={13} className="animate-spin text-muted-foreground" />
                    )}
                  </span>
                </td>
                <td className="px-2 py-4 text-center">
                  {/* Disabled, not hidden: the channel exists as a plan, and a
                      missing column would read as an oversight. The switch is
                      inert and the reason is stated under the table. */}
                  <Switch
                    checked={false}
                    disabled
                    aria-label={`Email notifications for ${event.label.toLowerCase()} — not available yet`}
                    title={EMAIL_UNAVAILABLE_NOTE}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">{EMAIL_UNAVAILABLE_NOTE}</p>

      {error && (
        <p className="text-xs text-destructive">
          Couldn’t save that preference: {error}
        </p>
      )}
    </div>
  );
}
