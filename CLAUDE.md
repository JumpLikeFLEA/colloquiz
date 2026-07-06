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