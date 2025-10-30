/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { handleValidation } from './validate.js';
import mock from 'mock-fs';

const mockLoadExtensionConfig = vi.hoisted(() => vi.fn());
vi.mock('../../config/extension-manager.js', () => ({
  loadExtensionConfig: mockLoadExtensionConfig,
  getContextFileNames: (config: Record<string, unknown>) =>
    (config.contextFileName as string[]) || ['GEMINI.md'],
}));

describe('handleValidation', () => {
  afterEach(() => {
    mock.restore();
    vi.clearAllMocks();
  });

  it('should pass with a valid gemini-extensions.json', async () => {
    mock({
      '/gemini-extensions.json': JSON.stringify({
        name: 'test-extension',
        version: '1.0.0',
      }),
      '/GEMINI.md': 'context file',
    });
    mockLoadExtensionConfig.mockReturnValue({
      name: 'test-extension',
      version: '1.0.0',
    });

    const consoleLogSpy = vi.spyOn(console, 'log');
    await handleValidation();
    expect(consoleLogSpy).toHaveBeenCalledWith('Validation successful!');
  });

  it('should fail with an invalid version', async () => {
    mock({
      '/gemini-extensions.json': JSON.stringify({
        name: 'test-extension',
        version: '1.0',
      }),
    });
    mockLoadExtensionConfig.mockReturnValue({
      name: 'test-extension',
      version: '1.0',
    });
    const consoleErrorSpy = vi.spyOn(console, 'error');
    const processExitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);

    await handleValidation();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Validation failed: Invalid version: "1.0". Version must be in standard semver format.',
    );
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should fail if a context file is missing', async () => {
    mock({
      '/gemini-extensions.json': JSON.stringify({
        name: 'test-extension',
        version: '1.0.0',
        contextFileName: ['missing.md'],
      }),
    });
    mockLoadExtensionConfig.mockReturnValue({
      name: 'test-extension',
      version: '1.0.0',
      contextFileName: ['missing.md'],
    });

    const consoleErrorSpy = vi.spyOn(console, 'error');
    const processExitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);

    await handleValidation();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Validation failed: Context file not found: missing.md',
    );
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });
});
