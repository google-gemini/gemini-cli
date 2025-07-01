/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as _path from 'node:path';
import { ModuleLoaderImpl } from './ModuleLoader.js';
import type { PromptModule } from './interfaces/prompt-assembly.js';

// Mock fs module
vi.mock('node:fs/promises');
vi.mock('node:fs');

describe('ModuleLoader', () => {
  let moduleLoader: ModuleLoaderImpl;
  const mockModuleDirectory = '/mock/prompt-system';

  beforeEach(() => {
    moduleLoader = new ModuleLoaderImpl(mockModuleDirectory, true);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('loadModule', () => {
    it('should load a module from disk successfully', async () => {
      const mockContent = `<!--
Module: Identity
Tokens: 200
Dependencies: security
Priority: 1
-->

# Agent Identity

You are an interactive CLI agent.`;

      vi.mocked(fs.readFile).mockResolvedValue(mockContent);

      const module = await moduleLoader.loadModule('identity');

      expect(module).toEqual({
        id: 'identity',
        version: '1.0.0',
        content: mockContent.trim(),
        dependencies: ['security'],
        tokenCount: 200,
        category: 'core',
        priority: 1,
      });
    });

    it('should parse metadata from HTML comments correctly', async () => {
      const mockContent = `<!--
Module: Test Module
Tokens: ~150 target
Dependencies: module1, module2, module3
Priority: 2
Version: 2.1.0
-->

Content here`;

      vi.mocked(fs.readFile).mockResolvedValue(mockContent);

      const module = await moduleLoader.loadModule('test');

      expect(module.tokenCount).toBe(150);
      expect(module.dependencies).toEqual(['module1', 'module2', 'module3']);
      expect(module.priority).toBe(2);
      expect(module.version).toBe('2.1.0');
    });

    it('should fall back to estimated token count when not specified', async () => {
      const mockContent = `# Test Module

This is a test module with some content that should have tokens estimated.`;

      vi.mocked(fs.readFile).mockResolvedValue(mockContent);

      const module = await moduleLoader.loadModule('test');

      expect(module.tokenCount).toBeGreaterThan(0);
      expect(module.tokenCount).toBe(Math.ceil(mockContent.length / 4));
    });

    it('should use cache on subsequent loads', async () => {
      const mockContent = '# Test Module';
      vi.mocked(fs.readFile).mockResolvedValue(mockContent);

      await moduleLoader.loadModule('test');
      await moduleLoader.loadModule('test');

      expect(vi.mocked(fs.readFile)).toHaveBeenCalledTimes(1);
    });

    it('should throw error when module is not found', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('File not found'));

      await expect(moduleLoader.loadModule('nonexistent')).rejects.toThrow(
        "Module 'nonexistent' not found in any category",
      );
    });

    it('should search in all categories for a module', async () => {
      const mockContent = '# Test Module';

      // Mock first three calls to fail, fourth to succeed
      vi.mocked(fs.readFile)
        .mockRejectedValueOnce(new Error('Not found'))
        .mockRejectedValueOnce(new Error('Not found'))
        .mockRejectedValueOnce(new Error('Not found'))
        .mockResolvedValueOnce(mockContent);

      const module = await moduleLoader.loadModule('test');

      expect(module.category).toBe('context');
      expect(vi.mocked(fs.readFile)).toHaveBeenCalledTimes(4);
    });
  });

  describe('loadModulesByCategory', () => {
    it('should load all modules from a category', async () => {
      const mockFiles = ['identity.md', 'mandates.md', 'other.txt'];
      const mockContent = '# Test Module';

      vi.mocked(fs.readdir).mockResolvedValue(mockFiles as string[] & fs.Dirent[]);
      vi.mocked(fs.readFile).mockResolvedValue(mockContent);

      const modules = await moduleLoader.loadModulesByCategory('core');

      expect(modules).toHaveLength(2); // Only .md files
      expect(modules[0].id).toBe('identity');
      expect(modules[1].id).toBe('mandates');
      expect(vi.mocked(fs.readFile)).toHaveBeenCalledTimes(2);
    });

    it('should return empty array when category directory does not exist', async () => {
      vi.mocked(fs.readdir).mockRejectedValue(new Error('Directory not found'));

      const modules = await moduleLoader.loadModulesByCategory(
        'nonexistent' as Parameters<typeof moduleLoader.loadModulesByCategory>[0],
      );

      expect(modules).toEqual([]);
    });

    it('should filter modules by category', async () => {
      const mockFiles = ['test.md'];
      const mockContent = '# Test Module';

      vi.mocked(fs.readdir).mockResolvedValue(mockFiles as string[] & fs.Dirent[]);
      vi.mocked(fs.readFile).mockResolvedValue(mockContent);

      const modules = await moduleLoader.loadModulesByCategory('core');

      expect(modules.every((m) => m.category === 'core')).toBe(true);
    });
  });

  describe('loadAllModules', () => {
    it('should load modules from all categories', async () => {
      const mockFiles = ['test.md'];
      const mockContent = '# Test Module';

      vi.mocked(fs.readdir).mockResolvedValue(mockFiles as string[] & fs.Dirent[]);
      vi.mocked(fs.readFile).mockResolvedValue(mockContent);

      const modules = await moduleLoader.loadAllModules();

      // Should call readdir for each category
      expect(vi.mocked(fs.readdir)).toHaveBeenCalledTimes(5); // 5 categories
      expect(modules.length).toBeGreaterThan(0);
    });
  });

  describe('moduleExists', () => {
    it('should return true when module exists in cache', () => {
      const mockModule: PromptModule = {
        id: 'test',
        version: '1.0.0',
        content: '# Test',
        dependencies: [],
        tokenCount: 10,
        category: 'core',
      };

      // Manually set cache
      (moduleLoader as { moduleCache: Map<string, PromptModule> }).moduleCache.set('test', mockModule);

      const exists = moduleLoader.moduleExists('test');

      expect(exists).toBe(true);
    });

    it('should check file system when not in cache', async () => {
      const { accessSync } = await import('node:fs');
      const mockAccessSync = vi.spyOn({ accessSync }, 'accessSync');
      mockAccessSync.mockImplementation(() => true);

      const exists = moduleLoader.moduleExists('test');

      expect(exists).toBe(true);
      expect(mockAccessSync).toHaveBeenCalled();
    });

    it('should return false when module does not exist', async () => {
      const { accessSync } = await import('node:fs');
      const mockAccessSync = vi.spyOn({ accessSync }, 'accessSync');
      mockAccessSync.mockImplementation(() => {
        throw new Error('File not found');
      });

      const exists = moduleLoader.moduleExists('nonexistent');

      expect(exists).toBe(false);
    });
  });

  describe('getModuleMetadata', () => {
    it('should return metadata without content', async () => {
      const mockContent = '# Test Module';
      vi.mocked(fs.readFile).mockResolvedValue(mockContent);

      const metadata = await moduleLoader.getModuleMetadata('test');

      expect(metadata).not.toHaveProperty('content');
      expect(metadata).toEqual({
        id: 'test',
        version: '1.0.0',
        dependencies: [],
        tokenCount: expect.any(Number),
        category: 'core',
        priority: undefined,
      });
    });

    it('should use metadata cache', async () => {
      const mockContent = '# Test Module';
      vi.mocked(fs.readFile).mockResolvedValue(mockContent);

      await moduleLoader.getModuleMetadata('test');
      await moduleLoader.getModuleMetadata('test');

      // Should only load the full module once
      expect(vi.mocked(fs.readFile)).toHaveBeenCalledTimes(1);
    });
  });

  describe('cache management', () => {
    it('should clear caches', () => {
      const mockModule: PromptModule = {
        id: 'test',
        version: '1.0.0',
        content: '# Test',
        dependencies: [],
        tokenCount: 10,
        category: 'core',
      };

      (moduleLoader as { moduleCache: Map<string, PromptModule>; metadataCache: Map<string, { id: string }> }).moduleCache.set('test', mockModule);
      (moduleLoader as { moduleCache: Map<string, PromptModule>; metadataCache: Map<string, { id: string }> }).metadataCache.set('test', { id: 'test' });

      moduleLoader.clearCache();

      expect((moduleLoader as { moduleCache: Map<string, PromptModule> }).moduleCache.size).toBe(0);
      expect((moduleLoader as { metadataCache: Map<string, unknown> }).metadataCache.size).toBe(0);
    });

    it('should return cache statistics', () => {
      const mockModule: PromptModule = {
        id: 'test',
        version: '1.0.0',
        content: '# Test',
        dependencies: [],
        tokenCount: 10,
        category: 'core',
      };

      (moduleLoader as { moduleCache: Map<string, PromptModule>; metadataCache: Map<string, { id: string }> }).moduleCache.set('test', mockModule);
      (moduleLoader as { moduleCache: Map<string, PromptModule>; metadataCache: Map<string, { id: string }> }).metadataCache.set('meta', { id: 'meta' });

      const stats = moduleLoader.getCacheStats();

      expect(stats).toEqual({
        modules: 1,
        metadata: 1,
      });
    });
  });

  describe('caching behavior', () => {
    it('should respect caching configuration', async () => {
      const noCacheLoader = new ModuleLoaderImpl(mockModuleDirectory, false);
      const mockContent = '# Test Module';
      vi.mocked(fs.readFile).mockResolvedValue(mockContent);

      await noCacheLoader.loadModule('test');
      await noCacheLoader.loadModule('test');

      // Should load from disk both times when caching is disabled
      expect(vi.mocked(fs.readFile)).toHaveBeenCalledTimes(2);
    });
  });
});
