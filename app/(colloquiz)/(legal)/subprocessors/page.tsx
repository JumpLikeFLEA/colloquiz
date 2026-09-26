import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Metadata } from "next";
import { renderLegalDoc } from "@/lib/legalDoc";

// Rendered from the reviewed source in docs/release/legal/. Static: the file is
// read once at build time and the HTML is baked, so no runtime filesystem read
// happens on Vercel.
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Subprocessors · Colloquiz",
  description: "The third parties that process personal data on our behalf.",
};

export default function SubprocessorsPage() {
  const md = readFileSync(join(process.cwd(), "docs/release/legal/subprocessors.md"), "utf8");
  return renderLegalDoc(md);
}
