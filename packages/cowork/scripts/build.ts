#!/usr/bin/env tsx
/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * Build pipeline for Gemini Cowork — Phase 4.
 *
 * Produces:
 *   dist/           — ESM library (importable as @google/gemini-cowork)
 *   dist/index.js   — CLI entry point (#!/usr/bin/env node shebang added)
 *   bin/            — Self-contained binaries via `pkg` or `caxa`
 *     cowork-linux
 *     cowork-macos
 *     cowork-win.exe
 *
 * Usage:
 *   npx tsx scripts/build.ts               # library + CLI only
 *   npx tsx scripts/build.ts --binaries    # also compile standalone executables
 *   npx tsx scripts/build.ts --ui          # also build the Vite dashboard
 *
 * tsup configuration
 * ──────────────────
 * We use tsup (esbuild-based) rather than tsc directly because:
 *   • It handles ESM + CJS dual output in one pass.
 *   • It tree-shakes unused code.
 *   • It supports banner injection (shebang for the CLI).
 *   • It works well with the NodeNext module resolver.
 */

import { execSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const dist = join(root, 'dist');
const ui = join(root, 'ui');
const bin = join(root, 'bin');

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const buildBinaries = args.includes('--binaries');
const buildUi = args.includes('--ui');
const watch = args.includes('--watch');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function run(cmd: string, cwd = root): void {
  console.log(`\n$ ${cmd}`);
  const result = spawnSync(cmd, {
    shell: true,
    cwd,
    stdio: 'inherit',
    env: { ...process.env },
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function log(msg: string): void {
  console.log(`\x1b[36m[build]\x1b[0m ${msg}`);
}

function require(bin: string, pkg: string): void {
  try {
    execSync(`which ${bin} 2>/dev/null || npx --yes ${bin} --version`, { stdio: 'ignore' });
  } catch {
    console.error(`\x1b[31m[build]\x1b[0m "${bin}" not found. Install it: npm i -D ${pkg}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Step 1: TypeScript → ESM library via tsup
// ---------------------------------------------------------------------------

log('Compiling TypeScript with tsup…');
require('tsup', 'tsup');

const tsupConfig = [
  '--entry src/index.ts',
  '--format esm',
  '--dts',
  '--clean',
  '--target node20',
  '--platform node',
  // Inject shebang so dist/index.js can be run directly as `./dist/index.js run …`.
  '--banner.js "#!/usr/bin/env node"',
  '--external @google/gemini-cli-core',
  '--external puppeteer',
  watch ? '--watch' : '',
].filter(Boolean).join(' ');

run(`npx tsup ${tsupConfig}`);

log(`Library output: ${dist}`);

// ---------------------------------------------------------------------------
// Step 2 (optional): Build standalone binaries with pkg / caxa
// ---------------------------------------------------------------------------

if (buildBinaries) {
  log('Building standalone cross-platform executables…');
  mkdirSync(bin, { recursive: true });

  // Prefer `pkg` (Vercel) if installed, else fall back to `caxa` (easier ESM support).
  const hasPkg = existsSync(join(root, 'node_modules', '.bin', 'pkg'));

  if (hasPkg) {
    // pkg configuration — targets Node 18 LTS across all platforms.
    const targets = [
      'node18-linux-x64',
      'node18-macos-x64',
      'node18-win-x64',
    ];

    for (const target of targets) {
      const suffix = target.includes('win') ? '.exe' : target.includes('linux') ? '-linux' : '-macos';
      const output = join(bin, `cowork${suffix}`);
      run(`npx pkg dist/index.js --target ${target} --output ${output} --compress GZip`);
      log(`Binary: ${output}`);
    }
  } else {
    // caxa supports ESM natively — bundles Node runtime + source.
    require('caxa', 'caxa');

    const platform = process.platform;
    const arch = process.arch;
    const name = `cowork-${platform}-${arch}`;
    const output = join(bin, name + (platform === 'win32' ? '.exe' : ''));

    run(
      `npx caxa --input ${root} --output ${output} -- ` +
        `"{{caxa}}/node_modules/.bin/node" "{{caxa}}/dist/index.js" "{{caxa}}"`,
    );
    log(`Binary: ${output}`);
    log('Note: caxa builds for the current platform only. Use CI for all-platform builds.');
  }
}

// ---------------------------------------------------------------------------
// Step 3 (optional): Build the Vite dashboard UI
// ---------------------------------------------------------------------------

if (buildUi) {
  if (!existsSync(ui)) {
    console.error(
      '[build] ui/ directory not found. Run `npx tsx scripts/build.ts` first to scaffold it.',
    );
    process.exit(1);
  }

  log('Building Vite dashboard UI…');

  // Install UI deps if node_modules is missing.
  if (!existsSync(join(ui, 'node_modules'))) {
    log('Installing UI dependencies…');
    run('npm install', ui);
  }

  run('npm run build', ui);
  log(`Dashboard built → ${join(ui, 'dist')}`);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

log('Build complete!');
console.log('\n  Outputs:');
console.log(`    Library  : ${dist}/index.js + index.d.ts`);
if (buildBinaries) console.log(`    Binaries : ${bin}/`);
if (buildUi) console.log(`    Dashboard: ${ui}/dist/`);
console.log('');
