/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  checkHasEditorType,
  allowEditorTypeInSandbox,
} from '@google/gemini-cli-core';

vi.mock('@google/gemini-cli-core', async () => {
  const actual = await vi.importActual('@google/gemini-cli-core');
  return {
    ...actual,
    checkHasEditorType: vi.fn(),
    allowEditorTypeInSandbox: vi.fn(),
  };
});

describe('editorSettingsManager', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    delete process.env['GEMINI_CLI_CONTEXT'];
  });

  afterEach(() => {
    delete process.env['GEMINI_CLI_CONTEXT'];
  });

  it('should include GeminiEditor when in electron context', async () => {
    process.env['GEMINI_CLI_CONTEXT'] = 'electron';
    vi.mocked(checkHasEditorType).mockReturnValue(true);
    vi.mocked(allowEditorTypeInSandbox).mockReturnValue(true);

    const { editorSettingsManager } = await import(
      './editorSettingsManager.js'
    );
    const displays = editorSettingsManager.getAvailableEditorDisplays();
    const geminiEditor = displays.find((d) => d.type === 'GeminiEditor');

    expect(geminiEditor).toBeDefined();
    expect(geminiEditor?.name).toContain('Gemini Editor');
  });

  it('should not include GeminiEditor when not in electron context', async () => {
    process.env['GEMINI_CLI_CONTEXT'] = 'terminal';
    vi.mocked(checkHasEditorType).mockReturnValue(true);
    vi.mocked(allowEditorTypeInSandbox).mockReturnValue(true);

    const { editorSettingsManager } = await import(
      './editorSettingsManager.js'
    );
    const displays = editorSettingsManager.getAvailableEditorDisplays();
    const geminiEditor = displays.find((d) => d.type === 'GeminiEditor');

    expect(geminiEditor).toBeUndefined();
  });

  it('should correctly set disabled status based on availability checks', async () => {
    process.env['GEMINI_CLI_CONTEXT'] = 'terminal';
    vi.mocked(checkHasEditorType).mockReturnValue(false);
    vi.mocked(allowEditorTypeInSandbox).mockReturnValue(true);

    const { editorSettingsManager } = await import(
      './editorSettingsManager.js'
    );
    const displays = editorSettingsManager.getAvailableEditorDisplays();
    const vscode = displays.find((d) => d.type === 'vscode');

    expect(vscode?.disabled).toBe(true);
    expect(vscode?.name).toContain('(Not installed)');
  });
});
