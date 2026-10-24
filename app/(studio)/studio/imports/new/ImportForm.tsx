"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { WriteArea } from "@/app/(studio)/studio/StudioWriteLock";
import { capMessage, type ImportCap } from "@/lib/courseImport/caps";
import { COURSE_IMPORT_ACCEPT, COURSE_IMPORT_LIMITS_TEXT, IMPORT_BUCKET, checkUpload } from "@/lib/courseImport/formats";
import { CEFR_LEVELS, type CefrLevel } from "@/lib/courseLevels";
import { slugifyLessonTitle } from "@/lib/lessonSlug";
import { createClient } from "@/lib/supabase/client";

// The upload form (CNT-019, docs/decisions/0204). The file goes straight to the private bucket
// with a signed token (a request body is capped at 4.5 MB on Vercel, 0203 Decision 5), then the
// import is started with what the author typed. Title and slug follow the New course dialog:
// the slug follows the title until the author types in it, and emptying it hands it back.

const SLUG_ERROR_CODES = new Set(["slug_taken", "invalid_slug"]);

const INPUT = "px-3 py-2 rounded-lg border bg-background text-sm text-foreground outline-none w-full min-w-0";

function slugFromTitle(title: string): string {
  return title.trim() === "" ? "" : slugifyLessonTitle(title);
}

function formatCapTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function ImportForm() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [level, setLevel] = useState<CefrLevel>("A2");
  const [busy, setBusy] = useState<"uploading" | "starting" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function pick(f: File | null) {
    setError(null);
    if (!f) {
      setFile(null);
      setFileError(null);
      return;
    }
    const check = checkUpload(f.name, f.size);
    if (!check.ok) {
      setFile(null);
      setFileError(
        check.error === "unsupported_format"
          ? "Upload a PDF, DOCX, Markdown or plain text file."
          : check.error === "too_large"
            ? "The file is larger than 32 MB."
            : "The file is empty.",
      );
      if (fileInput.current) fileInput.current.value = "";
      return;
    }
    setFileError(null);
    setFile(f);
  }

  async function start() {
    if (!file || !title.trim() || !slug.trim()) return;
    setError(null);
    setSlugError(null);
    setBusy("uploading");
    try {
      const urlRes = await fetch("/api/studio/imports/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, size: file.size }),
      });
      const urlData = await urlRes.json().catch(() => ({}));
      if (!urlRes.ok || !urlData.ok) {
        setError(urlData.error ?? "Could not start the upload.");
        return;
      }

      const { error: uploadError } = await createClient()
        .storage.from(IMPORT_BUCKET)
        .uploadToSignedUrl(urlData.objectName, urlData.token, file, { contentType: urlData.contentType });
      if (uploadError) {
        setError("The upload failed. Check your connection and try again.");
        return;
      }

      setBusy("starting");
      const res = await fetch("/api/studio/imports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objectName: urlData.objectName, format: urlData.format, title, slug, level }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        if (data.error === "import_cap" && data.cap) {
          setError(capMessage(data.cap as ImportCap, formatCapTime));
        } else if (SLUG_ERROR_CODES.has(data.code)) {
          setSlugError(data.error ?? "That slug can't be used.");
        } else {
          setError(data.error ?? "Could not start the import.");
        }
        return;
      }
      router.push(`/studio/imports/${data.importId}`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  const ready = file !== null && title.trim().length > 0 && slug.trim().length > 0 && busy === null;

  return (
    <WriteArea>
      <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="import-file" className="text-sm font-medium text-foreground">
            File
          </label>
          <p id="import-file-limits" className="text-xs text-muted-foreground">
            {COURSE_IMPORT_LIMITS_TEXT} Images in a DOCX are left out.
          </p>
          <input
            ref={fileInput}
            id="import-file"
            type="file"
            accept={COURSE_IMPORT_ACCEPT}
            aria-describedby="import-file-limits"
            aria-invalid={fileError ? true : undefined}
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
            className={`${INPUT} ${fileError ? "border-destructive-border" : "border-border"} cursor-pointer text-muted-foreground file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1 file:text-sm file:font-medium file:text-foreground`}
          />
          {fileError && <p className="text-xs text-destructive-text">{fileError}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="import-title" className="text-sm font-medium text-foreground">
            Title
          </label>
          <input
            id="import-title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (!slugEdited) {
                setSlug(slugFromTitle(e.target.value));
                setSlugError(null);
              }
            }}
            maxLength={120}
            className={`${INPUT} border-border`}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="import-slug" className="text-sm font-medium text-foreground">
            Slug
          </label>
          <input
            id="import-slug"
            value={slug}
            onChange={(e) => {
              const next = e.target.value.toLowerCase();
              setSlugEdited(next !== "");
              setSlug(next === "" ? slugFromTitle(title) : next);
              setSlugError(null);
            }}
            placeholder="slug-like-this"
            aria-invalid={slugError ? true : undefined}
            aria-describedby={slugError ? "import-slug-error" : "import-slug-hint"}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            maxLength={80}
            className={`${INPUT} font-mono ${slugError ? "border-destructive-border" : "border-border"}`}
          />
          {slugError ? (
            <p id="import-slug-error" className="text-xs text-destructive-text">
              {slugError}
            </p>
          ) : (
            <p id="import-slug-hint" className="text-xs text-muted-foreground">
              The course&rsquo;s URL segment. It can&rsquo;t be changed later.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label id="import-level-label" className="text-sm font-medium text-foreground">
            Level
          </label>
          <Select value={level} onValueChange={(v) => setLevel(v as CefrLevel)}>
            <SelectTrigger className="w-full" aria-labelledby="import-level-label">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CEFR_LEVELS.map((l) => (
                <SelectItem key={l} value={l}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <p className="text-xs text-muted-foreground rounded-lg bg-muted px-3 py-2">
          The file is sent to Anthropic to draft the course. Nothing is published: the result is a draft you review first.
        </p>

        {error && (
          <div role="alert" className="px-3 py-2 rounded-lg bg-destructive-subtle border border-destructive-border text-sm text-destructive-text break-words">
            {error}
          </div>
        )}

        <div className="flex justify-end">
          <button
            onClick={start}
            disabled={!ready}
            className="cursor-pointer disabled:cursor-not-allowed inline-flex min-h-9 items-center gap-2 px-3 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-hover disabled:opacity-50 transition-colors"
          >
            {busy && <Loader2 className="size-4 motion-safe:animate-spin" />}
            {busy === "uploading" ? "Uploading…" : busy === "starting" ? "Starting…" : "Start import"}
          </button>
        </div>
      </div>
    </WriteArea>
  );
}
