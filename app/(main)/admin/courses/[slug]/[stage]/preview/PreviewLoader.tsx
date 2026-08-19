"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { TheoryBlocksSchema, type TheoryBlock } from "@/lib/courseContent";
import { TheorySectionPreview } from "@/app/(main)/courses/[slug]/[stage]/TheorySectionPreview";

/**
 * Reads the draft blocks the editor's Preview button wrote to sessionStorage
 * (key "course-preview:<stageId>") and renders them. Runs client-side only —
 * sessionStorage doesn't exist during the server render of the page this
 * mounts in — so this always starts in the "no draft yet" state for one tick,
 * then flips once the effect reads storage. A stale/absent entry (direct
 * navigation, another tab, another browser) shows the fallback rather than a
 * blank page.
 */
function readDraft(stageId: string): TheoryBlock[] | null {
  const raw = window.sessionStorage.getItem(`course-preview:${stageId}`);
  if (!raw) return null;
  try {
    const parsed = TheoryBlocksSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    // Corrupted sessionStorage entry — treat as "no draft".
    return null;
  }
}

export function PreviewLoader({ stageId, editorHref }: { stageId: string; editorHref: string }) {
  // sessionStorage.getItem is synchronous, but the read is deferred into a
  // microtask (rather than called directly in the effect body) so the setState
  // call isn't synchronous-within-effect — same pattern loadKatex().then(...)
  // uses elsewhere in this editor.
  const [blocks, setBlocks] = useState<TheoryBlock[] | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) setBlocks(readDraft(stageId));
    });
    return () => {
      cancelled = true;
    };
  }, [stageId]);

  if (blocks === undefined) return null;

  if (!blocks) {
    return (
      <div className="flex flex-col items-center text-center py-16 border border-dashed border-border rounded-2xl">
        <FileQuestion className="size-10 text-muted-foreground mb-3" />
        <p className="text-sm font-medium text-foreground">No draft found</p>
        <p className="text-sm text-muted-foreground mt-1">
          Open Preview from the{" "}
          <Link href={editorHref} className="cursor-pointer text-brand-text hover:underline">
            stage editor
          </Link>{" "}
          to see your unsaved changes here.
        </p>
      </div>
    );
  }

  return <TheorySectionPreview blocks={blocks} />;
}
