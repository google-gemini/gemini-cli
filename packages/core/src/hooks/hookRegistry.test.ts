/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import {
  HookRegistry,
  ConfigSource,
  HookRegistryNotInitializedError,
} from './hookRegistry.js';
import type { Storage } from '../config/storage.js';
import { HookEventName, HookType } from './types.js';
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

    it('should throw error if not initialized', () => {
      const uninitializedRegistry = new HookRegistry(mockConfig);

      expect(() => {
        uninitializedRegistry.getHooksForEvent(HookEventName.BeforeTool);
      }).toThrow(HookRegistryNotInitializedError);
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
});
