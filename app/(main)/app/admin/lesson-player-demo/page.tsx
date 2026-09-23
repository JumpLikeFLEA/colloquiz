import { notFound } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/queries";
import { LessonPlayerDemoClient } from "./LessonPlayerDemoClient";

/**
 * PLAY-001 — dev-only harness to view the lesson player shell in a browser.
 * This repo's test runner has no jsdom/React-rendering setup (see
 * docs/decisions/0024, Decision 4), so this page — not a component test — is
 * how the theory-block renderers were verified. Not part of this card's
 * deliverable and not reused, same precedent as
 * app/(main)/app/admin/item-playground/page.tsx (ITEM-010).
 *
 * Gated the same way: unreachable in a production build (`notFound()`) AND
 * admin-role-only in dev.
 *
 * `attemptId` (docs/decisions/0029 Decision 1) is generated here, per
 * request, with `crypto.randomUUID()` — not memoized, not `useId()`. This
 * page already reads `cookies()` (via `createClient()`/`getUser()` below), a
 * Request-time API that forces the route into dynamic (per-request)
 * rendering under this repo's default `dynamic: 'auto'` route segment config
 * — the same mechanism `item-playground/page.tsx` already relies on with no
 * explicit `dynamic` export, so no new caching behavior is introduced here.
 */

