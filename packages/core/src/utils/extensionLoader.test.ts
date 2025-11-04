/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { SimpleExtensionLoader } from './extensionLoader.js';
import type { Config } from '../config/config.js';
import { type McpClientManager } from '../tools/mcp-client-manager.js';

describe('SimpleExtensionLoader', () => {
  let mockConfig: Config;
  let extensionReloadingEnabled: boolean;
  let mockMcpClientManager: McpClientManager;
  const activeExtension = {
    name: 'test-extension',
    isActive: true,
    version: '1.0.0',
    path: '/path/to/extension',
    contextFiles: [],
    id: '123',
  };
  const inactiveExtension = {
    name: 'test-extension',
    isActive: false,
    version: '1.0.0',
    path: '/path/to/extension',
    contextFiles: [],
    id: '123',
  };

  beforeEach(() => {
    mockMcpClientManager = {
      startExtension: vi.fn(),
      stopExtension: vi.fn(),
    } as unknown as McpClientManager;
    extensionReloadingEnabled = false;
    mockConfig = {
      getMcpClientManager: () => mockMcpClientManager,
      getEnableExtensionReloading: () => extensionReloadingEnabled,
    } as unknown as Config;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should start active extensions', async () => {
    const loader = new SimpleExtensionLoader([activeExtension]);
    await loader.start(mockConfig);
    expect(mockMcpClientManager.startExtension).toHaveBeenCalledExactlyOnceWith(
      activeExtension,
    );
  });

  it('should not start inactive extensions', async () => {
    const loader = new SimpleExtensionLoader([inactiveExtension]);
    await loader.start(mockConfig);
    expect(mockMcpClientManager.startExtension).not.toHaveBeenCalled();
  });

  describe('interactive extension loading and unloading', () => {
    it('should not call `start` or `stop` if the loader is not already started', async () => {
      const loader = new SimpleExtensionLoader([]);
      await loader.loadExtension(activeExtension);
      expect(mockMcpClientManager.startExtension).not.toHaveBeenCalled();
      await loader.unloadExtension(activeExtension);
      expect(mockMcpClientManager.stopExtension).not.toHaveBeenCalled();
    });

    it('should start extensions that were explicitly loaded prior to initializing the loader', async () => {
      const loader = new SimpleExtensionLoader([]);
      await loader.loadExtension(activeExtension);
      expect(mockMcpClientManager.startExtension).not.toHaveBeenCalled();
      await loader.start(mockConfig);
      expect(
        mockMcpClientManager.startExtension,
      ).toHaveBeenCalledExactlyOnceWith(activeExtension);
    });

    it.each([true, false])(
      'should only call `start` and `stop` if extension reloading is enabled ($i)',
      async (reloadingEnabled) => {
        extensionReloadingEnabled = reloadingEnabled;
        const loader = new SimpleExtensionLoader([]);
        await loader.start(mockConfig);
        expect(mockMcpClientManager.startExtension).not.toHaveBeenCalled();
        await loader.loadExtension(activeExtension);
        if (reloadingEnabled) {
          expect(
            mockMcpClientManager.startExtension,
          ).toHaveBeenCalledExactlyOnceWith(activeExtension);
        } else {
          expect(mockMcpClientManager.startExtension).not.toHaveBeenCalled();
        }
        await loader.unloadExtension(activeExtension);
        if (reloadingEnabled) {
          expect(
            mockMcpClientManager.stopExtension,
          ).toHaveBeenCalledExactlyOnceWith(activeExtension);
        } else {
          expect(mockMcpClientManager.stopExtension).not.toHaveBeenCalled();
        }
      },
    );
  });
});
