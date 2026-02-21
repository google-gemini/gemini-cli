/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { updateCommand } from './updateCommand.js';
import type { CommandContext } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { PackageManager , getInstallationInfo } from '../../utils/installationInfo.js';

// Mock the update utilities
vi.mock('../utils/updateCheck.js', () => ({
  checkForUpdates: vi.fn(),
}));

vi.mock('../../utils/installationInfo.js', async () => {
  const actual = await vi.importActual('../../utils/installationInfo.js');
  return {
    ...actual,
    getInstallationInfo: vi.fn(),
  };
});

vi.mock('../../utils/handleAutoUpdate.js', () => ({
  handleAutoUpdate: vi.fn(),
}));

import { checkForUpdates } from '../utils/updateCheck.js';
import { handleAutoUpdate } from '../../utils/handleAutoUpdate.js';

describe('updateCommand', () => {
  let mockContext: CommandContext;

  beforeEach(() => {
    mockContext = createMockCommandContext();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should show message when already on latest version', async () => {
    if (!updateCommand.action) {
      throw new Error('updateCommand must have an action.');
    }

    vi.mocked(checkForUpdates).mockResolvedValue(null);

    const result = await updateCommand.action(mockContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'You are already running the latest version of Gemini CLI.',
    });
  });

  it('should show confirmation when update is available', async () => {
    if (!updateCommand.action) {
      throw new Error('updateCommand must have an action.');
    }

    const updateInfo = {
      message: 'A new version is available! 1.0.0 → 1.1.0',
      update: {
        name: '@google/gemini-cli',
        latest: '1.1.0',
        current: '1.0.0',
        type: 'minor' as const,
      },
    };

    vi.mocked(checkForUpdates).mockResolvedValue(updateInfo);
    vi.mocked(getInstallationInfo).mockReturnValue({
      packageManager: PackageManager.NPM,
      isGlobal: true,
      updateCommand: 'npm install -g @google/gemini-cli@latest',
    });

    const result = await updateCommand.action(mockContext, '');

    expect(result).toEqual({
      type: 'confirm_action',
      prompt:
        'A new version is available! 1.0.0 → 1.1.0\n\nDo you want to update now?',
      originalInvocation: {
        raw: '/update',
      },
    });
  });

  it('should show message when running in sandbox', async () => {
    if (!updateCommand.action) {
      throw new Error('updateCommand must have an action.');
    }

    const updateInfo = {
      message: 'A new version is available! 1.0.0 → 1.1.0',
      update: {
        name: '@google/gemini-cli',
        latest: '1.1.0',
        current: '1.0.0',
        type: 'minor' as const,
      },
    };

    vi.mocked(checkForUpdates).mockResolvedValue(updateInfo);
    mockContext.services.settings.merged.tools = { sandbox: true };

    const result = await updateCommand.action(mockContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: `${updateInfo.message}\nAutomatic update is not available in sandbox mode.`,
    });
  });

  it('should handle confirmation and trigger update', async () => {
    if (!updateCommand.action) {
      throw new Error('updateCommand must have an action.');
    }

    const updateInfo = {
      message: 'A new version is available! 1.0.0 → 1.1.0',
      update: {
        name: '@google/gemini-cli',
        latest: '1.1.0',
        current: '1.0.0',
        type: 'minor' as const,
      },
    };

    vi.mocked(checkForUpdates).mockResolvedValue(updateInfo);
    vi.mocked(getInstallationInfo).mockReturnValue({
      packageManager: PackageManager.NPM,
      isGlobal: true,
      updateCommand: 'npm install -g @google/gemini-cli@latest',
    });

    // Simulate a confirmed invocation
    mockContext.overwriteConfirmed = true;

    const result = await updateCommand.action(mockContext, '');

    // Verify handleAutoUpdate is called to start the background update
    expect(handleAutoUpdate).toHaveBeenCalledWith(
      updateInfo,
      mockContext.services.settings,
      process.cwd(),
    );

    // Verify user gets feedback message
    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content:
        'Update initiated. The new version will be used on your next run.',
    });
  });

  it('should handle errors gracefully', async () => {
    if (!updateCommand.action) {
      throw new Error('updateCommand must have an action.');
    }

    const error = new Error('Network error');
    vi.mocked(checkForUpdates).mockRejectedValue(error);

    const result = await updateCommand.action(mockContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'Failed to check for updates: Network error',
    });
  });
});
