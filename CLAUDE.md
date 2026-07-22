@AGENTS.md

# Design fidelity rules

- `/figma-export` is the visual source of truth (Vite + React + Tailwind)
- We are porting it to Next.js, preserving visual output exactly
- Never change, simplify, or substitute Tailwind classes, spacing, colors, or DOM structure
- Only allowed changes: Next.js-specific (`next/link`, `next/image`, app router, `'use client'` directives)
- If a conflict between Figma code and Next.js forces a visual change, stop and ask

## Intentional deviations from /figma-export
- Body font: Geist via next/font (Figma export had no font loaded; 
  this is a deliberate choice, do not remove)
- AuthScreen (app/(auth)/AuthScreen.tsx): stats row ("47 Subjects / 10k+ 
  Learners / 500k+ Quizzes") and the Terms of Service / Privacy Policy 
  line removed at user request (2026-07-06); do not restore
- AuthScreen: "Check your email" confirmation view added (2026-07-08) for 
  the Supabase email-confirmation flow; not in the Figma export (which had 
  no auth logic). Composed entirely from classes already used elsewhere in 
  AuthScreen.tsx; do not remove
- AuthScreen: emerald notice box (2026-07-08) mirroring the error box 
  structure, for "email confirmed, please sign in" after clicking a 
  confirmation link on another device; do not remove
- AuthScreen: left decorative panel width changed (2026-07-08) from the 
  Figma fixed widths (w-[460px] xl:w-[520px]) to w-[40%] so the screen 
  splits roughly 40% panel / 60% form at user request; do not restore the 
  fixed widths
- AuthScreen: `redirectTo` prop added (2026-07-09) for the tutor invite-link 
  flow — after sign-in/sign-up the user lands on the `?next=` destination 
  (validated relative path) instead of always "/". Logic-only, no visual 
  change; do not remove
- SubjectGrid (app/components/SubjectGrid.tsx): full-width "Any difficulty" 
  pill added below the Easy/Medium/Hard row and preselected (2026-07-13), and 
  the "Choose a difficulty above to start" warning removed with it. The warning 
  was an absolutely-positioned popover that covered the pill row it pointed at; 
  a default makes the card startable on render, so the error state cannot occur. 
  Sends difficulty "mixed", same as Random Quiz. Built from classes already used 
  by the sibling pills; do not restore the warning
- NotificationBell (app/components/NotificationBell.tsx): the Topbar's 
  decorative Bell button (with its hardcoded unread dot) was replaced 
  (2026-07-17) by a working notification-center popover. No Figma source 
  exists for this surface; it is composed entirely from classes already used 
  in Topbar/cards (like the AuthScreen "Check your email" precedent). The 
  unread dot is unchanged but now rendered only when unread > 0; do not 
  restore the static button
- AuthScreen: inline "forgot" mode added (2026-07-18) behind the formerly 
  decorative "Forgot password?" button — email-only form, Google button / 
  divider / footer-toggle hidden in this mode, reset-specific copy in the 
  "Check your email" view; the left decorative panel was extracted as 
  exported `AuthLeftPanel` and `Field` exported for reuse (JSX/classes 
  unchanged); do not remove
- AuthScreen: Discord OAuth added (2026-07-21). The single full-width 
  "Continue with Google" button became a 2-column row of compact 
  Google / Discord buttons (same button classes, `grid grid-cols-2 gap-3`) 
  so the form height is unchanged; both get a disabled state while any 
  auth request is in flight. Do not restore the single Google button
- ResetPasswordScreen (app/(auth)/reset-password/): set-new-password page 
  added (2026-07-18) for the Supabase password-recovery flow. No Figma 
  source exists; composed entirely from AuthScreen.tsx classes 
  (AuthLeftPanel, Field, header/button/error-box); do not remove
- Groups (app/(main)/groups/**): the whole collaborative-group surface added 
  (2026-07-22) — group list, group detail (invite link, roster, quiz list), 
  peer review queue, per-question quiz builder, and the join-by-link page. 
  No Figma source exists for any of it; composed entirely from classes 
  already used in StudentsView.tsx (invite-link block, roster rows, 
  empty states), MyQuizzesView.tsx (quiz rows, confirm dialogs) and 
  my-quizzes/builder (question editor fields), same precedent as 
  NotificationBell. Do not remove
- ui/button.tsx + ui/dialog.tsx: `cursor-pointer` added (2026-07-22) to the 
  buttonVariants base class and to the dialog's close (X) control. Tailwind v4 
  removed the Preflight rule that gave `<button>` a pointer cursor, so every 
  shadcn button in the Figma export renders with the default arrow — a bug in 
  the port, not a design choice. This is the only change to those two files 
  and it alters no spacing, color or DOM structure. Note buttonVariants 
  already sets `disabled:pointer-events-none`, so no `disabled:cursor-not-allowed` 
  is needed there; hand-rolled buttons elsewhere do pair the two
- AppSidebar (app/components/AppSidebar.tsx): "Groups" added to navItems and 
  the Author section hidden (2026-07-22) behind the `SHOW_AUTHOR_NAV = false` 
  constant, because the tutor/author flow is dormant while Groups is the 
  active collaboration surface. The authorItems array, the /students and 
  /my-quizzes/builder routes, and all tutor RLS/data code are deliberately 
  left intact — flip the constant to restore the nav. Do not delete the 
  author code