/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import { HookRegistry, ConfigSource } from './hookRegistry.js';
import type { Storage } from '../config/storage.js';
import { HookEventName, HookType } from '../config/config.js';
import type { Config, HookDefinition } from '../config/config.js';

// Mock fs
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

// Mock console methods
const mockConsole = {
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

vi.stubGlobal('console', mockConsole);

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
      expect(mockConsole.log).toHaveBeenCalledWith(
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
                type: 'plugin',
                package: '@example/my-plugin',
                method: 'afterTool',
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
      expect(hooks[0].config.type).toBe(HookType.Plugin);
      expect(hooks[0].config.package).toBe('@example/my-plugin');
      expect(hooks[0].config.method).toBe('afterTool');
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
      expect(mockConsole.warn).toHaveBeenCalled();
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
              {
                type: 'plugin',
                // Missing package field
                method: 'beforeTool',
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
      expect(mockConsole.warn).toHaveBeenCalled(); // At least some warnings should be logged
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
                type: 'plugin',
                package: '@example/after-tool',
                method: 'afterTool',
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
      }).toThrow('Hook registry not initialized');
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
      expect(mockConsole.warn).toHaveBeenCalledWith(
        'No hooks found matching "non-existent-hook"',
      );
    });
  });
});
