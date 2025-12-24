/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import { HookRegistry } from './hookRegistry.js';
import type { Storage } from '../config/storage.js';
import { ConfigSource, HookEventName, HookType } from './types.js';
import type { Config } from '../config/config.js';
import type { HookDefinition } from './types.js';

// Mock fs
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

// Mock debugLogger using vi.hoisted
const mockDebugLogger = vi.hoisted(() => ({
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('../utils/debugLogger.js', () => ({
  debugLogger: mockDebugLogger,
}));

const { mockTrustedHooksManager, mockCoreEvents } = vi.hoisted(() => ({
  mockTrustedHooksManager: {
    getUntrustedHooks: vi.fn().mockReturnValue([]),
    trustHooks: vi.fn(),
  },
  mockCoreEvents: {
    emitConsoleLog: vi.fn(),
    emitFeedback: vi.fn(),
  },
}));

vi.mock('./trustedHooks.js', () => ({
  TrustedHooksManager: vi.fn(() => mockTrustedHooksManager),
}));

vi.mock('../utils/events.js', () => ({
  coreEvents: mockCoreEvents,
}));

describe('HookRegistry', () => {
  let hookRegistry: HookRegistry;
  let mockConfig: Config;
  let mockStorage: Storage;

  beforeEach(() => {
    vi.resetAllMocks();

    mockStorage = {
      getGeminiDir: vi.fn().mockReturnValue('/project/.gemini'),
    } as unknown as Storage;

    mockConfig = {
      storage: mockStorage,
      getExtensions: vi.fn().mockReturnValue([]),
      getHooks: vi.fn().mockReturnValue({}),
      getProjectHooks: vi.fn().mockReturnValue({}),
      getDisabledHooks: vi.fn().mockReturnValue([]),
      isTrustedFolder: vi.fn().mockReturnValue(true),
      getProjectRoot: vi.fn().mockReturnValue('/project'),
    } as unknown as Config;

    hookRegistry = new HookRegistry(mockConfig);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialize', () => {
    it('should initialize successfully with no hooks', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await hookRegistry.initialize();

      expect(hookRegistry.getAllHooks()).toHaveLength(0);
      expect(mockDebugLogger.log).toHaveBeenCalledWith(
        'Hook registry initialized with 0 hook entries',
      );
    });

    it('should not load hooks if folder is not trusted', async () => {
      vi.mocked(mockConfig.isTrustedFolder).mockReturnValue(false);
      const mockHooksConfig = {
        BeforeTool: [
          {
            hooks: [
              {
                type: 'command',
                command: './hooks/test.sh',
              },
            ],
          },
        ],
      };

      vi.mocked(mockConfig.getHooks).mockReturnValue(
        mockHooksConfig as unknown as {
          [K in HookEventName]?: HookDefinition[];
        },
      );

      await hookRegistry.initialize();

      expect(hookRegistry.getAllHooks()).toHaveLength(0);
      expect(mockDebugLogger.warn).toHaveBeenCalledWith(
        'Project hooks disabled because the folder is not trusted.',
      );
    });

    it('should load hooks from project configuration', async () => {
      const mockHooksConfig = {
        BeforeTool: [
          {
            matcher: 'EditTool',
            hooks: [
              {
                type: 'command',
                command: './hooks/check_style.sh',
                timeout: 60,
              },
            ],
          },
        ],
      };

      // Update mock to return the hooks configuration
      vi.mocked(mockConfig.getHooks).mockReturnValue(
        mockHooksConfig as unknown as {
          [K in HookEventName]?: HookDefinition[];
        },
      );

      await hookRegistry.initialize();

      const hooks = hookRegistry.getAllHooks();
      expect(hooks).toHaveLength(1);
      expect(hooks[0].eventName).toBe(HookEventName.BeforeTool);
      expect(hooks[0].config.type).toBe(HookType.Command);
      expect(hooks[0].config.command).toBe('./hooks/check_style.sh');
      expect(hooks[0].matcher).toBe('EditTool');
      expect(hooks[0].source).toBe(ConfigSource.Project);
    });

    it('should load plugin hooks', async () => {
      const mockHooksConfig = {
        AfterTool: [
          {
            hooks: [
              {
                type: 'command',
                command: './hooks/after-tool.sh',
                timeout: 30,
              },
            ],
          },
        ],
      };

      // Update mock to return the hooks configuration
      vi.mocked(mockConfig.getHooks).mockReturnValue(
        mockHooksConfig as unknown as {
          [K in HookEventName]?: HookDefinition[];
        },
      );

      await hookRegistry.initialize();

      const hooks = hookRegistry.getAllHooks();
      expect(hooks).toHaveLength(1);
      expect(hooks[0].eventName).toBe(HookEventName.AfterTool);
      expect(hooks[0].config.type).toBe(HookType.Command);
      expect(hooks[0].config.command).toBe('./hooks/after-tool.sh');
    });

    it('should handle invalid configuration gracefully', async () => {
      const invalidHooksConfig = {
        BeforeTool: [
          {
            hooks: [
              {
                type: 'invalid-type', // Invalid hook type
                command: './hooks/test.sh',
              },
            ],
          },
        ],
      };

      // Update mock to return invalid configuration
      vi.mocked(mockConfig.getHooks).mockReturnValue(
        invalidHooksConfig as unknown as {
          [K in HookEventName]?: HookDefinition[];
        },
      );

      await hookRegistry.initialize();

      expect(hookRegistry.getAllHooks()).toHaveLength(0);
      expect(mockDebugLogger.warn).toHaveBeenCalled();
    });

    it('should validate hook configurations', async () => {
      const mockHooksConfig = {
        BeforeTool: [
          {
            hooks: [
              {
                type: 'invalid',
                command: './hooks/test.sh',
              },
              {
                type: 'command',
                // Missing command field
              },
            ],
          },
        ],
      };

      // Update mock to return invalid configuration
      vi.mocked(mockConfig.getHooks).mockReturnValue(
        mockHooksConfig as unknown as {
          [K in HookEventName]?: HookDefinition[];
        },
      );

      await hookRegistry.initialize();

      expect(hookRegistry.getAllHooks()).toHaveLength(0);
      expect(mockDebugLogger.warn).toHaveBeenCalled(); // At least some warnings should be logged
    });

    it('should respect disabled hooks using friendly name', async () => {
      const mockHooksConfig = {
        BeforeTool: [
          {
            hooks: [
              {
                name: 'disabled-hook',
                type: 'command',
                command: './hooks/test.sh',
              },
            ],
          },
        ],
      };

      // Update mock to return the hooks configuration
      vi.mocked(mockConfig.getHooks).mockReturnValue(
        mockHooksConfig as unknown as {
          [K in HookEventName]?: HookDefinition[];
        },
      );
      vi.mocked(mockConfig.getDisabledHooks).mockReturnValue(['disabled-hook']);

      await hookRegistry.initialize();

      const hooks = hookRegistry.getAllHooks();
      expect(hooks).toHaveLength(1);
      expect(hooks[0].enabled).toBe(false);
      expect(
        hookRegistry.getHooksForEvent(HookEventName.BeforeTool),
      ).toHaveLength(0);
    });
  });

  describe('getHooksForEvent', () => {
    beforeEach(async () => {
      const mockHooksConfig = {
        BeforeTool: [
          {
            matcher: 'EditTool',
            hooks: [
              {
                type: 'command',
                command: './hooks/edit_check.sh',
              },
            ],
          },
          {
            hooks: [
              {
                type: 'command',
                command: './hooks/general_check.sh',
              },
            ],
          },
        ],
        AfterTool: [
          {
            hooks: [
              {
                type: 'command',
                command: './hooks/after-tool.sh',
              },
            ],
          },
        ],
      };

      // Update mock to return the hooks configuration
      vi.mocked(mockConfig.getHooks).mockReturnValue(
        mockHooksConfig as unknown as {
          [K in HookEventName]?: HookDefinition[];
        },
      );

      await hookRegistry.initialize();
    });

    it('should return hooks for specific event', () => {
      const beforeToolHooks = hookRegistry.getHooksForEvent(
        HookEventName.BeforeTool,
      );
      expect(beforeToolHooks).toHaveLength(2);

      const afterToolHooks = hookRegistry.getHooksForEvent(
        HookEventName.AfterTool,
      );
      expect(afterToolHooks).toHaveLength(1);
    });

    it('should return empty array for events with no hooks', () => {
      const notificationHooks = hookRegistry.getHooksForEvent(
        HookEventName.Notification,
      );
      expect(notificationHooks).toHaveLength(0);
    });
  });

  describe('setHookEnabled', () => {
    beforeEach(async () => {
      const mockHooksConfig = {
        BeforeTool: [
          {
            hooks: [
              {
                type: 'command',
                command: './hooks/test.sh',
              },
            ],
          },
        ],
      };

      // Update mock to return the hooks configuration
      vi.mocked(mockConfig.getHooks).mockReturnValue(
        mockHooksConfig as unknown as {
          [K in HookEventName]?: HookDefinition[];
        },
      );

      await hookRegistry.initialize();
    });

    it('should enable and disable hooks', () => {
      const hookName = './hooks/test.sh';

      // Initially enabled
      let hooks = hookRegistry.getHooksForEvent(HookEventName.BeforeTool);
      expect(hooks).toHaveLength(1);

      // Disable
      hookRegistry.setHookEnabled(hookName, false);
      hooks = hookRegistry.getHooksForEvent(HookEventName.BeforeTool);
      expect(hooks).toHaveLength(0);

      // Re-enable
      hookRegistry.setHookEnabled(hookName, true);
      hooks = hookRegistry.getHooksForEvent(HookEventName.BeforeTool);
      expect(hooks).toHaveLength(1);
    });

    it('should warn when hook not found', () => {
      hookRegistry.setHookEnabled('non-existent-hook', false);
      expect(mockDebugLogger.warn).toHaveBeenCalledWith(
        'No hooks found matching "non-existent-hook"',
      );
    });

    it('should prefer hook name over command for identification', async () => {
      const mockHooksConfig = {
        BeforeTool: [
          {
            hooks: [
              {
                name: 'friendly-name',
                type: 'command',
                command: './hooks/test.sh',
              },
            ],
          },
        ],
      };

      vi.mocked(mockConfig.getHooks).mockReturnValue(
        mockHooksConfig as unknown as {
          [K in HookEventName]?: HookDefinition[];
        },
      );

      await hookRegistry.initialize();

      // Should be enabled initially
      let hooks = hookRegistry.getHooksForEvent(HookEventName.BeforeTool);
      expect(hooks).toHaveLength(1);

      // Disable using friendly name
      hookRegistry.setHookEnabled('friendly-name', false);
      hooks = hookRegistry.getHooksForEvent(HookEventName.BeforeTool);
      expect(hooks).toHaveLength(0);

      // Identification by command should NOT work when name is present
      hookRegistry.setHookEnabled('./hooks/test.sh', true);
      expect(mockDebugLogger.warn).toHaveBeenCalledWith(
        'No hooks found matching "./hooks/test.sh"',
      );
    });

    it('should use command as identifier when name is missing', async () => {
      const mockHooksConfig = {
        BeforeTool: [
          {
            hooks: [
              {
                type: 'command',
                command: './hooks/no-name.sh',
              },
            ],
          },
        ],
      };

      vi.mocked(mockConfig.getHooks).mockReturnValue(
        mockHooksConfig as unknown as {
          [K in HookEventName]?: HookDefinition[];
        },
      );

      await hookRegistry.initialize();

      // Should be enabled initially
      let hooks = hookRegistry.getHooksForEvent(HookEventName.BeforeTool);
      expect(hooks).toHaveLength(1);

      // Disable using command
      hookRegistry.setHookEnabled('./hooks/no-name.sh', false);
      hooks = hookRegistry.getHooksForEvent(HookEventName.BeforeTool);
      expect(hooks).toHaveLength(0);
    });
  });

  describe('malformed configuration handling', () => {
    it('should handle non-array definitions gracefully', async () => {
      const malformedConfig = {
        BeforeTool: 'not-an-array', // Should be an array of HookDefinition
      };

      vi.mocked(mockConfig.getHooks).mockReturnValue(
        malformedConfig as unknown as {
          [K in HookEventName]?: HookDefinition[];
        },
      );

      await hookRegistry.initialize();

      expect(hookRegistry.getAllHooks()).toHaveLength(0);
      expect(mockDebugLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('is not an array'),
      );
    });

    it('should handle object instead of array for definitions', async () => {
      const malformedConfig = {
        AfterTool: { hooks: [] }, // Should be an array, not a single object
      };

      vi.mocked(mockConfig.getHooks).mockReturnValue(
        malformedConfig as unknown as {
          [K in HookEventName]?: HookDefinition[];
        },
      );

      await hookRegistry.initialize();

      expect(hookRegistry.getAllHooks()).toHaveLength(0);
      expect(mockDebugLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('is not an array'),
      );
    });

    it('should handle null definition gracefully', async () => {
      const malformedConfig = {
        BeforeTool: [null], // Invalid: null definition
      };

      vi.mocked(mockConfig.getHooks).mockReturnValue(
        malformedConfig as unknown as {
          [K in HookEventName]?: HookDefinition[];
        },
      );

      await hookRegistry.initialize();

      expect(hookRegistry.getAllHooks()).toHaveLength(0);
      expect(mockDebugLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Discarding invalid hook definition'),
        null,
      );
    });

    it('should handle definition without hooks array', async () => {
      const malformedConfig = {
        BeforeTool: [
          {
            matcher: 'EditTool',
            // Missing hooks array
          },
        ],
      };

      vi.mocked(mockConfig.getHooks).mockReturnValue(
        malformedConfig as unknown as {
          [K in HookEventName]?: HookDefinition[];
        },
      );

      await hookRegistry.initialize();

      expect(hookRegistry.getAllHooks()).toHaveLength(0);
      expect(mockDebugLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Discarding invalid hook definition'),
        expect.objectContaining({ matcher: 'EditTool' }),
      );
    });

    it('should handle non-array hooks property', async () => {
      const malformedConfig = {
        BeforeTool: [
          {
            matcher: 'EditTool',
            hooks: 'not-an-array', // Should be an array
          },
        ],
      };

      vi.mocked(mockConfig.getHooks).mockReturnValue(
        malformedConfig as unknown as {
          [K in HookEventName]?: HookDefinition[];
        },
      );

      await hookRegistry.initialize();

      expect(hookRegistry.getAllHooks()).toHaveLength(0);
      expect(mockDebugLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Discarding invalid hook definition'),
        expect.objectContaining({ hooks: 'not-an-array', matcher: 'EditTool' }),
      );
    });

    it('should handle non-object hookConfig in hooks array', async () => {
      const malformedConfig = {
        BeforeTool: [
          {
            hooks: [
              'not-an-object', // Should be an object
              42, // Should be an object
              null, // Should be an object
            ],
          },
        ],
      };
      mockTrustedHooksManager.getUntrustedHooks.mockReturnValue([]);

      vi.mocked(mockConfig.getHooks).mockReturnValue(
        malformedConfig as unknown as {
          [K in HookEventName]?: HookDefinition[];
        },
      );

      await hookRegistry.initialize();

      expect(hookRegistry.getAllHooks()).toHaveLength(0);
      expect(mockDebugLogger.warn).toHaveBeenCalledTimes(3); // One warning for each invalid hookConfig
    });

    it('should handle mixed valid and invalid hook configurations', async () => {
      const mixedConfig = {
        BeforeTool: [
          {
            hooks: [
              {
                type: 'command',
                command: './valid-hook.sh',
              },
              'invalid-string',
              {
                type: 'invalid-type',
                command: './invalid-type.sh',
              },
            ],
          },
        ],
      };

      vi.mocked(mockConfig.getHooks).mockReturnValue(
        mixedConfig as unknown as {
          [K in HookEventName]?: HookDefinition[];
        },
      );

      await hookRegistry.initialize();

      // Should only load the valid hook
      const hooks = hookRegistry.getAllHooks();
      expect(hooks).toHaveLength(1);
      expect(hooks[0].config.command).toBe('./valid-hook.sh');

      // Verify the warnings for invalid configurations
      // 1st warning: non-object hookConfig ('invalid-string')
      expect(mockDebugLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Discarding invalid hook configuration'),
        'invalid-string',
      );
      // 2nd warning: validateHookConfig logs invalid type
      expect(mockDebugLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Invalid hook BeforeTool from project type'),
      );
      // 3rd warning: processHookDefinition logs the failed hookConfig
      expect(mockDebugLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Discarding invalid hook configuration'),
        expect.objectContaining({ type: 'invalid-type' }),
      );
    });
  });

  describe('project hook warnings', () => {
    it('should check for untrusted project hooks when folder is trusted', async () => {
      const projectHooks = {
        BeforeTool: [
          {
            hooks: [
              {
                type: 'command',
                command: './hooks/untrusted.sh',
              },
            ],
          },
        ],
      };

      vi.mocked(mockConfig.getHooks).mockReturnValue(
        projectHooks as unknown as { [K in HookEventName]?: HookDefinition[] },
      );
      vi.mocked(mockConfig.getProjectHooks).mockReturnValue(
        projectHooks as unknown as { [K in HookEventName]?: HookDefinition[] },
      );

      // Simulate untrusted hooks found
      mockTrustedHooksManager.getUntrustedHooks.mockReturnValue([
        './hooks/untrusted.sh',
      ]);

      await hookRegistry.initialize();

      expect(mockTrustedHooksManager.getUntrustedHooks).toHaveBeenCalledWith(
        '/project',
        projectHooks,
      );
      expect(mockCoreEvents.emitFeedback).toHaveBeenCalledWith(
        'warning',
        expect.stringContaining(
          'WARNING: The following project-level hooks have been detected',
        ),
      );
      expect(mockTrustedHooksManager.trustHooks).toHaveBeenCalledWith(
        '/project',
        projectHooks,
      );
    });

    it('should not warn if hooks are already trusted', async () => {
      const projectHooks = {
        BeforeTool: [
          {
            hooks: [
              {
                type: 'command',
                command: './hooks/trusted.sh',
              },
            ],
          },
        ],
      };

      vi.mocked(mockConfig.getHooks).mockReturnValue(
        projectHooks as unknown as { [K in HookEventName]?: HookDefinition[] },
      );
      vi.mocked(mockConfig.getProjectHooks).mockReturnValue(
        projectHooks as unknown as { [K in HookEventName]?: HookDefinition[] },
      );

      // Simulate no untrusted hooks
      mockTrustedHooksManager.getUntrustedHooks.mockReturnValue([]);

      await hookRegistry.initialize();

      expect(mockCoreEvents.emitFeedback).not.toHaveBeenCalled();
      expect(mockTrustedHooksManager.trustHooks).not.toHaveBeenCalled();
    });

    it('should not check for untrusted hooks if folder is not trusted', async () => {
      vi.mocked(mockConfig.isTrustedFolder).mockReturnValue(false);

      await hookRegistry.initialize();

      expect(mockTrustedHooksManager.getUntrustedHooks).not.toHaveBeenCalled();
    });
  });
});
