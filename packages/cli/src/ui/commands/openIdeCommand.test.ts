/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { openIdeCommand } from './openIdeCommand.js';
import type { CommandContext } from './types.js';
import { CommandKind } from './types.js';
import type { Config, Logger } from '@google/gemini-cli-core';
import type { LoadedSettings } from '../../config/settings.js';
import type { SessionStatsState } from '../contexts/SessionContext.js';

const mockSpawn = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({
  spawn: mockSpawn,
}));

const mockConfig = {
  getWorkingDir: vi.fn(() => '/test/directory'),
};

const createMockContext = (idePath: string = ''): CommandContext => ({
  services: {
    config: mockConfig as unknown as Config,
    settings: {
      merged: {
        ide: {
          defaultIdePath: idePath,
        },
      },
    } as LoadedSettings,
    git: undefined,
    logger: {} as Logger,
  },
  ui: {
    addItem: vi.fn(),
    clear: vi.fn(),
    setDebugMessage: vi.fn(),
    pendingItem: null,
    setPendingItem: vi.fn(),
    loadHistory: vi.fn(),
    toggleCorgiMode: vi.fn(),
    toggleDebugProfiler: vi.fn(),
    toggleVimEnabled: vi.fn(),
    setGeminiMdFileCount: vi.fn(),
    reloadCommands: vi.fn(),
    extensionsUpdateState: new Map(),
    dispatchExtensionStateUpdate: vi.fn(),
    addConfirmUpdateExtensionRequest: vi.fn(),
  },
  session: {
    stats: {} as SessionStatsState,
    sessionShellAllowlist: new Set(),
  },
});

describe('openIdeCommand', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should have correct metadata', () => {
    expect(openIdeCommand.name).toBe('open-ide');
    expect(openIdeCommand.description).toBe(
      'Open current directory in configured IDE',
    );
    expect(openIdeCommand.kind).toBe(CommandKind.BUILT_IN);
  });

  it('should show error when no IDE path is configured', async () => {
    const mockContext = createMockContext(''); // Empty IDE path

    const result = await openIdeCommand.action!(mockContext, '');

    // Type assertion since we know this action returns a MessageActionReturn
    const messageResult = result as {
      type: 'message';
      messageType: 'error';
      content: string;
    };

    expect(messageResult.type).toBe('message');
    expect(messageResult.messageType).toBe('error');
    expect(messageResult.content).toContain('No default IDE configured');
    expect(messageResult.content).toContain('settings.json');
    expect(messageResult.content).toContain('"defaultIdePath"');
  });

  it('should spawn process with configured IDE path', async () => {
    const mockContext = createMockContext('code');
    const mockChild = {
      unref: vi.fn(),
      on: vi.fn((event, callback) => {
        if (event === 'spawn') {
          setTimeout(callback, 0);
        }
      }),
    };
    mockSpawn.mockReturnValue(mockChild);

    const result = await openIdeCommand.action!(mockContext, '');

    expect(mockSpawn).toHaveBeenCalledWith('code', ['/test/directory'], {
      detached: true,
      stdio: 'ignore',
    });
    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'Opening "/test/directory" in code...',
    });
  });

  it('should handle IDE path with arguments', async () => {
    const mockContext = createMockContext('code --new-window');
    const mockChild = {
      unref: vi.fn(),
      on: vi.fn((event, callback) => {
        if (event === 'spawn') {
          setTimeout(callback, 0);
        }
      }),
    };
    mockSpawn.mockReturnValue(mockChild);

    await openIdeCommand.action!(mockContext, '');

    expect(mockSpawn).toHaveBeenCalledWith(
      'code',
      ['--new-window', '/test/directory'],
      {
        detached: true,
        stdio: 'ignore',
      },
    );
  });

  it('should handle spawn errors gracefully', async () => {
    const mockContext = createMockContext('invalid-command');
    const mockChild = {
      unref: vi.fn(),
      on: vi.fn((event, callback) => {
        if (event === 'error') {
          setTimeout(() => callback(new Error('Spawn failed')), 0);
        }
      }),
    };
    mockSpawn.mockReturnValue(mockChild);

    const result = await openIdeCommand.action!(mockContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content:
        'Failed to open IDE with command "invalid-command". Please check that the IDE path is correct in your settings.',
    });
  });

  it('should use process.cwd() when config.getWorkingDir() is not available', async () => {
    const originalCwd = process.cwd();
    const mockProcessCwd = '/fallback/directory';
    Object.defineProperty(process, 'cwd', {
      value: vi.fn(() => mockProcessCwd),
      configurable: true,
    });

    const contextWithoutConfig = createMockContext('code');
    contextWithoutConfig.services.config = null;

    const mockChild = {
      unref: vi.fn(),
      on: vi.fn((event, callback) => {
        if (event === 'spawn') {
          setTimeout(callback, 0);
        }
      }),
    };
    mockSpawn.mockReturnValue(mockChild);

    const result = await openIdeCommand.action!(contextWithoutConfig, '');

    expect(mockSpawn).toHaveBeenCalledWith('code', [mockProcessCwd], {
      detached: true,
      stdio: 'ignore',
    });
    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: `Opening "${mockProcessCwd}" in code...`,
    });

    // Restore original process.cwd
    Object.defineProperty(process, 'cwd', {
      value: () => originalCwd,
      configurable: true,
    });
  });
});
