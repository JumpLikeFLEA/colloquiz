import mammoth from "mammoth";

/**
 * DOCX to HTML on our side (docs/decisions/0203 Decision 2). mammoth keeps headings, lists and
 * tables, which is what the drafting model needs to see the document's layout; embedded images
 * are dropped (extracting them into lesson-images is not done here) and counted, so the QA
 * report can say so.
 */

export type DocxConversion = {
  html: string;
  /** Embedded images that were left out. */
  imagesDropped: number;
  /** mammoth's own warnings (unsupported styles and the like), capped. */
  warnings: string[];
};

export async function convertDocxToHtml(bytes: Uint8Array): Promise<DocxConversion> {
  let imagesDropped = 0;
  const result = await mammoth.convertToHtml(
    { buffer: Buffer.from(bytes) },
    {
      convertImage: mammoth.images.imgElement(async () => {
        imagesDropped += 1;
        // An <img> with no src is dropped below; mammoth needs an element to count.
        return { src: "" };
      }),
    },
  );
  const html = result.value.replace(/<img\b[^>]*>/g, "");
  return {
    html,
    imagesDropped,
    warnings: result.messages
      .filter((m) => m.type === "warning")
      .map((m) => m.message)
      .slice(0, 10),
  };
}
