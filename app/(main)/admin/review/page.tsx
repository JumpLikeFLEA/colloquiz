import { redirect } from "next/navigation";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/queries";
import { getPendingQuestions } from "@/lib/questions";
import { getReportedQuestions } from "@/lib/reports";
import { cn } from "@/lib/utils";
import { ReviewQueue } from "./ReviewQueue";
import { ReportedQueue } from "./ReportedQueue";

const PAGE_SIZE = 10;

type Tab = "pending" | "reported";

interface Props {
  searchParams: Promise<{ page?: string; tab?: string }>;
}

export default async function AdminReviewPage({ searchParams }: Props) {
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

  const { page: pageParam, tab: tabParam } = await searchParams;
  const tab: Tab = tabParam === "reported" ? "reported" : "pending";

  // The reported groups double as the tab badge count, so always fetch them.
  const reportedGroups = await getReportedQuestions();

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Review Queue</h1>
        <p className="text-muted-foreground mt-1">
          Approve AI-generated questions and moderate user-reported ones.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <TabLink href="/admin/review?tab=pending" active={tab === "pending"}>
          Pending
        </TabLink>
        <TabLink href="/admin/review?tab=reported" active={tab === "reported"}>
          Reported
          {reportedGroups.length > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-destructive-subtle text-destructive-text text-xs font-medium px-1.5 min-w-5 h-5">
              {reportedGroups.length}
            </span>
          )}
        </TabLink>
      </div>

      {tab === "reported" ? (
        <ReportedQueue initial={reportedGroups} />
      ) : (
        <PendingTab pageParam={pageParam} />
      )}
    </div>
  );
}

async function PendingTab({ pageParam }: { pageParam?: string }) {
  const requestedPage = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const { questions, total } = await getPendingQuestions(requestedPage, PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // If the requested page no longer exists (e.g. after bulk approving),
  // redirect to the new last page.
  if (requestedPage > totalPages && total > 0) {
    redirect(`/admin/review?tab=pending&page=${totalPages}`);
  }

  return (
    <ReviewQueue
      initial={questions}
      currentPage={requestedPage}
      totalPages={totalPages}
      total={total}
      pageSize={PAGE_SIZE}
    />
  );
}

function TabLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center rounded-md border px-3 py-1.5 text-sm hover:bg-accent",
        active && "bg-accent font-medium"
      )}
    >
      {children}
    </Link>
  );
}
