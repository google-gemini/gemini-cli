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

// 1. ADDED: Environmental control for updating snapshots
const isUpdate = process.env.UPDATE_SNAPSHOTS === '1';

describe('SettingsDialog Visual Regression', () => {
  const standardScript = path.resolve(__dirname, 'render-settings-dialog.tsx');
  const narrowScript = path.resolve(
    __dirname,
    'render-settings-dialog-narrow.tsx',
  );

  // 2. ADDED: Directory separation logic
  const baselineDir = path.resolve(__dirname, '__baselines__');
  const outputDir = path.resolve(__dirname, 'output');

  it('renders standard layout (80x24)', async () => {
    const fileName = 'settings-standard.png';
    await createSnapshotFromPty({
      command: 'npx',
      args: ['tsx', standardScript],
      // Use baselineDir only if updating; otherwise use outputDir
      outputPath: path.join(isUpdate ? baselineDir : outputDir, fileName),
      ...getCIOptimizedConfig({
        baseFont: 'bundled',
        emojiFontKey: 'noto', // 3. CHANGED: 'system' -> 'noto'
      }),
      cols: 80,
      rows: 24,
      timeout: 30000,
    });
  }, 40000);

  it('renders narrow layout (60x20)', async () => {
    const fileName = 'settings-narrow.png';
    await createSnapshotFromPty({
      command: 'npx',
      args: ['tsx', narrowScript],
      outputPath: path.join(isUpdate ? baselineDir : outputDir, fileName),
      ...getCIOptimizedConfig({
        baseFont: 'bundled',
        emojiFontKey: 'noto', // 3. CHANGED: 'system' -> 'noto'
      }),
      cols: 60,
      rows: 20,
      timeout: 30000,
    });
  }, 40000);
});
