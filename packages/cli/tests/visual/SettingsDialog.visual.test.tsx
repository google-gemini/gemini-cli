import { describe, it } from 'vitest';
import { createSnapshotFromPty, getCIOptimizedConfig } from 'ink-visual-testing';
import path from 'node:path';

describe('SettingsDialog Visual Regression', () => {
  const renderScript = path.resolve(__dirname, 'render-settings-dialog.tsx');

  it('renders standard layout (80x24)', async () => {
    await createSnapshotFromPty({
      command: 'npx',
      args: ['tsx', renderScript],
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
      args: ['tsx', renderScript],
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
      args: ['tsx', path.resolve(__dirname, 'render-settings-dialog-narrow.tsx')],
      outputPath: 'tests/__baselines__/render-settings-dialog-narrow.png',
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
