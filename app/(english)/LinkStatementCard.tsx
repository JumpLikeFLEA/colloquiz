import { linkStatement, statementLead } from "@/lib/teacherLinks";

/**
 * TCH-001 (docs/decisions/0148) — the plain statement of what a linked
 * teacher sees, shown before "Join" on the join page and on the invite page
 * (docs/decisions/0141 Decision 3). One component so the two cannot drift;
 * the text itself is lib/teacherLinks.ts's `linkStatement`, which mirrors
 * privacy-policy.md section 5. A Server Component with no client JS. Muted
 * card tokens only; the Colloquiz-free English surface adds no colour.
 */
export function LinkStatementCard({ lang, teacherName }: { lang: "en" | "ru"; teacherName: string }) {
  const s = linkStatement[lang];
  return (
    <div className="flex w-full max-w-md flex-col gap-2 rounded-xl bg-muted px-4 py-3 text-left" data-link-statement>
      <p className="text-sm font-medium text-foreground">{statementLead(lang, teacherName)}</p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        {s.sees.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p className="text-sm text-muted-foreground">{s.cannot}</p>
      <p className="text-sm text-muted-foreground">{s.leave}</p>
    </div>
  );
}
