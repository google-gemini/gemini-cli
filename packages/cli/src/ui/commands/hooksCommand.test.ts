/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { hooksCommand } from './hooksCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { MessageType } from '../types.js';
import type { HookRegistryEntry } from '@google/gemini-cli-core';
import { HookType, HookEventName, ConfigSource } from '@google/gemini-cli-core';
import type { CommandContext } from './types.js';

describe('hooksCommand', () => {
  let mockContext: CommandContext;
  let mockHookSystem: {
    getAllHooks: ReturnType<typeof vi.fn>;
    setHookEnabled: ReturnType<typeof vi.fn>;
    getRegistry: ReturnType<typeof vi.fn>;
  };
  let mockConfig: {
    getHookSystem: ReturnType<typeof vi.fn>;
  };
  let mockSettings: {
    merged: {
      hooks?: {
        disabled?: string[];
      };
    };
    setValue: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock hook system
    mockHookSystem = {
      getAllHooks: vi.fn().mockReturnValue([]),
      setHookEnabled: vi.fn(),
      getRegistry: vi.fn().mockReturnValue({
        initialize: vi.fn().mockResolvedValue(undefined),
      }),
    };

    // Create mock config
    mockConfig = {
      getHookSystem: vi.fn().mockReturnValue(mockHookSystem),
    };

    // Create mock settings
    mockSettings = {
      merged: {
        hooks: {
          disabled: [],
        },
      },
      setValue: vi.fn(),
    };

    // Create mock context with config and settings
    mockContext = createMockCommandContext({
      services: {
        config: mockConfig,
        settings: mockSettings,
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('root command', () => {
    it('should have the correct name and description', () => {
      expect(hooksCommand.name).toBe('hooks');
      expect(hooksCommand.description).toBe('Manage hooks');
    });

    it('should have all expected subcommands', () => {
      expect(hooksCommand.subCommands).toBeDefined();
      expect(hooksCommand.subCommands).toHaveLength(3);

      const subCommandNames = hooksCommand.subCommands!.map((cmd) => cmd.name);
      expect(subCommandNames).toContain('panel');
      expect(subCommandNames).toContain('enable');
      expect(subCommandNames).toContain('disable');
    });

    it('should delegate to panel action when invoked without subcommand', async () => {
      if (!hooksCommand.action) {
        throw new Error('hooks command must have an action');
      }

      mockHookSystem.getAllHooks.mockReturnValue([
        createMockHook('test-hook', HookEventName.BeforeTool, true),
      ]);

      await hooksCommand.action(mockContext, '');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.HOOKS_LIST,
        }),
        expect.any(Number),
      );
    });
  });

  describe('panel subcommand', () => {
    it('should return error when config is not loaded', async () => {
      const contextWithoutConfig = createMockCommandContext({
        services: {
          config: null,
        },
      });

      const panelCmd = hooksCommand.subCommands!.find(
        (cmd) => cmd.name === 'panel',
      );
      if (!panelCmd?.action) {
        throw new Error('panel command must have an action');
      }

      const result = await panelCmd.action(contextWithoutConfig, '');

      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: 'Config not loaded.',
      });
    });

    it('should return info message when hook system is not enabled', async () => {
      mockConfig.getHookSystem.mockReturnValue(null);

      const panelCmd = hooksCommand.subCommands!.find(
        (cmd) => cmd.name === 'panel',
      );
      if (!panelCmd?.action) {
        throw new Error('panel command must have an action');
      }

      const result = await panelCmd.action(mockContext, '');

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content:
          'Hook system is not enabled. Enable it in settings with tools.enableHooks',
      });
    });

    it('should return info message when no hooks are configured', async () => {
      mockHookSystem.getAllHooks.mockReturnValue([]);

      const panelCmd = hooksCommand.subCommands!.find(
        (cmd) => cmd.name === 'panel',
      );
      if (!panelCmd?.action) {
        throw new Error('panel command must have an action');
      }

      const result = await panelCmd.action(mockContext, '');

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content:
          'No hooks configured. Add hooks to your settings to get started.',
      });
    });

    it('should display hooks list when hooks are configured', async () => {
      const mockHooks: HookRegistryEntry[] = [
        createMockHook('echo-test', HookEventName.BeforeTool, true),
        createMockHook('notify', HookEventName.AfterAgent, false),
      ];

      mockHookSystem.getAllHooks.mockReturnValue(mockHooks);

      const panelCmd = hooksCommand.subCommands!.find(
        (cmd) => cmd.name === 'panel',
      );
      if (!panelCmd?.action) {
        throw new Error('panel command must have an action');
      }

      await panelCmd.action(mockContext, '');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.HOOKS_LIST,
          hooks: mockHooks,
        }),
        expect.any(Number),
      );
    });
  });

  describe('enable subcommand', () => {
    it('should return error when config is not loaded', async () => {
      const contextWithoutConfig = createMockCommandContext({
        services: {
          config: null,
        },
      });

      const enableCmd = hooksCommand.subCommands!.find(
        (cmd) => cmd.name === 'enable',
      );
      if (!enableCmd?.action) {
        throw new Error('enable command must have an action');
      }

      const result = await enableCmd.action(contextWithoutConfig, 'test-hook');

      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: 'Config not loaded.',
      });
    });

    it('should return error when hook system is not enabled', async () => {
      mockConfig.getHookSystem.mockReturnValue(null);

      const enableCmd = hooksCommand.subCommands!.find(
        (cmd) => cmd.name === 'enable',
      );
      if (!enableCmd?.action) {
        throw new Error('enable command must have an action');
      }

      const result = await enableCmd.action(mockContext, 'test-hook');

      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: 'Hook system is not enabled.',
      });
    });

    it('should return error when hook name is not provided', async () => {
      const enableCmd = hooksCommand.subCommands!.find(
        (cmd) => cmd.name === 'enable',
      );
      if (!enableCmd?.action) {
        throw new Error('enable command must have an action');
      }

      const result = await enableCmd.action(mockContext, '');

      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: 'Usage: /hooks enable <hook-name>',
      });
    });

    it('should enable a hook and update settings', async () => {
      // Update the context's settings with disabled hooks
      mockContext.services.settings.merged.hooks = {
        disabled: ['test-hook', 'other-hook'],
      };

      const enableCmd = hooksCommand.subCommands!.find(
        (cmd) => cmd.name === 'enable',
      );
      if (!enableCmd?.action) {
        throw new Error('enable command must have an action');
      }

      const result = await enableCmd.action(mockContext, 'test-hook');

      expect(mockContext.services.settings.setValue).toHaveBeenCalledWith(
        expect.any(String),
        'hooks.disabled',
        ['other-hook'],
      );
      expect(mockHookSystem.setHookEnabled).toHaveBeenCalledWith(
        'test-hook',
        true,
      );
      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: 'Hook "test-hook" enabled successfully.',
      });
    });

    it('should handle error when enabling hook fails', async () => {
      mockSettings.setValue.mockImplementationOnce(() => {
        throw new Error('Failed to save settings');
      });

      const enableCmd = hooksCommand.subCommands!.find(
        (cmd) => cmd.name === 'enable',
      );
      if (!enableCmd?.action) {
        throw new Error('enable command must have an action');
      }

      const result = await enableCmd.action(mockContext, 'test-hook');

      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: 'Failed to enable hook: Failed to save settings',
      });
    });

    it('should complete hook names using friendly names', () => {
      const enableCmd = hooksCommand.subCommands!.find(
        (cmd) => cmd.name === 'enable',
      )!;

      const hookEntry = createMockHook(
        './hooks/test.sh',
        HookEventName.BeforeTool,
        true,
      );
      hookEntry.config.name = 'friendly-name';

      mockHookSystem.getAllHooks.mockReturnValue([hookEntry]);

      const completions = enableCmd.completion!(mockContext, 'frie');
      expect(completions).toContain('friendly-name');
    });
  });

  describe('disable subcommand', () => {
    it('should return error when config is not loaded', async () => {
      const contextWithoutConfig = createMockCommandContext({
        services: {
          config: null,
        },
      });

      const disableCmd = hooksCommand.subCommands!.find(
        (cmd) => cmd.name === 'disable',
      );
      if (!disableCmd?.action) {
        throw new Error('disable command must have an action');
      }

      const result = await disableCmd.action(contextWithoutConfig, 'test-hook');

      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: 'Config not loaded.',
      });
    });

    it('should return error when hook system is not enabled', async () => {
      mockConfig.getHookSystem.mockReturnValue(null);

      const disableCmd = hooksCommand.subCommands!.find(
        (cmd) => cmd.name === 'disable',
      );
      if (!disableCmd?.action) {
        throw new Error('disable command must have an action');
      }

      const result = await disableCmd.action(mockContext, 'test-hook');

      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: 'Hook system is not enabled.',
      });
    });

    it('should return error when hook name is not provided', async () => {
      const disableCmd = hooksCommand.subCommands!.find(
        (cmd) => cmd.name === 'disable',
      );
      if (!disableCmd?.action) {
        throw new Error('disable command must have an action');
      }

      const result = await disableCmd.action(mockContext, '');

      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: 'Usage: /hooks disable <hook-name>',
      });
    });

    it('should disable a hook and update settings', async () => {
      mockContext.services.settings.merged.hooks = {
        disabled: [],
      };

      const disableCmd = hooksCommand.subCommands!.find(
        (cmd) => cmd.name === 'disable',
      );
      if (!disableCmd?.action) {
        throw new Error('disable command must have an action');
      }

      const result = await disableCmd.action(mockContext, 'test-hook');

      expect(mockContext.services.settings.setValue).toHaveBeenCalledWith(
        expect.any(String),
        'hooks.disabled',
        ['test-hook'],
      );
      expect(mockHookSystem.setHookEnabled).toHaveBeenCalledWith(
        'test-hook',
        false,
      );
      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: 'Hook "test-hook" disabled successfully.',
      });
    });

    it('should return info when hook is already disabled', async () => {
      // Update the context's settings with the hook already disabled
      mockContext.services.settings.merged.hooks = {
        disabled: ['test-hook'],
      };

      const disableCmd = hooksCommand.subCommands!.find(
        (cmd) => cmd.name === 'disable',
      );
      if (!disableCmd?.action) {
        throw new Error('disable command must have an action');
      }

      const result = await disableCmd.action(mockContext, 'test-hook');

      expect(mockContext.services.settings.setValue).not.toHaveBeenCalled();
      expect(mockHookSystem.setHookEnabled).not.toHaveBeenCalled();
      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: 'Hook "test-hook" is already disabled.',
      });
    });

    it('should handle error when disabling hook fails', async () => {
      mockContext.services.settings.merged.hooks = {
        disabled: [],
      };
      mockSettings.setValue.mockImplementationOnce(() => {
        throw new Error('Failed to save settings');
      });

      const disableCmd = hooksCommand.subCommands!.find(
        (cmd) => cmd.name === 'disable',
      );
      if (!disableCmd?.action) {
        throw new Error('disable command must have an action');
      }

      const result = await disableCmd.action(mockContext, 'test-hook');

      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: 'Failed to disable hook: Failed to save settings',
      });
    });
  });

  describe('completion', () => {
    it('should return empty array when config is not available', () => {
      const contextWithoutConfig = createMockCommandContext({
        services: {
          config: null,
        },
      });

      const enableCmd = hooksCommand.subCommands!.find(
        (cmd) => cmd.name === 'enable',
      );
      if (!enableCmd?.completion) {
        throw new Error('enable command must have completion');
      }

      const result = enableCmd.completion(contextWithoutConfig, 'test');
      expect(result).toEqual([]);
    });

    it('should return empty array when hook system is not enabled', () => {
      mockConfig.getHookSystem.mockReturnValue(null);

      const enableCmd = hooksCommand.subCommands!.find(
        (cmd) => cmd.name === 'enable',
      );
      if (!enableCmd?.completion) {
        throw new Error('enable command must have completion');
      }

      const result = enableCmd.completion(mockContext, 'test');
      expect(result).toEqual([]);
    });

    it('should return matching hook names', () => {
      const mockHooks: HookRegistryEntry[] = [
        createMockHook('test-hook-1', HookEventName.BeforeTool, true),
        createMockHook('test-hook-2', HookEventName.AfterTool, true),
        createMockHook('other-hook', HookEventName.AfterAgent, false),
      ];

      mockHookSystem.getAllHooks.mockReturnValue(mockHooks);

      const enableCmd = hooksCommand.subCommands!.find(
        (cmd) => cmd.name === 'enable',
      );
      if (!enableCmd?.completion) {
        throw new Error('enable command must have completion');
      }

      const result = enableCmd.completion(mockContext, 'test');
      expect(result).toEqual(['test-hook-1', 'test-hook-2']);
    });

    it('should return all hook names when partial is empty', () => {
      const mockHooks: HookRegistryEntry[] = [
        createMockHook('hook-1', HookEventName.BeforeTool, true),
        createMockHook('hook-2', HookEventName.AfterTool, true),
      ];

      mockHookSystem.getAllHooks.mockReturnValue(mockHooks);

      const enableCmd = hooksCommand.subCommands!.find(
        (cmd) => cmd.name === 'enable',
      );
      if (!enableCmd?.completion) {
        throw new Error('enable command must have completion');
      }

      const result = enableCmd.completion(mockContext, '');
      expect(result).toEqual(['hook-1', 'hook-2']);
    });

    it('should handle hooks without command name gracefully', () => {
      const mockHooks: HookRegistryEntry[] = [
        createMockHook('test-hook', HookEventName.BeforeTool, true),
        {
          ...createMockHook('', HookEventName.AfterTool, true),
          config: { command: '', type: HookType.Command, timeout: 30 },
        },
      ];

      mockHookSystem.getAllHooks.mockReturnValue(mockHooks);

      const enableCmd = hooksCommand.subCommands!.find(
        (cmd) => cmd.name === 'enable',
      );
      if (!enableCmd?.completion) {
        throw new Error('enable command must have completion');
      }

      const result = enableCmd.completion(mockContext, 'test');
      expect(result).toEqual(['test-hook']);
    });
  });
});

/**
 * Helper function to create a mock HookRegistryEntry
 */
function createMockHook(
  command: string,
  eventName: HookEventName,
  enabled: boolean,
): HookRegistryEntry {
  return {
    config: {
      command,
      type: HookType.Command,
      timeout: 30,
    },
    source: ConfigSource.Project,
    eventName,
    matcher: undefined,
    sequential: false,
    enabled,
  };
}
