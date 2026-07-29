import { ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/queries";
import { getFeedbackPage } from "@/lib/feedbackQueue";
import { parseFeedbackFilters, hasActiveFilters } from "@/lib/feedbackFilters";
import { FeedbackQueue } from "./FeedbackQueue";

interface Props {
  searchParams: Promise<{ status?: string; category?: string; page?: string }>;
}

/**
 * Admin > Feedback.
 *
 * Role-gated exactly like /admin/review: the check runs BEFORE any feedback is
 * fetched, so a non-admin's request never reaches the table. RLS would return
 * nothing anyway (feedback has no owner-read policy), which is the real
 * boundary — this is what turns that into a screen instead of an empty list.
 */
export default async function AdminFeedbackPage({ searchParams }: Props) {
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

  const filters = parseFeedbackFilters(await searchParams);
  const page = await getFeedbackPage(filters);

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Feedback</h1>
        <p className="text-muted-foreground mt-1">
          What people sent from the Feedback button, with the page they were on.
        </p>
      </div>

      <FeedbackQueue
        page={page}
        filters={filters}
        filtered={hasActiveFilters(filters)}
      />
    </div>
  );
}