const DEMO_DOCUMENT = [
  { id: "h1", kind: "theory", type: "heading", level: 1, text: [{ text: "Past simple: regular verbs" }] },
  {
    id: "p1",
    kind: "theory",
    type: "prose",
    text: [
      { text: "Мы используем " },
      { text: "past simple", marks: ["english", "mark_a"] },
      { text: " для завершённых действий в прошлом." },
    ],
  },
  {
    id: "ex1",
    kind: "theory",
    type: "example",
    label: "Example",
    text: [{ text: "I " }, { text: "watched", marks: ["emphasis", "mark_b"] }, { text: " a film yesterday." }],
  },
  {
    id: "c1",
    kind: "theory",
    type: "callout",
    variant: "tip",
    text: [{ text: "Regular verbs add " }, { text: "-ed", marks: ["mark_a"] }, { text: " in the past simple." }],
  },
  {
    id: "l1",
    kind: "theory",
    type: "list",
    ordered: false,
    items: [[{ text: "watch → watched" }], [{ text: "play → played" }], [{ text: "study → studied" }]],
  },
  {
    id: "v1",
    kind: "theory",
    type: "video",
    youtubeId: "dQw4w9WgXcQ",
    caption: [{ text: "Optional: watch a short explainer." }],
  },
  {
    id: "sc1",
    kind: "theory",
    type: "self_check",
    prompt: [{ text: "Write one sentence about yesterday using the past simple." }],
    response: "short",
    modelAnswer: [{ text: "I cooked dinner yesterday." }],
    checklist: ["Used past simple", "Used a time marker"],
  },
  {
    id: "t1",
    kind: "theory",
    type: "table",
    header: [[{ text: "Base form" }], [{ text: "Past simple" }]],
    rows: [
      [[{ text: "watch" }], [{ text: "watched" }]],
      [[{ text: "play" }], [{ text: "played" }]],
    ],
    caption: [{ text: "Common regular verbs." }],
  },
  {
    id: "q1",
    kind: "practice",
    type: "selection",
    payload: {
      prompt: "Choose the correct past simple form: 'She ___ to school yesterday.'",
      multi: false,
      options: [
        { id: "a", text: "walk" },
        { id: "b", text: "walked" },
      ],
      correctOptionIds: ["b"],
      explanationRef: "r1",
      explanations: { r1: "Regular verbs add -ed in the past simple: walk → walked." },
    },
  },
  {
    id: "q2",
    kind: "practice",
    type: "selection",
    payload: {
      prompt: "Which of these are irregular past simple forms? (select all that apply)",
      multi: true,
      options: [
        { id: "a", text: "went" },
        { id: "b", text: "walked" },
        { id: "c", text: "ate" },
        { id: "d", text: "played" },
      ],
      correctOptionIds: ["a", "c"],
      explanationRef: "r2",
      explanations: { r2: "go -> went and eat -> ate are irregular; walked/played just add -ed." },
    },
  },
  {
    id: "q3",
    kind: "practice",
    type: "selection_grid",
    payload: {
      prompt: "True or false?",
      rows: [
        {
          id: "row1",
          statement: "'She walked to school' is past simple.",
          correct: true,
          explanationRef: "g1",
        },
        {
          id: "row2",
          statement: "'She walk to school' is correct past simple.",
          correct: false,
          explanationRef: "g2",
        },
        {
          id: "row3",
          statement: "'They studied every day' is past simple.",
          correct: true,
          explanationRef: "g3",
        },
      ],
      explanations: {
        g1: "Correct — regular past simple, -ed added.",
        g2: "Incorrect — the verb needs -ed: 'She walked to school.'",
        g3: "Correct — study -> studied (y -> ied).",
      },
    },
  },
  {
    id: "q4",
    kind: "practice",
    type: "ordering",
    payload: {
      prompt: "Put the words in the correct order.",
      elements: [
        { id: "w1", text: "She", explanationRef: "o1" },
        { id: "w2", text: "walked", explanationRef: "o1" },
        { id: "w3", text: "to school", explanationRef: "o1" },
        { id: "w4", text: "yesterday", explanationRef: "o1" },
      ],
      explanations: { o1: "Subject, verb, place, time — the usual English word order." },
    },
  },
  {
    id: "q5",
    kind: "practice",
    type: "matching",
    payload: {
      prompt: "Match the verb to its past simple form.",
      left: [
        { id: "m1", content: { kind: "text", text: "walk" } },
        { id: "m2", content: { kind: "text", text: "study" } },
        { id: "m3", content: { kind: "text", text: "go" } },
      ],
      right: [
        { id: "n1", content: { kind: "text", text: "walked" } },
        { id: "n2", content: { kind: "text", text: "studied" } },
        { id: "n3", content: { kind: "text", text: "went" } },
        { id: "n4", content: { kind: "text", text: "goed" } },
      ],
      pairs: [
        { id: "pm1", left: "m1", right: "n1", explanationRef: "m1r" },
        { id: "pm2", left: "m2", right: "n2", explanationRef: "m2r" },
        { id: "pm3", left: "m3", right: "n3", explanationRef: "m3r" },
      ],
      explanations: {
        m1r: "walk is regular: walk -> walked.",
        m2r: "study is regular with a spelling change: study -> studied.",
        m3r: "go is irregular: go -> went, not 'goed'.",
      },
    },
  },
  {
    id: "q6",
    kind: "practice",
    type: "slots",
    payload: {
      prompt: "Yesterday I ___ to the shop and ___ some bread.",
      input: "typed",
      gaps: [
        { id: "s1", acceptedAnswers: ["went"], explanationRef: "s1r" },
        { id: "s2", acceptedAnswers: ["bought"], explanationRef: "s2r" },
      ],
      explanations: {
        s1r: "go is irregular: go -> went.",
        s2r: "buy is irregular: buy -> bought.",
      },
    },
  },
  {
    id: "q7",
    kind: "practice",
    type: "slots",
    payload: {
      prompt: "She ___ TV and then ___ to bed.",
      input: "drag",
      gaps: [
        { id: "d1", acceptedAnswers: ["watched"], explanationRef: "d1r" },
        { id: "d2", acceptedAnswers: ["went"], explanationRef: "d2r" },
      ],
      explanations: {
        d1r: "watch is regular: watch -> watched.",
        d2r: "go is irregular: go -> went.",
      },
    },
  },
  {
    // 0040 — image content on the matching right side (bank), added to
    // check MatchingRenderer's bank sizing against real image chips (0039
    // Decision 5 flagged this as unverified: no image fixture existed yet).
    // Images are static files under public/images/demo/, not Supabase
    // Storage — MatchingContentSchema's `src` is an arbitrary authored
    // string (lib/items/matching.ts), so a root-relative public/ path is a
    // legal value with no Storage/auth dependency, same as any other
    // same-origin next/image src.
    id: "q8",
    kind: "practice",
    type: "matching",
    payload: {
      prompt: "Match the word to its picture.",
      left: [
        { id: "w1", content: { kind: "text", text: "apple" } },
        { id: "w2", content: { kind: "text", text: "book" } },
        { id: "w3", content: { kind: "text", text: "cup" } },
      ],
      right: [
        { id: "img1", content: { kind: "image", src: "/images/demo/apple.png", alt: "An apple" } },
        { id: "img2", content: { kind: "image", src: "/images/demo/book.png", alt: "A book" } },
        { id: "img3", content: { kind: "image", src: "/images/demo/cup.png", alt: "A cup" } },
        { id: "img4d", content: { kind: "text", text: "pen" } }, // text distractor, no pair
      ],
      pairs: [
        { id: "pw1", left: "w1", right: "img1", explanationRef: "w1r" },
        { id: "pw2", left: "w2", right: "img2", explanationRef: "w2r" },
        { id: "pw3", left: "w3", right: "img3", explanationRef: "w3r" },
      ],
      explanations: {
        w1r: "apple -> the apple picture.",
        w2r: "book -> the book picture.",
        w3r: "cup -> the cup picture.",
      },
    },
  },
];

export default async function LessonPlayerDemoPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const supabase = await createClient();
  const user = await getUser();
  if (!user) return null;

  const attemptId = crypto.randomUUID();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <ShieldAlert className="size-12 text-muted-foreground mb-4" />
        <h1 className="text-xl font-semibold">Forbidden</h1>
        <p className="text-muted-foreground mt-2">
          You need admin privileges to access this page.
        </p>
      </div>
    );
  }

  return (
    <div className="py-8">
      <div className="mx-auto max-w-xl px-4 mb-4">
        <h1 className="text-xl font-semibold">Lesson player demo</h1>
        <p className="text-muted-foreground mt-1">
          Dev-only. A fixture lesson document rendered through the real
          player shell (app/components/lesson-player). Not the M2 route.
        </p>
      </div>
      <LessonPlayerDemoClient document={DEMO_DOCUMENT} attemptId={attemptId} />
    </div>
  );
}
