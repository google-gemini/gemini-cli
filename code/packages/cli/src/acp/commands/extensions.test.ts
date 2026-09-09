/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CommandContext } from './types.js';
import {
  DisableExtensionCommand,
  UninstallExtensionCommand,
} from './extensions.js';
import { ExtensionManager } from '../../config/extension-manager.js';

const mockGetErrorMessage = vi.hoisted(() => vi.fn());

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    getErrorMessage: mockGetErrorMessage,
  };
});

vi.mock('../../config/extension-manager.js', () => {
  class MockExtensionManager {
    disableExtension = vi.fn(async () => undefined);
    uninstallExtension = vi.fn(async () => undefined);
    getExtensions = vi.fn(() => []);
  }

  return {
    ExtensionManager: MockExtensionManager,
    inferInstallMetadata: vi.fn(),
  };
});

type TestExtensionManager = InstanceType<typeof ExtensionManager> & {
  disableExtension: ReturnType<typeof vi.fn>;
  uninstallExtension: ReturnType<typeof vi.fn>;
  getExtensions: ReturnType<typeof vi.fn>;
};

function createExtensionManager(): TestExtensionManager {
  return new ExtensionManager({} as never) as TestExtensionManager;
}

function createContext(extensionLoader: unknown): CommandContext {
  return {
    agentContext: {
      config: {
        getExtensionLoader: vi.fn().mockReturnValue(extensionLoader),
      },
    } as unknown as CommandContext['agentContext'],
    settings: {} as CommandContext['settings'],
    sendMessage: vi.fn().mockResolvedValue(undefined),
  };
}

describe('ACP extensions error paths', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetErrorMessage.mockImplementation((error: unknown) =>
      error instanceof Error ? error.message : String(error),
    );
  });

  it('returns error when disabling fails', async () => {
    const command = new DisableExtensionCommand();
    const extensionManager = createExtensionManager();
    extensionManager.disableExtension.mockRejectedValue(
      new Error('Extension not found.'),
    );
    const context = createContext(extensionManager);

    const result = await command.execute(context, ['missing-ext']);

    expect(result).toEqual({
      name: 'extensions disable',
      data: 'Failed to disable "missing-ext": Extension not found.',
    });
  });

  it('returns error when uninstalling a non-existent extension', async () => {
    const command = new UninstallExtensionCommand();
    const extensionManager = createExtensionManager();
    extensionManager.uninstallExtension.mockRejectedValue(
      new Error('Extension not found.'),
    );
    const context = createContext(extensionManager);

    const result = await command.execute(context, ['non-existent-ext']);

    expect(result).toEqual({
      name: 'extensions uninstall',
      data: 'Failed to uninstall extension "non-existent-ext": Extension not found.',
    });
  });
});
