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
import { SettingScope } from '../../config/settings.js';

describe('hooksCommand', () => {
  let mockContext: CommandContext;
  let mockHookSystem: {
    getAllHooks: ReturnType<typeof vi.fn>;
    setHookEnabled: ReturnType<typeof vi.fn>;
    getRegistry: ReturnType<typeof vi.fn>;
  };
  let mockConfig: {
    getHookSystem: ReturnType<typeof vi.fn>;
    getEnableHooks: ReturnType<typeof vi.fn>;
    updateDisabledHooks: ReturnType<typeof vi.fn>;
  };
  let mockSettings: {
    merged: {
      hooksConfig?: {
        disabled?: string[];
      };
    };
    setValue: ReturnType<typeof vi.fn>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    workspace: { path: string; settings: any };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    user: { path: string; settings: any };
    forScope: ReturnType<typeof vi.fn>;
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
      getEnableHooks: vi.fn().mockReturnValue(true),
      updateDisabledHooks: vi.fn(),
    };

    // Create mock settings
    const mockUser = {
      path: '/mock/user.json',
      settings: { hooksConfig: { disabled: [] } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    const mockWorkspace = {
      path: '/mock/workspace.json',
      settings: { hooksConfig: { disabled: [] } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    mockSettings = {
      merged: {
        hooksConfig: {
          disabled: [],
        },
      },
      setValue: vi.fn(),
      workspace: mockWorkspace,
      user: mockUser,
      forScope: vi.fn((scope) => {
        if (scope === SettingScope.User) return mockUser;
        if (scope === SettingScope.Workspace) return mockWorkspace;
        return mockUser;
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

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
      expect(hooksCommand.subCommands).toHaveLength(5);

      const subCommandNames = hooksCommand.subCommands!.map((cmd) => cmd.name);
      expect(subCommandNames).toContain('panel');
      expect(subCommandNames).toContain('enable');
      expect(subCommandNames).toContain('disable');
      expect(subCommandNames).toContain('enable-all');
      expect(subCommandNames).toContain('disable-all');
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

    it('should display panel even when hook system is not enabled', async () => {
      mockConfig.getHookSystem.mockReturnValue(null);

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
          hooks: [],
        }),
      );
    });

    it('should display panel when no hooks are configured', async () => {
      mockHookSystem.getAllHooks.mockReturnValue([]);
      (mockContext.services.settings.merged as Record<string, unknown>)[
        'hooksConfig'
      ] = { enabled: true };

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
          hooks: [],
        }),
      );
    });

    it('should display hooks list when hooks are configured', async () => {
      const mockHooks: HookRegistryEntry[] = [
        createMockHook('echo-test', HookEventName.BeforeTool, true),
        createMockHook('notify', HookEventName.AfterAgent, false),
      ];

      mockHookSystem.getAllHooks.mockReturnValue(mockHooks);
      (mockContext.services.settings.merged as Record<string, unknown>)[
        'hooksConfig'
      ] = { enabled: true };

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
      // Update the user settings with disabled hooks
      mockSettings.user.settings.hooksConfig.disabled = [
        'test-hook',
        'other-hook',
      ];
      mockSettings.workspace.settings.hooksConfig.disabled = [];

      const enableCmd = hooksCommand.subCommands!.find(
        (cmd) => cmd.name === 'enable',
      );
      if (!enableCmd?.action) {
        throw new Error('enable command must have an action');
      }

      const result = await enableCmd.action(mockContext, 'test-hook');

      expect(mockContext.services.settings.setValue).toHaveBeenCalledWith(
        SettingScope.User,
        'hooksConfig.disabled',
        ['other-hook'],
      );
      expect(mockHookSystem.setHookEnabled).toHaveBeenCalledWith(
        'test-hook',
        true,
      );
      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content:
          'Hook "test-hook" enabled by removing it from the disabled list in user (/mock/user.json) and workspace (/mock/workspace.json) settings.',
      });
    });

    it('should complete hook names using friendly names', () => {
      const enableCmd = hooksCommand.subCommands!.find(
        (cmd) => cmd.name === 'enable',
      )!;

      const hookEntry = createMockHook(
        './hooks/test.sh',
        HookEventName.BeforeTool,
        false, // Must be disabled for enable completion
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
      // Ensure not disabled anywhere
      mockSettings.workspace.settings.hooksConfig.disabled = [];
      mockSettings.user.settings.hooksConfig.disabled = [];

      const disableCmd = hooksCommand.subCommands!.find(
        (cmd) => cmd.name === 'disable',
      );
      if (!disableCmd?.action) {
        throw new Error('disable command must have an action');
      }

      const result = await disableCmd.action(mockContext, 'test-hook');

      // Should default to workspace if present
      expect(mockContext.services.settings.setValue).toHaveBeenCalledWith(
        SettingScope.Workspace,
        'hooksConfig.disabled',
        ['test-hook'],
      );
      expect(mockHookSystem.setHookEnabled).toHaveBeenCalledWith(
        'test-hook',
        false,
      );
      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content:
          'Hook "test-hook" disabled by adding it to the disabled list in workspace (/mock/workspace.json) settings.',
      });
    });

    it('should return info when hook is already disabled', async () => {
      // Update the context's settings with the hook already disabled in Workspace
      mockSettings.workspace.settings.hooksConfig.disabled = ['test-hook'];

      const disableCmd = hooksCommand.subCommands!.find(
        (cmd) => cmd.name === 'disable',
      );
      if (!disableCmd?.action) {
        throw new Error('disable command must have an action');
      }

      const result = await disableCmd.action(mockContext, 'test-hook');

      expect(mockContext.services.settings.setValue).not.toHaveBeenCalled();
      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: 'Hook "test-hook" is already disabled.',
      });
    });

    it('should complete hook names using friendly names', () => {
      const disableCmd = hooksCommand.subCommands!.find(
        (cmd) => cmd.name === 'disable',
      )!;

      const hookEntry = createMockHook(
        './hooks/test.sh',
        HookEventName.BeforeTool,
        true, // Must be enabled for disable completion
      );
      hookEntry.config.name = 'friendly-name';

      mockHookSystem.getAllHooks.mockReturnValue([hookEntry]);

      const completions = disableCmd.completion!(mockContext, 'frie');
      expect(completions).toContain('friendly-name');
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

    it('should return matching hook names based on status', () => {
      const mockHooks: HookRegistryEntry[] = [
        createMockHook('test-hook-enabled', HookEventName.BeforeTool, true),
        createMockHook('test-hook-disabled', HookEventName.AfterTool, false),
      ];

      mockHookSystem.getAllHooks.mockReturnValue(mockHooks);

      const enableCmd = hooksCommand.subCommands!.find(
        (cmd) => cmd.name === 'enable',
      )!;
      const disableCmd = hooksCommand.subCommands!.find(
        (cmd) => cmd.name === 'disable',
      )!;

      const enableResult = enableCmd.completion!(mockContext, 'test');
      expect(enableResult).toEqual(['test-hook-disabled']);

      const disableResult = disableCmd.completion!(mockContext, 'test');
      expect(disableResult).toEqual(['test-hook-enabled']);
    });

    it('should return all relevant hook names when partial is empty', () => {
      const mockHooks: HookRegistryEntry[] = [
        createMockHook('hook-enabled', HookEventName.BeforeTool, true),
        createMockHook('hook-disabled', HookEventName.AfterTool, false),
      ];

      mockHookSystem.getAllHooks.mockReturnValue(mockHooks);

      const enableCmd = hooksCommand.subCommands!.find(
        (cmd) => cmd.name === 'enable',
      )!;
      const disableCmd = hooksCommand.subCommands!.find(
        (cmd) => cmd.name === 'disable',
      )!;

      expect(enableCmd.completion!(mockContext, '')).toEqual(['hook-disabled']);
      expect(disableCmd.completion!(mockContext, '')).toEqual(['hook-enabled']);
    });

    it('should handle hooks without command name gracefully', () => {
      const mockHooks: HookRegistryEntry[] = [
        createMockHook('test-hook', HookEventName.BeforeTool, false),
        {
          ...createMockHook('', HookEventName.AfterTool, false),
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

  describe('enable-all subcommand', () => {
    it('should return error when config is not loaded', async () => {
      const contextWithoutConfig = createMockCommandContext({
        services: {
          config: null,
        },
      });

      const enableAllCmd = hooksCommand.subCommands!.find(
        (cmd) => cmd.name === 'enable-all',
      );
      if (!enableAllCmd?.action) {
        throw new Error('enable-all command must have an action');
      }

      const result = await enableAllCmd.action(contextWithoutConfig, '');

      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: 'Config not loaded.',
      });
    });

    it('should return error when hook system is not enabled', async () => {
      mockConfig.getHookSystem.mockReturnValue(null);

      const enableAllCmd = hooksCommand.subCommands!.find(
        (cmd) => cmd.name === 'enable-all',
      );
      if (!enableAllCmd?.action) {
        throw new Error('enable-all command must have an action');
      }

      const result = await enableAllCmd.action(mockContext, '');

      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: 'Hook system is not enabled.',
      });
    });

    it('should enable all disabled hooks', async () => {
      const mockHooks = [
        createMockHook('hook-1', HookEventName.BeforeTool, false),
        createMockHook('hook-2', HookEventName.AfterTool, false),
        createMockHook('hook-3', HookEventName.BeforeAgent, true), // already enabled
      ];
      mockHookSystem.getAllHooks.mockReturnValue(mockHooks);

      const enableAllCmd = hooksCommand.subCommands!.find(
        (cmd) => cmd.name === 'enable-all',
      );
      if (!enableAllCmd?.action) {
        throw new Error('enable-all command must have an action');
      }

      const result = await enableAllCmd.action(mockContext, '');

      expect(mockContext.services.settings.setValue).toHaveBeenCalledWith(
        expect.any(String), // enableAll uses legacy logic so it might return 'Workspace' or 'User' depending on ternary
        'hooksConfig.disabled',
        [],
      );
      expect(mockHookSystem.setHookEnabled).toHaveBeenCalledWith(
        'hook-1',
        true,
      );
      expect(mockHookSystem.setHookEnabled).toHaveBeenCalledWith(
        'hook-2',
        true,
      );
      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: 'Enabled 2 hook(s) successfully.',
      });
    });

    it('should return info when no hooks are configured', async () => {
      mockHookSystem.getAllHooks.mockReturnValue([]);

      const enableAllCmd = hooksCommand.subCommands!.find(
        (cmd) => cmd.name === 'enable-all',
      );
      if (!enableAllCmd?.action) {
        throw new Error('enable-all command must have an action');
      }

      const result = await enableAllCmd.action(mockContext, '');

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: 'No hooks configured.',
      });
    });

    it('should return info when all hooks are already enabled', async () => {
      const mockHooks = [
        createMockHook('hook-1', HookEventName.BeforeTool, true),
        createMockHook('hook-2', HookEventName.AfterTool, true),
      ];
      mockHookSystem.getAllHooks.mockReturnValue(mockHooks);

      const enableAllCmd = hooksCommand.subCommands!.find(
        (cmd) => cmd.name === 'enable-all',
      );
      if (!enableAllCmd?.action) {
        throw new Error('enable-all command must have an action');
      }

      const result = await enableAllCmd.action(mockContext, '');

      expect(mockContext.services.settings.setValue).not.toHaveBeenCalled();
      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: 'All hooks are already enabled.',
      });
    });
  });

  describe('disable-all subcommand', () => {
    it('should return error when config is not loaded', async () => {
      const contextWithoutConfig = createMockCommandContext({
        services: {
          config: null,
        },
      });

      const disableAllCmd = hooksCommand.subCommands!.find(
        (cmd) => cmd.name === 'disable-all',
      );
      if (!disableAllCmd?.action) {
        throw new Error('disable-all command must have an action');
      }

      const result = await disableAllCmd.action(contextWithoutConfig, '');

      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: 'Config not loaded.',
      });
    });

    it('should return error when hook system is not enabled', async () => {
      mockConfig.getHookSystem.mockReturnValue(null);

      const disableAllCmd = hooksCommand.subCommands!.find(
        (cmd) => cmd.name === 'disable-all',
      );
      if (!disableAllCmd?.action) {
        throw new Error('disable-all command must have an action');
      }

      const result = await disableAllCmd.action(mockContext, '');

      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: 'Hook system is not enabled.',
      });
    });

    it('should disable all enabled hooks', async () => {
      const mockHooks = [
        createMockHook('hook-1', HookEventName.BeforeTool, true),
        createMockHook('hook-2', HookEventName.AfterTool, true),
        createMockHook('hook-3', HookEventName.BeforeAgent, false), // already disabled
      ];
      mockHookSystem.getAllHooks.mockReturnValue(mockHooks);

      const disableAllCmd = hooksCommand.subCommands!.find(
        (cmd) => cmd.name === 'disable-all',
      );
      if (!disableAllCmd?.action) {
        throw new Error('disable-all command must have an action');
      }

      const result = await disableAllCmd.action(mockContext, '');

      expect(mockContext.services.settings.setValue).toHaveBeenCalledWith(
        expect.any(String),
        'hooksConfig.disabled',
        ['hook-1', 'hook-2', 'hook-3'],
      );
      expect(mockHookSystem.setHookEnabled).toHaveBeenCalledWith(
        'hook-1',
        false,
      );
      expect(mockHookSystem.setHookEnabled).toHaveBeenCalledWith(
        'hook-2',
        false,
      );
      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: 'Disabled 2 hook(s) successfully.',
      });
    });

    it('should return info when no hooks are configured', async () => {
      mockHookSystem.getAllHooks.mockReturnValue([]);

      const disableAllCmd = hooksCommand.subCommands!.find(
        (cmd) => cmd.name === 'disable-all',
      );
      if (!disableAllCmd?.action) {
        throw new Error('disable-all command must have an action');
      }

      const result = await disableAllCmd.action(mockContext, '');

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: 'No hooks configured.',
      });
    });

    it('should return info when all hooks are already disabled', async () => {
      const mockHooks = [
        createMockHook('hook-1', HookEventName.BeforeTool, false),
        createMockHook('hook-2', HookEventName.AfterTool, false),
      ];
      mockHookSystem.getAllHooks.mockReturnValue(mockHooks);

      const disableAllCmd = hooksCommand.subCommands!.find(
        (cmd) => cmd.name === 'disable-all',
      );
      if (!disableAllCmd?.action) {
        throw new Error('disable-all command must have an action');
      }

      const result = await disableAllCmd.action(mockContext, '');

      expect(mockContext.services.settings.setValue).not.toHaveBeenCalled();
      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: 'All hooks are already disabled.',
      });
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
