/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it } from 'vitest';
import {
  createSnapshotFromPty,
  getCIOptimizedConfig,
} from 'ink-visual-testing';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

// Robust path resolution for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isUpdate = process.env.UPDATE_SNAPSHOTS === '1';

// Hoteye's exact directory requirements
const BASELINE_DIR = path.resolve(__dirname, '__baselines__');
const OUTPUT_DIR = path.resolve(__dirname, '__output__');
const DIFF_DIR = path.resolve(__dirname, '__diff__');

// Ensure directories exist
[BASELINE_DIR, OUTPUT_DIR, DIFF_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

async function runVisualTest(
  testName: string,
  script: string,
  cols: number,
  rows: number,
) {
  const fileName = `${testName}.png`;
  const baselinePath = path.join(BASELINE_DIR, fileName);
  const outputPath = path.join(OUTPUT_DIR, fileName);
  const diffPath = path.join(DIFF_DIR, fileName);

  // 1. Render current UI (Tool writes directly to outputPath)
  await createSnapshotFromPty({
    command: 'npx',
    args: ['tsx', script],
    outputPath: outputPath,
    ...getCIOptimizedConfig({ baseFont: 'bundled', emojiFontKey: 'noto' }),
    cols,
    rows,
    timeout: 30000,
  });

  // 2. Safety Check: Verify file was created before reading
  if (!fs.existsSync(outputPath)) {
    throw new Error(
      `Failed to capture snapshot: ${outputPath} was not created.`,
    );
  }
  const buffer = fs.readFileSync(outputPath);

  // 3. Update Baseline logic (Only updates if flag is set or baseline is missing)
  if (isUpdate) {
    fs.writeFileSync(baselinePath, buffer);
    return;
  }

  // 4. Comparison Logic (Compares current run against baseline)
  const expectedImg = PNG.sync.read(fs.readFileSync(baselinePath));
  const actualImg = PNG.sync.read(buffer);
  const { width, height } = expectedImg;
  const diff = new PNG({ width, height });

  const numDiffPixels = pixelmatch(
    expectedImg.data,
    actualImg.data,
    diff.data,
    width,
    height,
    { threshold: 0.1 },
  );

  // 5. Fail and generate diff image if they don't match
  if (numDiffPixels > 0) {
    fs.writeFileSync(diffPath, PNG.sync.write(diff));
    throw new Error(
      `Visual Regression Failed for "${testName}": ${numDiffPixels} pixels differ.\n` +
        `Check diff: ${diffPath}\n` +
        `Run with UPDATE_SNAPSHOTS=1 to accept changes.`,
    );
  }
}

describe('SettingsDialog Visual Regression', () => {
  const standardScript = path.resolve(__dirname, 'render-settings-dialog.tsx');
  const narrowScript = path.resolve(
    __dirname,
    'render-settings-dialog-narrow.tsx',
  );

  it('renders standard layout (80x24)', async () => {
    await runVisualTest('settings-standard', standardScript, 80, 24);
  }, 45000);

  it('renders narrow layout (60x20)', async () => {
    await runVisualTest('settings-narrow', narrowScript, 60, 20);
  }, 45000);
});
