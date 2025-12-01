/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContextManager } from './contextManager.js';
import * as memoryDiscovery from '../utils/memoryDiscovery.js';
import type { Config } from '../config/config.js';
import type { ExtensionLoader } from '../utils/extensionLoader.js';

// Mock memoryDiscovery module
vi.mock('../utils/memoryDiscovery.js');

describe('ContextManager', () => {
  let contextManager: ContextManager;
  let mockConfig: Config;

  beforeEach(() => {
    mockConfig = {
      getDebugMode: vi.fn().mockReturnValue(false),
      getWorkingDir: vi.fn().mockReturnValue('/app'),
    } as unknown as Config;

    contextManager = new ContextManager(mockConfig);
    vi.clearAllMocks();
  });

  describe('loadGlobalMemory', () => {
    it('should load and format global memory', async () => {
      const mockResult: memoryDiscovery.MemoryLoadResult = {
        files: [
          { path: '/home/user/.gemini/GEMINI.md', content: 'Global Content' },
        ],
      };
      vi.mocked(memoryDiscovery.loadGlobalMemory).mockResolvedValue(mockResult);

      const result = await contextManager.loadGlobalMemory();

      expect(memoryDiscovery.loadGlobalMemory).toHaveBeenCalledWith(false);
      // The path will be relative to CWD (/app), so it might contain ../
      expect(result).toMatch(/--- Context from: .*GEMINI.md ---/);
      expect(result).toContain('Global Content');
      expect(contextManager.getLoadedPaths()).toContain(
        '/home/user/.gemini/GEMINI.md',
      );
      expect(contextManager.getGlobalMemory()).toBe(result);
    });
  });

  describe('loadEnvironmentMemory', () => {
    it('should load and format environment memory', async () => {
      const mockResult: memoryDiscovery.MemoryLoadResult = {
        files: [{ path: '/app/GEMINI.md', content: 'Env Content' }],
      };
      vi.mocked(memoryDiscovery.loadEnvironmentMemory).mockResolvedValue(
        mockResult,
      );
      const mockExtensionLoader = {} as unknown as ExtensionLoader;

      const result = await contextManager.loadEnvironmentMemory(
        ['/app'],
        mockExtensionLoader,
      );

      expect(memoryDiscovery.loadEnvironmentMemory).toHaveBeenCalledWith(
        ['/app'],
        mockExtensionLoader,
        false,
      );
      expect(result).toContain('--- Context from: GEMINI.md ---');
      expect(result).toContain('Env Content');
      expect(contextManager.getLoadedPaths()).toContain('/app/GEMINI.md');
      expect(contextManager.getEnvironmentMemory()).toBe(result);
    });
  });

  describe('discoverContext', () => {
    it('should discover and load new context', async () => {
      const mockResult: memoryDiscovery.MemoryLoadResult = {
        files: [{ path: '/app/src/GEMINI.md', content: 'Src Content' }],
      };
      vi.mocked(memoryDiscovery.loadJitSubdirectoryMemory).mockResolvedValue(
        mockResult,
      );

      const result = await contextManager.discoverContext('/app/src/file.ts', [
        '/app',
      ]);

      expect(memoryDiscovery.loadJitSubdirectoryMemory).toHaveBeenCalledWith(
        '/app/src/file.ts',
        ['/app'],
        expect.any(Set),
        false,
      );
      expect(result).toContain('--- Context from: src/GEMINI.md ---');
      expect(result).toContain('Src Content');
      expect(contextManager.getLoadedPaths()).toContain('/app/src/GEMINI.md');
    });

    it('should return empty string if no new files found', async () => {
      const mockResult: memoryDiscovery.MemoryLoadResult = { files: [] };
      vi.mocked(memoryDiscovery.loadJitSubdirectoryMemory).mockResolvedValue(
        mockResult,
      );

      const result = await contextManager.discoverContext('/app/src/file.ts', [
        '/app',
      ]);

      expect(result).toBe('');
    });
  });
});
