/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  expect,
  it,
  vi,
  beforeEach,
  afterEach,
  type MockInstance,
} from 'vitest';
import { SimpleExtensionLoader } from './extensionLoader.js';
import type { Config, GeminiCLIExtension } from '../config/config.js';
import { type McpClientManager } from '../tools/mcp-client-manager.js';
import type { GeminiClient } from '../core/client.js';

const mockRefreshServerHierarchicalMemory = vi.hoisted(() => vi.fn());

vi.mock('./memoryDiscovery.js', async (importActual) => {
  const actual = await importActual<typeof import('./memoryDiscovery.js')>();
  return {
    ...actual,
    refreshServerHierarchicalMemory: mockRefreshServerHierarchicalMemory,
  };
});

describe('SimpleExtensionLoader', () => {
  let mockConfig: Config;
  let extensionReloadingEnabled: boolean;
  let mockMcpClientManager: McpClientManager;
  let mockGeminiClientSetTools: MockInstance<
    typeof GeminiClient.prototype.setTools
  >;

  const activeExtension: GeminiCLIExtension = {
    name: 'test-extension',
    isActive: true,
    version: '1.0.0',
    path: '/path/to/extension',
    contextFiles: [],
    excludeTools: ['some-tool'],
    id: '123',
  };
  const inactiveExtension: GeminiCLIExtension = {
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
    mockGeminiClientSetTools = vi.fn();
    mockConfig = {
      getMcpClientManager: () => mockMcpClientManager,
      getEnableExtensionReloading: () => extensionReloadingEnabled,
      getGeminiClient: vi.fn(() => ({
        isInitialized: () => true,
        setTools: mockGeminiClientSetTools,
      })),
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

    describe.each([true, false])(
      'when enableExtensionReloading === $i',
      (reloadingEnabled) => {
        beforeEach(() => {
          extensionReloadingEnabled = reloadingEnabled;
        });

        it(`should ${reloadingEnabled ? '' : 'not '}reload extension features`, async () => {
          const loader = new SimpleExtensionLoader([]);
          await loader.start(mockConfig);
          expect(mockMcpClientManager.startExtension).not.toHaveBeenCalled();
          await loader.loadExtension(activeExtension);
          if (reloadingEnabled) {
            expect(
              mockMcpClientManager.startExtension,
            ).toHaveBeenCalledExactlyOnceWith(activeExtension);
            expect(mockRefreshServerHierarchicalMemory).toHaveBeenCalledOnce();
            expect(mockGeminiClientSetTools).toHaveBeenCalledOnce();
          } else {
            expect(mockMcpClientManager.startExtension).not.toHaveBeenCalled();
            expect(mockRefreshServerHierarchicalMemory).not.toHaveBeenCalled();
            expect(mockGeminiClientSetTools).not.toHaveBeenCalledOnce();
          }
          mockRefreshServerHierarchicalMemory.mockClear();
          mockGeminiClientSetTools.mockClear();

          await loader.unloadExtension(activeExtension);
          if (reloadingEnabled) {
            expect(
              mockMcpClientManager.stopExtension,
            ).toHaveBeenCalledExactlyOnceWith(activeExtension);
            expect(mockRefreshServerHierarchicalMemory).toHaveBeenCalledOnce();
            expect(mockGeminiClientSetTools).toHaveBeenCalledOnce();
          } else {
            expect(mockMcpClientManager.stopExtension).not.toHaveBeenCalled();
            expect(mockRefreshServerHierarchicalMemory).not.toHaveBeenCalled();
            expect(mockGeminiClientSetTools).not.toHaveBeenCalledOnce();
          }
        });

        it.runIf(reloadingEnabled)(
          'Should only reload memory once all extensions are done',
          async () => {
            const anotherExtension = {
              ...activeExtension,
              name: 'another-extension',
            };
            const loader = new SimpleExtensionLoader([]);
            await loader.loadExtension(activeExtension);
            await loader.start(mockConfig);
            expect(mockRefreshServerHierarchicalMemory).not.toHaveBeenCalled();
            await Promise.all([
              loader.unloadExtension(activeExtension),
              loader.loadExtension(anotherExtension),
            ]);
            expect(mockRefreshServerHierarchicalMemory).toHaveBeenCalledOnce();
          },
        );
      },
    );
  });

  describe('restartExtension', () => {
    it('should stop and then start the extension', async () => {
      const loader = new TestingSimpleExtensionLoader([activeExtension]);
      vi.spyOn(loader, 'stopExtension');
      vi.spyOn(loader, 'startExtension');
      await loader.start(mockConfig);
      await loader.restartExtension(activeExtension);
      expect(loader.stopExtension).toHaveBeenCalledWith(activeExtension);
      expect(loader.startExtension).toHaveBeenCalledWith(activeExtension);
    });
  });
});

// Adding these overrides allows us to access the protected members.
class TestingSimpleExtensionLoader extends SimpleExtensionLoader {
  override async startExtension(extension: GeminiCLIExtension): Promise<void> {
    await super.startExtension(extension);
  }

  override async stopExtension(extension: GeminiCLIExtension): Promise<void> {
    await super.stopExtension(extension);
  }
}
