"use client";

import { useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import type { AppNotification } from "@/types";

// The app's single realtime subscription. Every duel transition writes a
// notification addressed to the user who cares (challenge → opponent,
// accept/decline → challenger, resolve/expire → the relevant player), so one
// channel on this user's notification INSERTs is enough to make every duel
// surface live: it toasts the event, nudges the bell, and calls router.refresh()
// so any open server page (leaderboard, /duels, /duels/[id]) re-renders with
// fresh data. Delivery is scoped to the user's own rows by the owner-read RLS
// policy on notifications (010); realtime honours it because the browser client
// carries the session.
//
// Mounted once in the (main) layout, so it lives on every authenticated page.

/** Short toast copy + deep link for the duel notification types. */
function duelToast(n: AppNotification): { text: string; href?: string } | null {
  const p = n.payload as Record<string, unknown>;
  const href = p.duel_id ? `/duels/${String(p.duel_id)}` : undefined;
  switch (n.type) {
    case "duel_challenge":
      return {
        text: `${String(p.from ?? "Someone")} challenged you to a duel${
          p.subject ? ` on ${String(p.subject)}` : ""
        }.`,
        href,
      };
    case "duel_accepted":
      return { text: `${String(p.by ?? "Your opponent")} accepted your duel — your turn to play.`, href };
    case "duel_declined":
      return { text: `${String(p.by ?? "Your opponent")} declined your duel.`, href };
    case "duel_resolved":
      return {
        text:
          p.outcome === "win"
            ? "You won your duel."
            : p.outcome === "loss"
              ? "You lost your duel."
              : "Your duel ended in a draw.",
        href,
      };
    case "duel_expired":
      return { text: "Your duel challenge expired unanswered.", href };
    case "duel_cancelled":
      return { text: `${String(p.by ?? "Your opponent")} withdrew their duel challenge.`, href };
    case "quiz_shared":
      return {
        text: `${String(p.from ?? "Someone")} shared a quiz with you${
          p.subject && p.subject !== "a quiz" ? ` on ${String(p.subject)}` : ""
        }.`,
        href: p.token ? `/s/${String(p.token)}` : undefined,
      };
    default:
      return null; // non-duel notifications: bump the bell, but don't toast
  }
}

export function DuelRealtime({ userId }: { userId: string }) {
  const router = useRouter();
  // Read the live path inside the channel callback without re-subscribing on
  // every navigation.
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  // Assigned during render on purpose — see the note in QuizSession. Syncing in
  // an effect would either re-subscribe the realtime channel on every
  // navigation or hand the channel callback a stale path.
  // eslint-disable-next-line react-hooks/refs
  pathnameRef.current = pathname;

  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    const onInsert = (payload: { new: AppNotification }) => {
      const n = payload.new;

      // Let the bell light its dot without a refetch.
      window.dispatchEvent(new CustomEvent("notification:new", { detail: n }));

      const t = duelToast(n);
      if (t) {
        toast(t.text, t.href ? { action: { label: "View", onClick: () => router.push(t.href!) } } : undefined);
      }

      // Re-render any open server surface with fresh data — but NOT while the
      // user is inside a quiz. Refreshing /quiz/[id] re-runs its server
      // component, which recreates a session right after the results POST
      // completed it, leaving a phantom "unfinished quiz". The last player to
      // submit gets their own duel_resolved here while still on the results
      // screen, so this guard is what keeps their session closed.
      if (!pathnameRef.current.startsWith("/quiz/")) {
        router.refresh();
      }
    };

    // A "Cookie __cf_bm has been rejected for invalid domain" warning on this
    // websocket is expected and not actionable from here: __cf_bm is
    // Cloudflare bot-management's own cookie on Supabase's realtime domain,
    // rejected by the browser on a wss:// handshake due to cookie-domain
    // scoping between Cloudflare and Supabase's infra. Nothing in this file
    // (or anywhere in this codebase) sets or can suppress it.
    (async () => {
      // The realtime socket must carry the user's JWT, or the RLS policy on
      // notifications withholds every row (Supabase evaluates the SELECT policy
      // for postgres_changes). createBrowserClient does NOT propagate the auth
      // token to realtime on its own, so set it explicitly before subscribing.
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      const accessToken = data.session?.access_token;
      if (accessToken) supabase.realtime.setAuth(accessToken);

      channel = supabase
        .channel(`notifications:${userId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${userId}`,
          },
          onInsert,
        )
        .subscribe();
    })();

    // Keep the socket's token fresh across refreshes so delivery survives a
    // long-lived session.
    const { data: authSub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.access_token) supabase.realtime.setAuth(session.access_token);
    });

    return () => {
      cancelled = true;
      authSub.subscription.unsubscribe();
      if (channel) supabase.removeChannel(channel);
    };
  }, [userId, router]);

  return null;
}
