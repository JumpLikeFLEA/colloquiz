import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Honour the `_name` convention already used in the codebase for
      // deliberately-unused params and bindings (Topbar's `_displayName`,
      // pickExemplars' `_subject`/`_difficulty`).
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  // OPS-006 / docs/handoff.md "Performance boundary": a visitor on the English
  // surface must not download Colloquiz's heavy dependencies. The byte budget
  // in scripts/budget.ts catches a regression after the fact; this catches the
  // import that would cause one, at review time, on the two trees the English
  // surface actually ships from (app/(english) is planned M2 and doesn't exist
  // yet, but the override still applies once it does).
  {
    files: ['app/(english)/**/*.{ts,tsx}', 'app/components/lesson-player/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'recharts', message: 'Recharts is Colloquiz-only (Progress charts) — not for the English surface.' },
            { name: 'katex', message: 'KaTeX is for Colloquiz quiz-question maths — not for the English surface.' },
            { name: 'framer-motion', message: 'Framer Motion is Colloquiz-only unless the English surface itself needs it.' },
            { name: '@supabase/ssr', message: 'The English landing and free lessons render without an authenticated session — no @supabase/ssr on this path.' },
          ],
        },
      ],
    },
  },
  // Supplying globalIgnores overrides eslint-config-next's own defaults,
  // so its defaults have to be re-listed here by hand.
  globalIgnores([
    // Defaults of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Vendored shadcn/Radix primitives — upstream code, re-vendored on each add.
    'app/components/ui/**',
    // Vendored from the Figma export. ImageWithFallback's whole job is manual
    // <img> error handling, so no-img-element does not apply to it.
    'app/components/figma/**',
    'exemplar-archive/**',
    'authored/**',
    'ds-bundle/**',
    '.ds-sync/**',
    '.design-sync/**',
  ]),
])

export default eslintConfig
