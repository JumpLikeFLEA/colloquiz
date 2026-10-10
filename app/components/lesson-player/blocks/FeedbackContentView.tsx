import { Fragment } from "react";
import type { FeedbackContent } from "@/lib/feedback/content";

/**
 * The author's written feedback (docs/decisions/0096): paragraphs of runs, a
 * run optionally bold, a "\n" inside a run a line break. Rendered from the
 * stored shape only; nothing is parsed here and no HTML is ever rendered
 * (0096 Decision 3). COH-005's final comment has the same shape.
 */
export function FeedbackContentView({ content }: { content: FeedbackContent }) {
  return (
    <>
      {content.paragraphs.map((paragraph, p) => (
        <p key={p} className="mt-2 first:mt-0">
          {paragraph.runs.map((run, r) => {
            const lines = run.text.split("\n");
            const text = lines.map((line, i) => (
              <Fragment key={i}>
                {i > 0 && <br />}
                {line}
              </Fragment>
            ));
            return run.bold ? (
              <strong key={r} className="font-semibold">
                {text}
              </strong>
            ) : (
              <Fragment key={r}>{text}</Fragment>
            );
          })}
        </p>
      ))}
    </>
  );
}
