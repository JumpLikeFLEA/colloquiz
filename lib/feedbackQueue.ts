import { createClient } from "@/lib/supabase/server";
import {
  FEEDBACK_PAGE_SIZE,
  type FeedbackFilters,
  type FeedbackQueuePage,
} from "@/lib/feedbackFilters";
import type { Feedback } from "@/types";

// Read side of Admin > Feedback.
//
// NOTE this module imports the server Supabase client (and therefore
// next/headers), so client components must import from it with `import type`
// only — the constants and parsers they need live in lib/feedbackFilters.ts.

/** A queue row: the stored feedback plus whatever we can name the author by. */
export type FeedbackRow = Feedback & {
  author: { display_name: string | null; full_name: string | null } | null;
};

/**
 * One page of the feedback queue.
 *
 * ADMIN-ONLY BY RLS, NOT BY THIS FUNCTION. `feedback` has no owner-read policy
 * at all (migration 026) — only "feedback: admin read" — so a non-admin caller
 * gets an empty page rather than someone else's rows. The role check on the
 * page is what produces a sensible Forbidden screen; this is what makes the
 * data safe if that check is ever moved or missed.
 *
 * A plain PostgREST select is enough here, unlike Progress > History: every
 * filter is a real column on the table, so there is nothing that has to be
 * evaluated after loading rows and pagination can stay in the database.
 */
export async function getFeedbackPage(
  filters: FeedbackFilters,
): Promise<FeedbackQueuePage<FeedbackRow>> {
  const supabase = await createClient();

  // Unfiltered count, head-only so it transfers no rows. This is what separates
  // "no feedback has ever been sent" from "none matches this view" — without it
  // an empty New queue would claim the feature had never been used.
  const { count: grandTotal } = await supabase
    .from("feedback")
    .select("id", { count: "exact", head: true });

  const fetchPage = async (page: number) => {
    let query = supabase
      .from("feedback")
      // The embed rides the feedback.user_id -> profiles.id foreign key.
      .select("*, author:profiles(display_name, full_name)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range((page - 1) * FEEDBACK_PAGE_SIZE, page * FEEDBACK_PAGE_SIZE - 1);

    if (filters.status !== "all") query = query.eq("status", filters.status);
    if (filters.category !== "all") query = query.eq("category", filters.category);

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);
    return { rows: (data ?? []) as unknown as FeedbackRow[], total: count ?? 0 };
  };

  let { rows, total } = await fetchPage(filters.page);
  let page = filters.page;

  // An empty page past the first means ?page= is out of range — a stale link,
  // or a row that got triaged out from under it. Fall back to the last real
  // page rather than showing an empty table that looks like a broken filter.
  const pageCount = Math.max(1, Math.ceil(total / FEEDBACK_PAGE_SIZE));
  if (rows.length === 0 && total > 0 && page > pageCount) {
    page = pageCount;
    ({ rows, total } = await fetchPage(page));
  }

  return {
    rows,
    total,
    grandTotal: grandTotal ?? 0,
    page,
    pageCount: Math.max(1, Math.ceil(total / FEEDBACK_PAGE_SIZE)),
  };
}
