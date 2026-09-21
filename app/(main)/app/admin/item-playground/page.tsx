import { notFound } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/queries";
import { parseItem } from "@/lib/items/index";
import type { Item } from "@/lib/items/types";
import { PLAYGROUND_EXAMPLES } from "@/lib/items/__fixtures__/playgroundExamples";
import { ItemPlaygroundClient } from "./ItemPlaygroundClient";

/**
 * ITEM-010 — dev-only item playground. Renders one committed fixture per
 * item type (lib/items/__fixtures__/playgroundExamples.ts), takes a real
 * response and shows the real score + resolved explanations, to prove the
 * lib/items/* contract end-to-end. See ItemPlaygroundClient.tsx for why the
 * renderers themselves are throwaway.
 *
 * Gated on BOTH `NODE_ENV !== "production"` (notFound() below — literally
 * unreachable in a production build/deploy, admin or not) AND the same
 * admin-role check every other admin/** page uses (admin/review/page.tsx).
 * Two independent gates because this card's title is "dev-only", not just
 * "admin-only" — a production deploy must never serve this route regardless
 * of who is signed in.
 */
export default async function ItemPlaygroundPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const supabase = await createClient();
  const user = await getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <ShieldAlert className="size-12 text-muted-foreground mb-4" />
        <h1 className="text-xl font-semibold">Forbidden</h1>
        <p className="text-muted-foreground mt-2">
          You need admin privileges to access this page.
        </p>
      </div>
    );
  }

  const examples = PLAYGROUND_EXAMPLES.map(({ label, raw }) => {
    const result = parseItem(raw);
    if (!result.ok) {
      throw new Error(
        `playground fixture "${label}" no longer parses: ${JSON.stringify(result.errors)}`,
      );
    }
    return { label, item: result.item as Item };
  });

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Item playground</h1>
        <p className="text-muted-foreground mt-1">
          Dev-only. One fixture per item type, scored for real through{" "}
          <code className="text-sm">lib/items</code>. Not the M2 lesson player.
        </p>
      </div>
      <ItemPlaygroundClient examples={examples} />
    </div>
  );
}
