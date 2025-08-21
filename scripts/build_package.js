/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { build } from 'esbuild';
import { execSync } from 'child_process';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

async function main() {
  if (!process.cwd().includes('packages')) {
    console.error('This script must be invoked from a package directory');
    process.exit(1);
  }

  const packageJson = JSON.parse(readFileSync('package.json', 'utf-8'));
  const entryPoint = 'index.ts';

  if (!existsSync(entryPoint)) {
    console.log(
      `No ${entryPoint} found in ${packageJson.name}. Skipping esbuild.`,
    );
    return;
  }

  const external = [];

  const buildOptions = {
    entryPoints: [entryPoint],
    bundle: true,
    outfile: 'dist/index.js',
    platform: 'node',
    target: 'node20',
    format: 'esm',
    sourcemap: true,
    external,
  };

  if (packageJson.name === '@google/gemini-cli') {
    buildOptions.banner = {
      js: `
import { dirname } from 'path';
import { fileURLToPath as __internalFileURLToPath } from 'url';
import { createRequire as __internalCreateRequire } from 'module';

const require = __internalCreateRequire(import.meta.url);
const __dirname = dirname(__internalFileURLToPath(import.meta.url));
`,
    };
  } else if (packageJson.name === '@google/gemini-cli-core') {
    buildOptions.banner = {
      js: `
import { createRequire as __internalCreateRequireCore } from 'module';
const require = __internalCreateRequireCore(import.meta.url);
`,
    };
  }

  try {
    execSync('npx tsc', {
      stdio: 'inherit',
    });
    console.log(
      `✅ Successfully generated declaration for ${packageJson.name}`,
    );
  } catch (e) {
    console.error(
      `❌ Error generating declaration for ${packageJson.name}:`,
      e,
    );
    process.exit(1);
  }

  try {
    await build(buildOptions);
    console.log(`✅ Successfully bundled ${packageJson.name}`);
  } catch (e) {
    console.error(`❌ Error bundling ${packageJson.name}:`, e);
    process.exit(1);
  }

  // Still run the other parts of the script for consistency
  execSync('node ../../scripts/copy_files.js', { stdio: 'inherit' });
  writeFileSync(join(process.cwd(), 'dist', '.last_build'), '');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
