#!/usr/bin/env node
// Vendor the app's shadcn ui/ primitives into a self-contained staging package
// under .ds-sync/pkg so the design-sync converter can (a) read REAL .d.ts prop
// contracts (emitted here by tsc) instead of the synth-mode catch-all, and
// (b) resolve a clean package root that doesn't collide with the app repo's own
// root-level types/ and lib/ dirs. The copies are byte-identical to the live
// sources except the two `@/lib/*` imports are rewritten to package-relative
// paths — re-run this each sync so the staging package tracks the sources.
//
// Output: .ds-sync/pkg/{package.json, src/*.tsx, src/lib/*.ts, src/index.ts,
//         types/*.d.ts}. The build driver points node_modules/colloquiz at it
//         via a junction and runs the converter with srcDir=src.
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const uiDir = join(repoRoot, 'app/components/ui');
// The converter resolves the package at node_modules/<pkg>. We materialize the
// staging package there directly (a real dir, gitignored under /node_modules) so
// there's no junction to go dangling when this script rm's + recreates it.
const pkgDir = join(repoRoot, 'node_modules/colloquiz');
const srcDir = join(pkgDir, 'src');
const libDir = join(srcDir, 'lib');

rmSync(pkgDir, { recursive: true, force: true });
mkdirSync(libDir, { recursive: true });

const rewrite = (code) =>
  code
    .replaceAll('@/lib/utils', './lib/utils')
    .replaceAll('@/lib/use-mobile', './lib/use-mobile');

// Copy the two shared lib helpers the primitives import.
for (const f of ['utils.ts', 'use-mobile.ts']) {
  writeFileSync(join(libDir, f), rewrite(readFileSync(join(repoRoot, 'lib', f), 'utf8')));
}

// Copy each ui primitive, rewriting the @/lib imports; build the barrel.
const files = readdirSync(uiDir).filter((f) => f.endsWith('.tsx'));
const barrel = [];
for (const f of files) {
  writeFileSync(join(srcDir, f), rewrite(readFileSync(join(uiDir, f), 'utf8')));
  barrel.push(`export * from './${f.replace(/\.tsx$/, '')}';`);
}
writeFileSync(join(srcDir, 'index.ts'), barrel.join('\n') + '\n');

writeFileSync(
  join(pkgDir, 'package.json'),
  JSON.stringify({ name: 'colloquiz', version: '0.1.0', types: 'types/index.d.ts' }, null, 2) + '\n',
);

const tsconfig = {
  compilerOptions: {
    target: 'ES2020',
    module: 'ESNext',
    moduleResolution: 'Bundler',
    jsx: 'react-jsx',
    lib: ['DOM', 'DOM.Iterable', 'ESNext'],
    declaration: true,
    emitDeclarationOnly: true,
    outDir: 'types',
    rootDir: 'src',
    skipLibCheck: true,
    strict: false,
    noEmitOnError: false,
    esModuleInterop: true,
    resolveJsonModule: true,
  },
  include: ['src/**/*'],
};
writeFileSync(join(pkgDir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2) + '\n');

// tsc resolves npm type deps by walking up to the repo node_modules. Declaration
// emit surfaces "cannot be named" warnings for some radix-inferred types; those
// props degrade to `any` in the .d.ts but the rest stay real — noEmitOnError:false
// keeps the emit. So we don't fail the helper on tsc's non-zero exit.
const tscJs = join(repoRoot, 'node_modules/typescript/bin/tsc');
try {
  execFileSync(process.execPath, [tscJs, '-p', join(pkgDir, 'tsconfig.json')], { cwd: pkgDir, stdio: 'pipe' });
  console.error('tsc: declarations emitted (clean)');
} catch (e) {
  const out = (e.stdout?.toString() || '') + (e.stderr?.toString() || '');
  const errs = (out.match(/error TS/g) || []).length;
  console.error(`tsc: declarations emitted with ${errs} type diagnostic(s) (degraded props → any; non-fatal)`);
}
const emitted = readdirSync(join(pkgDir, 'types')).filter((f) => f.endsWith('.d.ts')).length;
console.error(`types/: ${emitted} .d.ts files`);

// ── Compiled Tailwind stylesheet ──────────────────────────────────────────
// shadcn components style via Tailwind utility classes, so previews need the
// utilities expanded (plus the :root/.dark token layer). Scan app/ (real
// component usage) AND .design-sync/previews/ (authored preview compositions)
// so preview-only class combos are covered. Output lands inside the staging
// package because cfg.cssEntry is security-bounded to PKG_DIR.
const require = createRequire(resolve(repoRoot, 'package.json'));
const postcss = require('postcss');
const tailwind = require('@tailwindcss/postcss');
const globals = readFileSync(join(repoRoot, 'app/globals.css'), 'utf8');
const sources = ['@source "../app";', '@source "../lib";', '@source "./previews";'].join('\n');
const cssInput = globals.replace(/(@import\s+"tw-animate-css";\s*\n)/, `$1${sources}\n`);
const cssInputPath = join(here, 'tw-input.css'); // stable dir so @source paths resolve
writeFileSync(cssInputPath, cssInput);
const cssResult = await postcss([tailwind()]).process(cssInput, { from: cssInputPath });
writeFileSync(join(pkgDir, 'compiled.css'), cssResult.css);
console.error(`compiled.css: ${(cssResult.css.length / 1024).toFixed(0)} KB → staging pkg`);
