/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { interactiveCommand } from './interactiveCommand.js';
import { MessageType } from '../types.js';
import type { CommandContext } from './types.js';

describe('interactiveCommand', () => {
  let mockContext: CommandContext;
  let mockConfig: {
    isAutoMode: ReturnType<typeof vi.fn>;
    exitAutoMode: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockConfig = {
      isAutoMode: vi.fn().mockReturnValue(true),
      exitAutoMode: vi.fn(),
    };

    mockContext = {
      services: {
        config: mockConfig as unknown as CommandContext['services']['config'],
        settings: {} as CommandContext['services']['settings'],
        git: undefined,
        logger: {} as CommandContext['services']['logger'],
      },
      ui: {
        addItem: vi.fn().mockReturnValue(1), // Return mock item ID
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

  it('should have correct name', () => {
    expect(interactiveCommand.name).toBe('interactive');
  });

  it('should exit auto mode on the config', async () => {
    await interactiveCommand.action!(mockContext, '');

    expect(mockConfig.exitAutoMode).toHaveBeenCalledOnce();
    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.INFO,
      }),
      expect.any(Number),
    );
  });

  it('should show info if not in auto mode', async () => {
    mockConfig.isAutoMode.mockReturnValue(false);

    await interactiveCommand.action!(mockContext, '');

    expect(mockConfig.exitAutoMode).not.toHaveBeenCalled();
    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.INFO,
        text: 'Already in interactive mode.',
      }),
      expect.any(Number),
    );
  });

  it('should show error if config is null', async () => {
    mockContext.services.config = null;

    await interactiveCommand.action!(mockContext, '');

    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.ERROR,
        text: 'Configuration not available.',
      }),
      expect.any(Number),
    );
  });
});
