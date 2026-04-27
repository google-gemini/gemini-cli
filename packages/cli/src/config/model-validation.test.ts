/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { loadCliConfig, type CliArgs } from './config.js';
import { createTestMergedSettings } from './settings.js';

vi.mock('./trustedFolders.js', () => ({
  isWorkspaceTrusted: vi.fn(() => ({ isTrusted: true, source: 'file' })),
}));

vi.mock('./extension-manager.js', () => ({
  ExtensionManager: vi.fn().mockImplementation(() => ({
    loadExtensions: vi.fn(),
    getExtensions: vi.fn().mockReturnValue([]),
  })),
}));

describe('Model Selection Validation', () => {
  it('should throw an error for an invalid gemini model name', async () => {
    const settings = createTestMergedSettings();
    const argv = {
      model: 'gemini-3-pro-perview', // typo
      query: 'hello',
    } as unknown as CliArgs;

    // Currently this DOES NOT throw, but we want it to.
    // After our fix, this should throw a helpful error.
    await expect(loadCliConfig(settings, 'test-session', argv)).rejects.toThrow(
      /Invalid model name/,
    );
  });

  it('should allow valid gemini model names', async () => {
    const settings = createTestMergedSettings();
    const argv = {
      model: 'gemini-3-pro-preview',
      query: 'hello',
    } as unknown as CliArgs;

    const config = await loadCliConfig(settings, 'test-session', argv);
    expect(config.getModel()).toBe('gemini-3-pro-preview');
  });

  it('should allow custom (non-gemini) model names', async () => {
    const settings = createTestMergedSettings();
    const argv = {
      model: 'my-custom-model',
      query: 'hello',
    } as unknown as CliArgs;

    const config = await loadCliConfig(settings, 'test-session', argv);
    expect(config.getModel()).toBe('my-custom-model');
  });

  it('should allow custom aliases from settings', async () => {
    const settings = createTestMergedSettings();
    settings.modelConfigs = {
      ...settings.modelConfigs,
      aliases: {
        'my-cool-alias': {
          modelConfig: { model: 'gemini-3-pro-preview' },
        },
      },
    };
    const argv = {
      model: 'my-cool-alias',
      query: 'hello',
    } as unknown as CliArgs;

    const config = await loadCliConfig(settings, 'test-session', argv);
    expect(config.getModel()).toBe('my-cool-alias');
  });
});
