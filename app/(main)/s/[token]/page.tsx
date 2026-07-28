import Link from "next/link";
import { Share2, AlertCircle, BookOpen } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/queries";
import { pluralize } from "@/lib/format";

// Landing for a shared-quiz link (/s/[token]). get_share_preview resolves the
// token (granted to anon, so a logged-out friend sees a real preview) and
// returns only minimal fields. Access to the quiz itself comes from its
// visibility='shared' — the token only powers this preview + attribution, there
// is no accept step.
//
// Onboarding reuses the existing ?next= chain: an unauthenticated friend is sent
// to /signup?next=/s/[token] (or /login), and after sign-up / confirm / OAuth the
// AuthScreen redirectTo guard lands them back here, now signed in, to play.

type Preview = {
  ok?: boolean;
  error?: string;
  snapshot_quiz_id?: string;
  title?: string;
  subject?: string;
  question_count?: number;
  from_name?: string;
};

function subjectLabel(subject?: string): string | null {
  if (!subject) return null;
  return subject
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_share_preview", { p_token: token });
  const preview = (data ?? null) as Preview | null;
  const user = await getUser();

  const card = "w-full max-w-sm flex flex-col items-center text-center gap-5 p-8 rounded-3xl border border-border bg-card";

  if (!preview?.ok) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4">
        <div className={card}>
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-red-100">
            <AlertCircle className="size-7 text-red-500" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Quiz unavailable</h1>
            <p className="text-sm text-muted-foreground mt-1.5">
              This shared quiz is no longer available. The link may have been revoked.
            </p>
          </div>
          <Link
            href="/"
            className="w-full py-3 rounded-xl border border-border text-foreground text-sm font-medium hover:bg-accent transition-colors"
          >
            Go home
          </Link>
        </div>
      </div>
    );
  }

  const label = subjectLabel(preview.subject);
  const meta = [label, preview.question_count ? pluralize(preview.question_count, "question") : null]
    .filter(Boolean)
    .join(" · ");
  const next = encodeURIComponent(`/s/${token}`);

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className={card}>
        <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-brand to-brand-accent">
          <Share2 className="size-7 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-foreground">
            {preview.from_name ?? "A friend"} shared a quiz
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            Take on the exact same quiz they played.
          </p>
        </div>

        {/* Quiz preview */}
        <div className="w-full flex items-center gap-3 p-4 rounded-2xl border border-border bg-muted/40 text-left">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-brand-subtle text-brand-text shrink-0">
            <BookOpen size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {preview.title ?? "Shared quiz"}
            </p>
            {meta && <p className="text-xs text-muted-foreground">{meta}</p>}
          </div>
        </div>

        {user ? (
          <Link
            href={`/quiz/${preview.snapshot_quiz_id}`}
            className="w-full py-3 rounded-xl bg-brand text-white text-sm font-medium hover:bg-brand-hover transition-colors"
          >
            Play now
          </Link>
        ) : (
          <div className="w-full flex flex-col gap-2.5">
            <Link
              href={`/signup?next=${next}`}
              className="w-full py-3 rounded-xl bg-brand text-white text-sm font-medium hover:bg-brand-hover transition-colors"
            >
              Sign up &amp; play
            </Link>
            <Link
              href={`/login?next=${next}`}
              className="w-full py-3 rounded-xl border border-border text-foreground text-sm font-medium hover:bg-accent transition-colors"
            >
              Log in
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
