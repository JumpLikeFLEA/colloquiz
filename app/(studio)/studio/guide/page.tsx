import Link from "next/link";
import { BookOpen, ChevronRight } from "lucide-react";
import { visibleArticles } from "@/lib/studioGuide/articles";
import { guideReader } from "./access";

// TCH-015 (docs/decisions/0206 Decision 7): the Guide's index. A Server
// Component over lib/studioGuide, so it ships no client JS. Which articles
// the reader sees is decided by canReadArticle (Decision 8).

export const metadata = { title: "Guide" };

export default async function GuideIndex() {
  const articles = visibleArticles(await guideReader());
  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Guide</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Plain steps for the things you do in Studio. Start with Your first course.
        </p>
      </div>
      <div className="space-y-2">
        {articles.map((a) => (
          <Link
            key={a.slug}
            href={`/studio/guide/${a.slug}`}
            prefetch={false}
            className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 hover:bg-accent transition-colors"
          >
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-muted text-muted-foreground shrink-0">
              <BookOpen size={16} />
            </div>
            <div className="flex-1 min-w-0 space-y-0.5">
              <p className="text-sm font-semibold text-foreground break-words">{a.title}</p>
              <p className="text-xs text-muted-foreground">{a.purpose}</p>
            </div>
            <ChevronRight size={16} className="text-muted-foreground shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  );
}
