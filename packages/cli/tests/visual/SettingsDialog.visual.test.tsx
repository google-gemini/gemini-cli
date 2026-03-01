import { describe, it } from 'vitest';
import { createSnapshotFromPty, getCIOptimizedConfig } from 'ink-visual-testing';
import path from 'node:path';

describe('SettingsDialog Visual Regression', () => {
  const standardScript = path.resolve(__dirname, 'render-settings-dialog.tsx');
  const narrowScript = path.resolve(__dirname, 'render-settings-dialog-narrow.tsx');

  it('renders standard layout (80x24)', async () => {
    await createSnapshotFromPty({
      command: 'npx',
      args: ['tsx', standardScript],
      outputPath: 'tests/__baselines__/settings-standard.png',
      ...getCIOptimizedConfig({
        baseFont: 'bundled',
        emojiFontKey: 'system'
      }),
      cols: 80,
      rows: 24,
      timeout: 30000,
    });
  }, 40000);

  it('renders wide layout (120x40)', async () => {
    await createSnapshotFromPty({
      command: 'npx',
      args: ['tsx', standardScript],
      outputPath: 'tests/__baselines__/settings-wide.png',
      ...getCIOptimizedConfig({
        baseFont: 'bundled',
        emojiFontKey: 'system'
      }),
      cols: 120,
      rows: 40,
      timeout: 30000,
    });
  }, 40000);

  it('renders narrow layout (60x20)', async () => {
    await createSnapshotFromPty({
      command: 'npx',
      args: ['tsx', narrowScript],
      outputPath: 'tests/__baselines__/settings-narrow.png',
      ...getCIOptimizedConfig({
        baseFont: 'bundled',
        emojiFontKey: 'system'
      }),
      cols: 60,
      rows: 20,
      timeout: 30000,
    });
  }, 40000);
});
