/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const bundleJs = path.join(rootDir, 'bundle', 'gemini.js');
const outputDir = path.join(rootDir, 'bundle', 'binaries');

// Binary targets configuration
const targets = [
  { name: 'gemini-cli-darwin-x64', target: 'bun-darwin-x64' },
  { name: 'gemini-cli-darwin-arm64', target: 'bun-darwin-arm64' },
  { name: 'gemini-cli-linux-x64', target: 'bun-linux-x64' },
  { name: 'gemini-cli-linux-arm64', target: 'bun-linux-arm64' },
  { name: 'gemini-cli-windows-x64.exe', target: 'bun-windows-x64' },
];

// Check if bundle/gemini.js exists
if (!fs.existsSync(bundleJs)) {
  console.error(
    'Error: bundle/gemini.js not found. Please run "npm run bundle" first.',
  );
  process.exit(1);
}

// Create output directory
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
  console.log(`Created directory: ${outputDir}`);
}

console.log('Building native binaries from bundle/gemini.js...\n');

let successCount = 0;
let failedTargets = [];

for (const { name, target } of targets) {
  const outputPath = path.join(outputDir, name);
  console.log(`Building ${name}...`);

  try {
    execFileSync(
      'bun',
      [
        'build',
        '--compile',
        `--target=${target}`,
        bundleJs,
        '--outfile',
        outputPath,
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );

    if (fs.existsSync(outputPath)) {
      const stats = fs.statSync(outputPath);
      const sizeMB = (stats.size / (1024 * 1024)).toFixed(1);
      console.log(`  ✓ Built ${name} (${sizeMB} MB)`);
      successCount++;
    } else {
      throw new Error('Binary file was not created');
    }
  } catch (error) {
    console.error(`  ✗ Failed to build ${name}`);
    const errorDetails =
      error.stderr || error.stdout || error.message || 'Unknown error';
    const errorString = errorDetails.toString().trim();
    if (errorString) {
      console.error(
        errorString
          .split('\n')
          .map((line) => `    ${line}`)
          .join('\n'),
      );
    }
    failedTargets.push(name);
  }
}

console.log('\n' + '='.repeat(50));
console.log(
  `Build complete: ${successCount}/${targets.length} binaries built successfully`,
);

if (failedTargets.length > 0) {
  console.log(`Failed targets: ${failedTargets.join(', ')}`);
  console.log(
    '\nNote: Cross-compilation may require Bun 1.1.0+ and might not work for all targets from all host platforms.',
  );
  console.log(
    'In CI, all targets should build successfully on the appropriate runner.',
  );
  process.exit(1);
}

console.log(`\nBinaries saved to: ${outputDir}`);
