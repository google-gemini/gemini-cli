/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { hasValidEditorCommand, allowEditorTypeInSandbox } = vi.hoisted(() => ({
  hasValidEditorCommand: vi.fn(),
  allowEditorTypeInSandbox: vi.fn(),
}));

vi.mock('@google/gemini-cli-core', () => ({
  EDITOR_DISPLAY_NAMES: { vscode: 'VS Code', vim: 'Vim' },
  hasValidEditorCommand,
  allowEditorTypeInSandbox,
}));

import { EditorSettingsManager } from './editorSettingsManager.js';

describe('EditorSettingsManager', () => {
  beforeEach(() => {
    hasValidEditorCommand.mockReset().mockReturnValue(true);
    allowEditorTypeInSandbox.mockReset().mockReturnValue(true);
  });

  it('does not probe for editors during construction', () => {
    // Probing shells out per editor (execSync) and must not run at module load
    // / construction time, or it blocks startup. See issue #28106.
    new EditorSettingsManager();
    expect(hasValidEditorCommand).not.toHaveBeenCalled();
    expect(allowEditorTypeInSandbox).not.toHaveBeenCalled();
  });

  it('computes editors lazily on first access and caches the result', () => {
    const manager = new EditorSettingsManager();

    const first = manager.getAvailableEditorDisplays();
    // One probe per known editor (vscode, vim).
    expect(hasValidEditorCommand).toHaveBeenCalledTimes(2);

    const second = manager.getAvailableEditorDisplays();
    // Cached: the same array is returned and no further probing happens.
    expect(second).toBe(first);
    expect(hasValidEditorCommand).toHaveBeenCalledTimes(2);
  });

  it('always lists "None" first and labels uninstalled editors as disabled', () => {
    hasValidEditorCommand.mockImplementation(
      (type: string) => type === 'vscode',
    );

    const displays = new EditorSettingsManager().getAvailableEditorDisplays();

    expect(displays[0]).toEqual({
      name: 'None',
      type: 'not_set',
      disabled: false,
    });

    const vim = displays.find((d) => d.type === 'vim');
    expect(vim?.disabled).toBe(true);
    expect(vim?.name).toContain('(Not installed)');

    const vscode = displays.find((d) => d.type === 'vscode');
    expect(vscode?.disabled).toBe(false);
    expect(vscode?.name).toBe('VS Code');
  });

  it('marks editors not allowed in the sandbox as disabled', () => {
    allowEditorTypeInSandbox.mockImplementation(
      (type: string) => type !== 'vim',
    );

    const displays = new EditorSettingsManager().getAvailableEditorDisplays();

    const vim = displays.find((d) => d.type === 'vim');
    expect(vim?.disabled).toBe(true);
    expect(vim?.name).toContain('(Not available in sandbox)');
  });
});
