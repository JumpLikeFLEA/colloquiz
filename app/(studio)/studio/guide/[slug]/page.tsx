import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { canReadArticle, findArticle } from "@/lib/studioGuide/articles";
import { guideReader } from "../access";
import { GuideText } from "../GuideText";

// TCH-015 (docs/decisions/0206 Decisions 7-8): one article. An article the
// reader may not use is a 404, the same as one that does not exist, so the
// page does not advertise a feature they cannot reach.

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return { title: findArticle(slug)?.title ?? "Guide" };
}

export default async function GuideArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const reader = await guideReader();
  const article = findArticle(slug);
  if (!article || !canReadArticle(article, reader)) notFound();

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <Link
          href="/studio/guide"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          Guide
        </Link>
        <h1 className="text-2xl font-bold text-foreground mt-2 break-words">{article.title}</h1>
        <p className="text-sm text-muted-foreground mt-1">{article.purpose}</p>
      </div>

      <section className="rounded-2xl border border-border bg-card p-5 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Steps</h2>
        <ol className="space-y-3">
          {article.steps.map((s, i) => (
            <li key={i} className="flex gap-3 text-sm text-foreground">
              <span className="flex items-center justify-center size-6 shrink-0 rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                {i + 1}
              </span>
              <span className="min-w-0 break-words pt-0.5">
                <GuideText text={s} />
              </span>
            </li>
          ))}
        </ol>
      </section>

      {article.tips.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground">Good to know</h2>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
            {article.tips.map((t, i) => (
              <li key={i} className="break-words">
                <GuideText text={t} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <Link
        href={article.goTo.path}
        className="inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-11 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-hover transition-colors"
      >
        {article.goTo.label}
      </Link>
    </div>
  );
}
