/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { handleUpdate } from './update.js';
import { ExtensionManager } from '../../config/extension-manager.js';
import { debugLogger } from '@google/gemini-cli-core';

// Mock dependencies
vi.mock('../../config/extension-manager.js');
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    debugLogger: {
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    },
  };
});
vi.mock('../../config/settings.js', () => ({
  loadSettings: () => ({ merged: {} }),
}));
vi.mock('../../config/extensions/consent.js', () => ({
  requestConsentNonInteractive: vi.fn(),
}));
vi.mock('../../config/extensions/extensionSettings.js', () => ({
  promptForSetting: vi.fn(),
}));
vi.mock('../utils.js', () => ({
  exitCli: vi.fn(),
}));

describe('handleUpdate - Extension Not Found', () => {
  const mockExtensions = [{ name: 'ext-1' }, { name: 'ext-2' }];

  beforeEach(() => {
    vi.clearAllMocks();
    // @ts-expect-error: Mocking complex type
    ExtensionManager.mockImplementation(() => ({
      loadExtensions: vi.fn().mockResolvedValue(mockExtensions),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should list installed extensions when requested extension is not found', async () => {
    await handleUpdate({ name: 'nOn-ExIsTeNt' });

    expect(debugLogger.log).toHaveBeenCalledWith(
      'Extension "nOn-ExIsTeNt" not found.',
    );
    expect(debugLogger.log).toHaveBeenCalledWith(
      'Installed extensions: ext-1, ext-2',
    );
  });

  it('should report no extensions installed if list is empty', async () => {
    // @ts-expect-error: Mocking complex type
    ExtensionManager.mockImplementation(() => ({
      loadExtensions: vi.fn().mockResolvedValue([]),
    }));

    await handleUpdate({ name: 'missing' });

    expect(debugLogger.log).toHaveBeenCalledWith(
      'Extension "missing" not found.',
    );
    expect(debugLogger.log).toHaveBeenCalledWith('No extensions installed.');
  });
});
