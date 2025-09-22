/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PluginManager } from './pluginManager.js';
import type { HookConfig, Config } from '../config/config.js';
import type { Logger } from '@opentelemetry/api-logs';
import { HookType } from '../config/config.js';
import type { ApiVersion, Plugin } from './types.js';

// Mock console methods
const mockConsole = {
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

vi.stubGlobal('console', mockConsole);

describe('PluginManager', () => {
  let pluginManager: PluginManager;
  let mockConfig: Config;
  let mockLogger: Logger;

  const mockPlugin: Plugin = {
    apiVersion: '1.0',
    name: 'test-plugin',
    activate: vi.fn(),
    deactivate: vi.fn(),
    hooks: {
      beforeTool: vi.fn(),
      afterTool: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.resetAllMocks();

    mockConfig = {
      getWorkingDir: vi.fn().mockReturnValue('/test/project'),
    } as unknown as Config;

    mockLogger = {} as Logger;

    pluginManager = new PluginManager(mockConfig, mockLogger);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('loadPlugin', () => {
    it('should load a valid plugin', async () => {
      // Mock dynamic import
      vi.doMock('test-plugin', () => ({
        default: mockPlugin,
      }));

      const instance = await pluginManager.loadPlugin('test-plugin');

      expect(instance).toBeDefined();
      expect(instance?.plugin.name).toBe('test-plugin');
      expect(instance?.packageName).toBe('test-plugin');
      expect(instance?.activated).toBe(false);
    });

    it('should return existing plugin if already loaded', async () => {
      vi.doMock('test-plugin', () => ({
        default: mockPlugin,
      }));

      const instance1 = await pluginManager.loadPlugin('test-plugin');
      const instance2 = await pluginManager.loadPlugin('test-plugin');

      expect(instance1).toBe(instance2);
    });

    it('should reject plugin with unsupported API version', async () => {
      const invalidPlugin = {
        ...mockPlugin,
        apiVersion: '2.0' as ApiVersion,
      };

      vi.doMock('invalid-plugin', () => ({
        default: invalidPlugin,
      }));

      const instance = await pluginManager.loadPlugin('invalid-plugin');

      expect(instance).toBeUndefined();
      expect(mockConsole.warn).toHaveBeenCalledWith(
        'Unsupported API version 2.0 for plugin: invalid-plugin',
      );
    });

    it('should reject invalid plugin structure', async () => {
      const invalidPlugin = {
        name: 'invalid',
        // Missing required fields
      };

      vi.doMock('invalid-structure', () => ({
        default: invalidPlugin,
      }));

      const instance = await pluginManager.loadPlugin('invalid-structure');

      expect(instance).toBeUndefined();
      expect(mockConsole.warn).toHaveBeenCalledWith(
        'Failed to import plugin: invalid-structure',
      );
    });

    it('should handle import errors gracefully', async () => {
      const instance = await pluginManager.loadPlugin('non-existent-plugin');

      expect(instance).toBeUndefined();
      expect(mockConsole.error).toHaveBeenCalled();
    });
  });

  describe('activatePlugin', () => {
    beforeEach(async () => {
      vi.doMock('test-plugin', () => ({
        default: mockPlugin,
      }));

      await pluginManager.loadPlugin('test-plugin');
    });

    it('should activate a loaded plugin', async () => {
      const result = await pluginManager.activatePlugin('test-plugin');

      expect(result).toBe(true);
      expect(mockPlugin.activate).toHaveBeenCalledWith(
        expect.objectContaining({
          logger: mockLogger,
          config: mockConfig,
          http: expect.any(Object),
        }),
      );
      expect(mockConsole.log).toHaveBeenCalledWith(
        'Successfully activated plugin: test-plugin',
      );
    });

    it('should return true if plugin already activated', async () => {
      await pluginManager.activatePlugin('test-plugin');
      const result = await pluginManager.activatePlugin('test-plugin');

      expect(result).toBe(true);
      expect(mockPlugin.activate).toHaveBeenCalledTimes(1);
    });

    it('should handle activation errors', async () => {
      vi.mocked(mockPlugin.activate).mockRejectedValue(
        new Error('Activation failed'),
      );

      const result = await pluginManager.activatePlugin('test-plugin');

      expect(result).toBe(false);
      expect(mockConsole.error).toHaveBeenCalled();
    });

    it('should warn for non-existent plugin', async () => {
      const result = await pluginManager.activatePlugin('non-existent');

      expect(result).toBe(false);
      expect(mockConsole.warn).toHaveBeenCalledWith(
        'Plugin not loaded: non-existent',
      );
    });
  });

  describe('deactivatePlugin', () => {
    beforeEach(async () => {
      vi.doMock('test-plugin', () => ({
        default: mockPlugin,
      }));

      await pluginManager.loadPlugin('test-plugin');
      await pluginManager.activatePlugin('test-plugin');
    });

    it('should deactivate an active plugin', async () => {
      const result = await pluginManager.deactivatePlugin('test-plugin');

      expect(result).toBe(true);
      expect(mockPlugin.deactivate).toHaveBeenCalledWith(
        expect.objectContaining({
          logger: mockLogger,
          config: mockConfig,
          http: expect.any(Object),
        }),
      );
      expect(mockConsole.log).toHaveBeenCalledWith(
        'Successfully deactivated plugin: test-plugin',
      );
    });

    it('should handle deactivation errors', async () => {
      // Ensure deactivate exists before mocking
      expect(mockPlugin.deactivate).toBeDefined();

      // Type assertion needed since deactivate is possibly undefined
      vi.mocked(mockPlugin.deactivate!).mockRejectedValue(
        new Error('Deactivation failed'),
      );

      const result = await pluginManager.deactivatePlugin('test-plugin');

      expect(result).toBe(false);
      expect(mockConsole.error).toHaveBeenCalled();
    });
  });

  describe('ensurePluginReady', () => {
    it('should load and activate plugin for plugin hook config', async () => {
      vi.doMock('test-plugin', () => ({
        default: mockPlugin,
      }));

      const hookConfig: HookConfig = {
        type: HookType.Plugin,
        package: 'test-plugin',
        method: 'beforeTool',
      };

      const instance = await pluginManager.ensurePluginReady(hookConfig);

      expect(instance).toBeDefined();
      expect(instance!.activated).toBe(true);
      expect(mockPlugin.activate).toHaveBeenCalled();
    });

    it('should return undefined for non-plugin hook config', async () => {
      const hookConfig: HookConfig = {
        type: HookType.Command,
        command: './test.sh',
      };

      const instance = await pluginManager.ensurePluginReady(hookConfig);

      expect(instance).toBeUndefined();
    });

    it('should return undefined if plugin fails to load', async () => {
      const hookConfig: HookConfig = {
        type: HookType.Plugin,
        package: 'non-existent-plugin',
        method: 'beforeTool',
      };

      const instance = await pluginManager.ensurePluginReady(hookConfig);

      expect(instance).toBeUndefined();
    });
  });

  describe('deactivateAllPlugins', () => {
    it('should deactivate all loaded plugins', async () => {
      vi.doMock('plugin1', () => ({
        default: { ...mockPlugin, name: 'plugin1' },
      }));
      vi.doMock('plugin2', () => ({
        default: { ...mockPlugin, name: 'plugin2' },
      }));

      await pluginManager.loadPlugin('plugin1');
      await pluginManager.loadPlugin('plugin2');
      await pluginManager.activatePlugin('plugin1');
      await pluginManager.activatePlugin('plugin2');

      await pluginManager.deactivateAllPlugins();

      const plugins = pluginManager.getAllPlugins();
      expect(plugins.every((p) => !p.activated)).toBe(true);
    });
  });
});
