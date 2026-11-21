import { Fragment } from "react";

/**
 * Draws a line feed in authored text as a `<br>` (AUTH-025,
 * docs/decisions/0233). Every inline field and most plain practice strings
 * take line breaks since then; HTML collapses a bare `\n` to a space, so each
 * renderer passes its text through here instead. A text with no line feed
 * renders as the plain string, exactly as before. Server-safe: no hooks.
 */
export function LineBreaks({ text }: { text: string }) {
  if (!text.includes("\n")) return <>{text}</>;
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, index) => (
        // Lines are positional slices of one string, never reordered.
        <Fragment key={index}>
          {index > 0 && <br />}
          {line}
        </Fragment>
      ))}
    </>
  );
}
