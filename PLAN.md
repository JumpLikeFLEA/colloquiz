# Noosphere — MVP Build Plan

> Historical planning document. The project has since been rebranded to **Colloquiz**.

## Stack
Next.js (App Router) · TypeScript · Tailwind v4 · shadcn/ui · lucide-react · framer-motion · Local JSON storage

---

## Steps

### Step 1 — Remove AI Generation ✅
- [x] Delete `app/generate/page.tsx`
- [x] Delete `app/api/generate/route.ts`
- [x] Delete `lib/claude.ts`
- [x] Delete `prompts/quiz-generator.md`
- [x] Remove `@anthropic-ai/sdk` from `package.json`
- [x] Remove "Generate with AI" link from `app/page.tsx`
- [x] Exclude `Figma design/` from TypeScript compilation in `tsconfig.json`

### Step 2 — Schema Migration + Figma Assets Import ✅
- [x] Add `subject: string`, `created_by?: string | null` to `Question` in `types/index.ts`
- [x] Add `created_by?: string | null` to `Quiz`
- [x] Add `user_id?: string | null` to `Result`
- [x] Add `Subject` interface and `SchemaVersion` type to `types/index.ts`
- [x] Add optional `subject` + `subtopics` fields to `QuizFilter`
- [x] Update `data/questions.json` — added `subject: "computer_science"` + `created_by: null` to all 15 questions
- [x] Create `data/subjects.json` — 14 subjects with id, name, icon, color, bg, tags, subtopics
- [x] Create `data/schema.json` — version 1 tracking file
- [x] Update `lib/questions.ts` — add `getSubjects()`, update `sampleQuestions()` to resolve tags from subject
- [x] Copy 48 shadcn/ui components from Figma design → `app/components/ui/`
- [x] Create `lib/utils.ts` — `cn()` helper (clsx + tailwind-merge)
- [x] Create `lib/use-mobile.ts` — `useIsMobile()` hook
- [x] Update all `./utils` imports in ui components → `@/lib/utils`
- [x] Update all `./use-mobile` imports in ui components → `@/lib/use-mobile`
- [x] Replace `app/globals.css` with full Figma theme tokens (colors, radius, sidebar vars, dark mode, typography)
- [x] Clean up empty stub directories: `app/generate/`, `app/api/generate/`, `prompts/`
- [x] Exclude `Figma design/` from tsconfig.json (already done in Step 1)

### Step 3 — Install shadcn/ui + dependencies ✅
- [x] Create `components.json` (manual — components already copied from Figma in Step 2)
- [x] Install all radix-ui primitives, class-variance-authority, clsx, tailwind-merge
- [x] Install lucide-react, framer-motion, next-themes, recharts, cmdk, vaul, input-otp, sonner, embla-carousel-react
- [x] Install react-day-picker, react-hook-form, react-resizable-panels
- [x] Add `@ts-nocheck` to calendar/chart/resizable (version-API mismatch; unused in MVP)
- [x] Figma color tokens already in global CSS (done in Step 2)

### Step 4 — Sidebar + Topbar Layout ✅
- [x] Replace `app/layout.tsx` with two-panel shell (`SidebarProvider` + `AppSidebar` + `Topbar` + `main`)
- [x] Create `app/components/AppSidebar.tsx` — shadcn Sidebar with logo, nav items, user XP card in footer
- [x] Create `app/components/Topbar.tsx` — hamburger toggle + route breadcrumb
- [x] Admin nav item gated by `localStorage.role === 'admin'` (read in `useEffect`)

### Step 5 — Home Page (Basic Quizzes) ✅
- [x] Rewrite `app/page.tsx` as Server Component — fetches subjects + questions, computes per-subject stats
- [x] Create `app/components/SubjectGrid.tsx` — Client Component with search bar, subject cards, Random Quiz button
- [x] Each card: lucide icon, subject name, question count, difficulty pills, Start Quiz button
- [x] Start Quiz → `POST /api/quiz` with subject id → navigate to `/quiz/[id]`
- [x] Random Quiz → `POST /api/quiz` with no filter → navigate to `/quiz/[id]`

### Step 6 — Advanced Quiz Page (Filter Wizard) ✅
- [x] Rewrite `app/build/page.tsx` as Server Component — fetches subjects + question counts + subtopics map
- [x] Step 1: Subject selection cards (grid) + "Any Subject" wildcard option
- [x] Step 2: Subtopic checkboxes with Select All / Clear; skipped automatically when subject has no subtopics
- [x] Step 3: Difficulty pills + question count pills (hidden in exam mode) + mode toggle
- [x] Progress indicator (step bubbles 1-2-3) with connector lines
- [x] Wire to `POST /api/quiz` — passes subject, tags (subtopics), difficulty, size, mode

