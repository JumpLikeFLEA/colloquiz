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
    // Gitignored but present on disk; ESLint 9 does not read .gitignore.
    // figma-export is a whole second React app (Vite + React 18 + MUI).
    'figma-export/**',
    'exemplar-archive/**',
    'authored/**',
    'ds-bundle/**',
    '.ds-sync/**',
    '.design-sync/**',
  ]),
])

export default eslintConfig
