import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Metadata } from "next";
import { renderLegalDoc } from "@/lib/legalDoc";

// Rendered from the reviewed source in docs/release/legal/. Static: the file is
// read once at build time and the HTML is baked, so no runtime filesystem read
// happens on Vercel.
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Terms of Service · Colloquiz",
  description: "The terms that govern your use of Colloquiz.",
};

export default function TermsPage() {
  const md = readFileSync(join(process.cwd(), "docs/release/legal/terms-of-service.md"), "utf8");
  return renderLegalDoc(md);
}
