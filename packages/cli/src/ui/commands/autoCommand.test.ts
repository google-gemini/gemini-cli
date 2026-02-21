/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { autoCommand } from './autoCommand.js';
import { MessageType } from '../types.js';
import type { CommandContext } from './types.js';

describe('autoCommand', () => {
  let mockContext: CommandContext;
  let mockConfig: {
    isInteractive: ReturnType<typeof vi.fn>;
    isAutoMode: ReturnType<typeof vi.fn>;
    enterAutoMode: ReturnType<typeof vi.fn>;
  };
  let addItemCalls: Array<[unknown, number]>;

  beforeEach(() => {
    addItemCalls = [];
    mockConfig = {
      isInteractive: vi.fn().mockReturnValue(true),
      isAutoMode: vi.fn().mockReturnValue(false),
      enterAutoMode: vi.fn(),
    };

    mockContext = {
      services: {
        config: mockConfig as unknown as CommandContext['services']['config'],
        settings: {} as CommandContext['services']['settings'],
        git: undefined,
        logger: {} as CommandContext['services']['logger'],
      },
      ui: {
        addItem: vi.fn((...args: unknown[]) => {
          addItemCalls.push(args as [unknown, number]);
          return 1; // Return mock item ID
        }),
        clear: vi.fn(),
        setDebugMessage: vi.fn(),
        pendingItem: null,
        setPendingItem: vi.fn(),
        loadHistory: vi.fn(),
        toggleCorgiMode: vi.fn(),
        toggleDebugProfiler: vi.fn(),
        toggleVimEnabled: vi.fn(),
        reloadCommands: vi.fn(),
        openAgentConfigDialog: vi.fn(),
        extensionsUpdateState: new Map(),
        dispatchExtensionStateUpdate: vi.fn(),
        addConfirmUpdateExtensionRequest: vi.fn(),
        setConfirmationRequest: vi.fn(),
        removeComponent: vi.fn(),
        toggleBackgroundShell: vi.fn(),
        toggleShortcutsHelp: vi.fn(),
      },
      session: {
        stats: {} as CommandContext['session']['stats'],
        sessionShellAllowlist: new Set(),
      },
    };
  });

  it('should have correct name and aliases', () => {
    expect(autoCommand.name).toBe('auto');
    expect(autoCommand.altNames).toContain('headless');
    expect(autoCommand.altNames).toContain('autonomous');
  });

  it('should enable auto mode on the config', async () => {
    await autoCommand.action!(mockContext, '');

    expect(mockConfig.enterAutoMode).toHaveBeenCalledOnce();
    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.INFO,
      }),
      expect.any(Number),
    );
  });

  it('should show warning if config is null', async () => {
    mockContext.services.config = null;

    await autoCommand.action!(mockContext, '');

    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.ERROR,
        text: 'Configuration not available.',
      }),
      expect.any(Number),
    );
  });

  it('should show warning if already in non-interactive mode', async () => {
    mockConfig.isInteractive.mockReturnValue(false);

    await autoCommand.action!(mockContext, '');

    expect(mockConfig.enterAutoMode).not.toHaveBeenCalled();
    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.WARNING,
      }),
      expect.any(Number),
    );
  });

  it('should show warning if already in auto mode', async () => {
    mockConfig.isAutoMode.mockReturnValue(true);

    await autoCommand.action!(mockContext, '');

    expect(mockConfig.enterAutoMode).not.toHaveBeenCalled();
    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.WARNING,
        text: expect.stringContaining('Already in auto mode'),
      }),
      expect.any(Number),
    );
  });
});
