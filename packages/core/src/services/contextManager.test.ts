/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContextManager } from './contextManager.js';
import * as memoryDiscovery from '../utils/memoryDiscovery.js';
import type { Config } from '../config/config.js';
import { coreEvents, CoreEvent } from '../utils/events.js';

// Mock memoryDiscovery module
vi.mock('../utils/memoryDiscovery.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../utils/memoryDiscovery.js')>();
  return {
    ...actual,
    getGlobalMemoryPaths: vi.fn(),
    getExtensionMemoryPaths: vi.fn(),
    getEnvironmentMemoryPaths: vi.fn(),
    readGeminiMdFiles: vi.fn(),
    loadJitSubdirectoryMemory: vi.fn(),
    concatenateInstructions: vi
      .fn()
      .mockImplementation(actual.concatenateInstructions),
  };
});

describe('ContextManager', () => {
  let contextManager: ContextManager;
  let mockConfig: Config;

  beforeEach(() => {
    mockConfig = {
      getDebugMode: vi.fn().mockReturnValue(false),
      getWorkingDir: vi.fn().mockReturnValue('/app'),
      getImportFormat: vi.fn().mockReturnValue('tree'),
      getWorkspaceContext: vi.fn().mockReturnValue({
        getDirectories: vi.fn().mockReturnValue(['/app']),
      }),
      getExtensionLoader: vi.fn().mockReturnValue({
        getExtensions: vi.fn().mockReturnValue([]),
      }),
      getMcpClientManager: vi.fn().mockReturnValue({
        getMcpInstructions: vi.fn().mockReturnValue('MCP Instructions'),
      }),
      isTrustedFolder: vi.fn().mockReturnValue(true),
    } as unknown as Config;

    contextManager = new ContextManager(mockConfig);
    vi.clearAllMocks();
    vi.spyOn(coreEvents, 'emit');
    vi.mocked(memoryDiscovery.getExtensionMemoryPaths).mockReturnValue([]);
  });

  describe('refresh', () => {
    it('should load and format global and environment memory', async () => {
      const globalPaths = ['/home/user/.gemini/GEMINI.md'];
      const envPaths = ['/app/GEMINI.md'];

      vi.mocked(memoryDiscovery.getGlobalMemoryPaths).mockResolvedValue(
        globalPaths,
      );
      vi.mocked(memoryDiscovery.getEnvironmentMemoryPaths).mockResolvedValue(
        envPaths,
      );

      vi.mocked(memoryDiscovery.readGeminiMdFiles).mockResolvedValue([
        { filePath: globalPaths[0], content: 'Global Content' },
        { filePath: envPaths[0], content: 'Env Content' },
      ]);

      await contextManager.refresh();

      expect(memoryDiscovery.getGlobalMemoryPaths).toHaveBeenCalled();
      expect(memoryDiscovery.getEnvironmentMemoryPaths).toHaveBeenCalledWith(
        ['/app'],
        false,
      );
      expect(memoryDiscovery.readGeminiMdFiles).toHaveBeenCalledWith(
        expect.arrayContaining([...globalPaths, ...envPaths]),
        false,
        'tree',
      );

      expect(contextManager.getGlobalMemory()).toContain('Global Content');
      expect(contextManager.getEnvironmentMemory()).toContain('Env Content');
      expect(contextManager.getEnvironmentMemory()).toContain(
        'MCP Instructions',
      );

      expect(contextManager.getLoadedPaths()).toContain(globalPaths[0]);
      expect(contextManager.getLoadedPaths()).toContain(envPaths[0]);
    });

    it('should emit MemoryChanged event when memory is refreshed', async () => {
      vi.mocked(memoryDiscovery.getGlobalMemoryPaths).mockResolvedValue([
        '/app/GEMINI.md',
      ]);
      vi.mocked(memoryDiscovery.getEnvironmentMemoryPaths).mockResolvedValue([
        '/app/src/GEMINI.md',
      ]);
      vi.mocked(memoryDiscovery.readGeminiMdFiles).mockResolvedValue([
        { filePath: '/app/GEMINI.md', content: 'content' },
        { filePath: '/app/src/GEMINI.md', content: 'env content' },
      ]);

      await contextManager.refresh();

      expect(coreEvents.emit).toHaveBeenCalledWith(CoreEvent.MemoryChanged, {
        fileCount: 2,
      });
    });

    it('should not load environment memory if folder is not trusted', async () => {
      vi.mocked(mockConfig.isTrustedFolder).mockReturnValue(false);
      vi.mocked(memoryDiscovery.getGlobalMemoryPaths).mockResolvedValue([
        '/home/user/.gemini/GEMINI.md',
      ]);
      vi.mocked(memoryDiscovery.readGeminiMdFiles).mockResolvedValue([
        { filePath: '/home/user/.gemini/GEMINI.md', content: 'Global Content' },
      ]);

      await contextManager.refresh();

      expect(memoryDiscovery.getEnvironmentMemoryPaths).not.toHaveBeenCalled();
      expect(contextManager.getEnvironmentMemory()).toBe('');
      expect(contextManager.getGlobalMemory()).toContain('Global Content');
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
      expect(result).toMatch(/--- Context from: src[\\/]GEMINI\.md ---/);
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

    it('should return empty string if folder is not trusted', async () => {
      vi.mocked(mockConfig.isTrustedFolder).mockReturnValue(false);

      const result = await contextManager.discoverContext('/app/src/file.ts', [
        '/app',
      ]);

      expect(memoryDiscovery.loadJitSubdirectoryMemory).not.toHaveBeenCalled();
      expect(result).toBe('');
    });
  });
});