### Step 7 — Quiz Session + Results ✅
- [x] Redesign `app/quiz/[id]/QuizSession.tsx` — progress bar, A/B/C/D option buttons
- [x] Ordinary mode: show correct/incorrect + explanation after each answer
- [x] Exam mode: no feedback until results screen
- [x] Redesign `app/results/[id]/page.tsx` — grade letter, accuracy %, XP earned, time taken
- [x] Score bar (green/red segments) + expandable question review
- [x] Fix async `params` for Next.js 16 in quiz and results pages
- [x] Add `mode` to `Quiz` type + store it via `/api/quiz`; add `time_taken` to `Result`
- [x] Trigger XP award + achievement check after results (done in Step 9 via XPAwarder)

### Step 8 — Dashboard ✅
- [x] Create `app/dashboard/page.tsx`
- [x] Profile card: initials avatar, editable display name, level + XP bar
- [x] 4 stat cards: Total Quizzes, Avg Score, Current Streak, Time Spent
- [x] Recent Quizzes table: subject, difficulty, score, questions, date
- [x] Data from localStorage (profile) + `GET /api/results` (history)
- [x] Add `GET /api/results` — returns results enriched with subject name + difficulty

### Step 9 — Achievements + XP System ✅
- [x] Create `lib/userProfile.ts` — localStorage CRUD, profile shape with user_id/xp/level/streak
- [x] Create `lib/achievements.ts` — `awardXP()`, `checkAchievements()`, XP formulas
- [x] Create `app/achievements/page.tsx` — level banner, stat cards, category filters, achievement grid
- [x] 15 achievements defined as static config
- [x] Create `app/components/XPAwarder.tsx` — Client Component; awards XP + checks achievements on results page load (idempotent via localStorage flag)
- [x] Wire `XPAwarder` into `app/results/[id]/page.tsx`

### Step 10 — Custom Quiz Builder (Admin) ✅
- [x] Create `app/admin/quiz-builder/page.tsx` — gated by `localStorage.role === 'admin'`
- [x] Quiz metadata panel (title, subject, mode, difficulty) + per-question collapsible editor panel
- [x] Question types: Multiple Choice (4 options) + True/False
- [x] Create `app/api/admin/quiz/route.ts` — writes to `questions.json` / `quizzes.json`
- [x] Set `created_by` from `localStorage.user_id` on save

---

## Files to Delete
| File | Reason |
|---|---|
| `app/generate/page.tsx` | AI generation removed from MVP |
| `app/api/generate/route.ts` | AI generation removed from MVP |
| `lib/claude.ts` | AI generation removed from MVP |
| `prompts/quiz-generator.md` | AI generation removed from MVP |

## Files to Modify
| File | Change |
|---|---|
| `types/index.ts` | Add `subject`, `created_by`, `user_id`, `SchemaVersion` |
| `data/questions.json` | Add `subject` + `created_by: null` to all questions |
| `app/layout.tsx` | Replace with sidebar shell |
| `app/page.tsx` | Subject card grid |
| `app/build/page.tsx` | 3-step wizard |
| `app/build/BuildForm.tsx` | Refactor into wizard steps |
| `app/quiz/[id]/QuizSession.tsx` | Figma-styled quiz UI |
| `app/results/[id]/page.tsx` | Grade letter + breakdown |
| `lib/questions.ts` | Add subject-aware filtering |

## New Files
| File | Purpose |
|---|---|
| `lib/userProfile.ts` | localStorage CRUD for user state |
| `lib/achievements.ts` | XP award logic + achievement unlock checks |
| `data/subjects.json` | Subject → tags mapping + icon/color config |
| `data/schema.json` | Schema version tracking |
| `app/components/AppSidebar.tsx` | Persistent sidebar navigation |
| `app/components/Topbar.tsx` | Top navigation bar |
| `app/dashboard/page.tsx` | Dashboard page |
| `app/achievements/page.tsx` | Achievements page |
| `app/admin/quiz-builder/page.tsx` | Admin quiz authoring |
| `app/api/admin/quiz/route.ts` | Write questions/quizzes to JSON |

---

## Verification Checklist
- [ ] `npm run dev` — no TypeScript errors, sidebar renders on all pages
- [ ] Home → subject card → quiz starts → answers flow → results screen shows grade letter + XP earned
- [ ] Ordinary mode shows per-question feedback; exam mode shows nothing until results
- [ ] Dashboard shows updated stats after quiz completion
- [ ] Achievements page: XP bar advances; first-subject badge unlocks on first quiz in a new topic
- [ ] `/admin/quiz-builder` inaccessible without admin role; accessible after setting `localStorage.role = 'admin'`
- [ ] New question saved via builder appears in the question pool on next quiz start
- [ ] All questions in `questions.json` have `subject` and `created_by` fields
