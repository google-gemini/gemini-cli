/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';

const mockHasValidEditorCommand = vi.hoisted(() => vi.fn(() => true));

vi.mock('@google/gemini-cli-core', () => ({
  allowEditorTypeInSandbox: vi.fn(() => true),
  hasValidEditorCommand: mockHasValidEditorCommand,
  EDITOR_DISPLAY_NAMES: {
    code: 'VS Code',
    vim: 'Vim',
  },
}));

describe('editorSettingsManager', () => {
  it('computes editor availability lazily', async () => {
    const { editorSettingsManager } = await import(
      './editorSettingsManager.js'
    );

    expect(mockHasValidEditorCommand).not.toHaveBeenCalled();

    const editors = editorSettingsManager.getAvailableEditorDisplays();
    expect(editors.length).toBeGreaterThan(1);
    expect(mockHasValidEditorCommand).toHaveBeenCalledTimes(2);
  });
});
