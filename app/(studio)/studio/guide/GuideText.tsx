// TCH-015 (docs/decisions/0206 Decision 14). Renders an article string: text
// between ** pairs becomes <strong> (a button's exact label), everything else
// is plain text. Not a Markdown engine: no other syntax is read, and nothing
// is ever interpreted as HTML.
export function GuideText({ text }: { text: string }) {
  const parts = text.split("**");
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <strong key={i} className="font-semibold text-foreground">
            {part}
          </strong>
        ) : (
          part
        ),
      )}
    </>
  );
}
