/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { worktreeCommand } from './worktreeCommand.js';
import { MessageType } from '../types.js';
import * as core from '@google/gemini-cli-core';
import type { CommandContext } from './types.js';
import type { LoadedSettings } from '../../config/settings.js';
import type { MergedSettings } from '../../config/settingsSchema.js';

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    createWorktreeService: vi.fn(),
  };
});

describe('worktreeCommand', () => {
  const mockConfig = {
    getWorktreeSettings: vi.fn(),
    switchToWorktree: vi.fn(),
    getTargetDir: vi.fn().mockReturnValue('/old/path'),
  };

  const mockSettings = {
    merged: {
      experimental: {
        worktrees: true,
      },
    } as unknown as MergedSettings,
  } as LoadedSettings;

  const mockContext = {
    services: {
      config: mockConfig as unknown as core.Config,
      settings: mockSettings,
    },
    ui: {
      addItem: vi.fn(),
    },
  };

  const mockService = {
    setup: vi.fn(),
    maybeCleanup: vi.fn(),
  };

  const originalCwd = process.cwd;
  const originalChdir = process.chdir;

  beforeEach(() => {
    vi.clearAllMocks();
    process.cwd = vi.fn().mockReturnValue('/old/path');
    process.chdir = vi.fn();
    vi.mocked(core.createWorktreeService).mockResolvedValue(
      mockService as unknown as core.WorktreeService,
    );
  });

  afterEach(() => {
    process.cwd = originalCwd;
    process.chdir = originalChdir;
  });

  it('should switch to a new worktree', async () => {
    const newWorktreeInfo = {
      name: 'new-feature',
      path: '/new/path',
      baseSha: 'new-sha',
    };
    mockService.setup.mockResolvedValue(newWorktreeInfo);

    await worktreeCommand.action!(
      mockContext as unknown as CommandContext,
      'new-feature',
    );

    expect(mockService.setup).toHaveBeenCalledWith('new-feature');
    expect(process.chdir).toHaveBeenCalledWith('/new/path');
    expect(mockConfig.switchToWorktree).toHaveBeenCalledWith(newWorktreeInfo);
    expect(mockContext.ui.addItem).toHaveBeenCalledTimes(1);
    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.INFO,
        text: 'Switched to worktree: new-feature',
      }),
    );
  });

  it('should generate a name if none provided to the command', async () => {
    mockService.setup.mockResolvedValue({
      name: 'generated-name',
      path: '/path/generated-name',
      baseSha: 'sha',
    });

    await worktreeCommand.action!(
      mockContext as unknown as CommandContext,
      '  ',
    );

    expect(mockService.setup).toHaveBeenCalledWith(undefined);
    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Switched to worktree: generated-name',
      }),
    );
  });

  it('should cleanup existing worktree before switching', async () => {
    const currentWorktree = {
      name: 'old',
      path: '/old/path',
      baseSha: 'old-sha',
    };
    mockConfig.getWorktreeSettings.mockReturnValue(currentWorktree);
    mockService.setup.mockResolvedValue({
      name: 'new',
      path: '/new',
      baseSha: 'new',
    });

    await worktreeCommand.action!(
      mockContext as unknown as CommandContext,
      'new',
    );

    expect(mockService.maybeCleanup).toHaveBeenCalledWith(currentWorktree);
    expect(mockService.setup).toHaveBeenCalledWith('new');
  });

  it('should show error if worktrees are disabled', async () => {
    const disabledSettings = {
      merged: {
        experimental: {
          worktrees: false,
        },
      } as unknown as MergedSettings,
    } as LoadedSettings;

    const contextWithDisabled = {
      ...mockContext,
      services: {
        ...mockContext.services,
        settings: disabledSettings,
      },
    };

    await worktreeCommand.action!(
      contextWithDisabled as unknown as CommandContext,
      'foo',
    );

    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.ERROR,
        text: expect.stringContaining(
          'only available when experimental.worktrees is enabled',
        ),
      }),
    );
    expect(core.createWorktreeService).not.toHaveBeenCalled();
  });

  it('should handle errors gracefully', async () => {
    mockService.setup.mockRejectedValue(new Error('Git failure'));

    await worktreeCommand.action!(
      mockContext as unknown as CommandContext,
      'fail',
    );

    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.ERROR,
        text: expect.stringContaining(
          'Failed to switch to worktree: Git failure',
        ),
      }),
    );
  });
});
