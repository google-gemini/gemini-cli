/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MemoryManager } from './MemoryManager.js';
import {
  MemoryConfig,
  FileContext,
  ProjectContext,
  ConversationSummary,
  CachedToolResult,
  SerializedMemory,
} from './memory-interfaces.js';
import * as fs from 'fs/promises';

// Mock fs module
vi.mock('fs/promises');
const mockFs = vi.mocked(fs);

describe('MemoryManager', () => {
  let memoryManager: MemoryManager;
  let mockConfig: MemoryConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    mockConfig = {
      maxMemorySize: 50 * 1024 * 1024, // 50MB
      fileStatesConfig: {
        maxFiles: 1000,
        ttl: 24 * 60 * 60 * 1000, // 24 hours
        checkInterval: 60 * 1000, // 1 minute
      },
      sessionHistoryConfig: {
        maxSessions: 100,
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        compressionRatio: 0.3,
      },
      toolResultsConfig: {
        maxCacheSize: 10 * 1024 * 1024, // 10MB
        defaultTtl: 60 * 60 * 1000, // 1 hour
        maxResultSize: 1024 * 1024, // 1MB
      },
      projectContextConfig: {
        analysisInterval: 30 * 60 * 1000, // 30 minutes
        maxPatterns: 50,
        maxDependencies: 1000,
      },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with valid config', async () => {
      memoryManager = new MemoryManager();
      await expect(memoryManager.initialize(mockConfig)).resolves.not.toThrow();

      const stats = await memoryManager.getStats();
      expect(stats.fileCount).toBe(0);
      expect(stats.summaryCount).toBe(0);
      expect(stats.cachedResultCount).toBe(0);
    });

    it('should throw error with invalid config', async () => {
      memoryManager = new MemoryManager();
      const invalidConfig = { ...mockConfig, maxMemorySize: -1 };

      await expect(memoryManager.initialize(invalidConfig)).rejects.toThrow(
        'Invalid memory configuration',
      );
    });

    it('should load existing memory state on initialization', async () => {
      const mockSerializedData: SerializedMemory = {
        fileStates: {
          '/test/file.ts': {
            filePath: '/test/file.ts',
            lastModified: Date.now(),
            size: 1024,
            contentHash: 'hash123',
            fileType: 'typescript',
            encoding: 'utf-8',
            exists: true,
            dependencies: [],
            dependents: [],
            diagnostics: [],
            metadata: {
              lineCount: 50,
              tokenCount: 200,
              frameworks: ['typescript'],
              exports: ['testFunction'],
              imports: ['fs'],
              definitions: [],
            },
            lastUpdated: Date.now(),
          },
        },
        projectKnowledge: {
          rootPath: '/test',
          name: 'test-project',
          type: 'typescript',
          languages: ['typescript'],
          frameworks: ['typescript'],
          configFiles: ['tsconfig.json'],
          dependencies: [],
          patterns: [],
          structure: {
            name: 'test',
            path: '/test',
            isDirectory: true,
            children: [],
            fileCount: 1,
          },
          documentation: [],
          lastAnalyzed: Date.now(),
          preferences: {
            codeStyle: {
              indentation: 'spaces',
              indentSize: 2,
              lineEnding: 'lf',
              maxLineLength: 80,
            },
            namingConventions: {
              functions: 'camelCase',
              variables: 'camelCase',
              classes: 'PascalCase',
              files: 'kebab-case',
            },
            architecture: {
              testLocation: 'alongside',
              importStyle: 'relative',
              componentStructure: 'feature-based',
            },
          },
        },
        sessionHistory: [],
        toolResults: {},
        metadata: {
          version: '1.0.0',
          timestamp: Date.now(),
          config: mockConfig,
        },
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(mockSerializedData));
      mockFs.access.mockResolvedValue(undefined);

      memoryManager = new MemoryManager();
      await memoryManager.initialize(mockConfig);

      const fileContext = await memoryManager.getFileContext('/test/file.ts');
      expect(fileContext).toBeDefined();
      expect(fileContext?.filePath).toBe('/test/file.ts');
    });
  });

  describe('file context management', () => {
    beforeEach(async () => {
      memoryManager = new MemoryManager();
      await memoryManager.initialize(mockConfig);
    });

    it('should update file context', async () => {
      const filePath = '/test/example.ts';
      const fileContext: Partial<FileContext> = {
        filePath,
        lastModified: Date.now(),
        size: 1024,
        contentHash: 'abc123',
        fileType: 'typescript',
        encoding: 'utf-8',
        exists: true,
        dependencies: ['fs', 'path'],
        dependents: [],
        diagnostics: [],
      };

      await memoryManager.updateFileContext(filePath, fileContext);

      const retrievedContext = await memoryManager.getFileContext(filePath);
      expect(retrievedContext).toBeDefined();
      expect(retrievedContext?.filePath).toBe(filePath);
      expect(retrievedContext?.size).toBe(1024);
      expect(retrievedContext?.dependencies).toEqual(['fs', 'path']);
    });

    it('should track file dependencies', async () => {
      const filePath1 = '/test/file1.ts';
      const filePath2 = '/test/file2.ts';

      await memoryManager.updateFileContext(filePath1, {
        filePath: filePath1,
        dependencies: [filePath2],
        dependents: [],
      });

      await memoryManager.updateFileContext(filePath2, {
        filePath: filePath2,
        dependencies: [],
        dependents: [filePath1],
      });

      const context1 = await memoryManager.getFileContext(filePath1);
      const context2 = await memoryManager.getFileContext(filePath2);

      expect(context1?.dependencies).toContain(filePath2);
      expect(context2?.dependents).toContain(filePath1);
    });

    it('should handle file context updates with diagnostics', async () => {
      const filePath = '/test/error-file.ts';
      const fileContext: Partial<FileContext> = {
        filePath,
        diagnostics: [
          {
            line: 10,
            column: 5,
            message: 'Type error: Cannot assign string to number',
            severity: 'error',
            source: 'typescript',
          },
          {
            line: 15,
            column: 10,
            message: 'Unused variable warning',
            severity: 'warning',
            source: 'eslint',
          },
        ],
      };

      await memoryManager.updateFileContext(filePath, fileContext);

      const retrievedContext = await memoryManager.getFileContext(filePath);
      expect(retrievedContext?.diagnostics).toHaveLength(2);
      expect(retrievedContext?.diagnostics[0].severity).toBe('error');
      expect(retrievedContext?.diagnostics[1].severity).toBe('warning');
    });

    it('should return undefined for non-existent file context', async () => {
      const context = await memoryManager.getFileContext(
        '/non/existent/file.ts',
      );
      expect(context).toBeUndefined();
    });
  });

  describe('project context management', () => {
    beforeEach(async () => {
      memoryManager = new MemoryManager();
      await memoryManager.initialize(mockConfig);
    });

    it('should update project context', async () => {
      const projectContext: Partial<ProjectContext> = {
        rootPath: '/test/project',
        name: 'test-project',
        type: 'typescript',
        languages: ['typescript', 'javascript'],
        frameworks: ['react', 'nextjs'],
        buildSystem: 'npm',
        testFramework: 'vitest',
        dependencies: [
          {
            name: 'react',
            version: '^18.0.0',
            type: 'production',
            manager: 'npm',
          },
        ],
        patterns: [
          {
            name: 'React Hooks',
            description: 'Usage of React hooks pattern',
            examples: ['useState', 'useEffect'],
            confidence: 0.9,
            files: ['/src/components/Button.tsx'],
          },
        ],
      };

      await memoryManager.updateProjectContext(projectContext);

      const stats = await memoryManager.getStats();
      expect(stats.fileCount).toBe(0); // No files tracked yet

      // Verify project context is updated by checking if patterns are saved
      const retrievedContext = memoryManager.getProjectContext();
      expect(retrievedContext.patterns).toHaveLength(1);
      expect(retrievedContext.patterns[0].name).toBe('React Hooks');
    });

    it('should detect and update coding patterns', async () => {
      const projectContext: Partial<ProjectContext> = {
        patterns: [
          {
            name: 'Component Pattern',
            description: 'React functional components',
            examples: ['export const Component = () => {}'],
            confidence: 0.95,
            files: ['/src/Button.tsx', '/src/Input.tsx'],
          },
          {
            name: 'Custom Hooks',
            description: 'Custom React hooks',
            examples: ['export const useCustomHook = () => {}'],
            confidence: 0.8,
            files: ['/src/hooks/useAuth.ts'],
          },
        ],
      };

      await memoryManager.updateProjectContext(projectContext);

      const retrievedContext = memoryManager.getProjectContext();
      expect(retrievedContext.patterns).toHaveLength(2);
      expect(retrievedContext.patterns[0].confidence).toBe(0.95);
      expect(retrievedContext.patterns[1].files).toContain(
        '/src/hooks/useAuth.ts',
      );
    });
  });

  describe('conversation summary management', () => {
    beforeEach(async () => {
      memoryManager = new MemoryManager();
      await memoryManager.initialize(mockConfig);
    });

    it('should add conversation summary', async () => {
      const summary: ConversationSummary = {
        id: 'conv-123',
        sessionId: 'session-456',
        startTime: Date.now() - 60000,
        endTime: Date.now(),
        summary: 'User implemented a new React component',
        topics: ['React', 'TypeScript', 'Components'],
        completedTasks: [
          {
            description: 'Create Button component',
            status: 'completed',
            priority: 'medium',
            files: ['/src/Button.tsx'],
            tools: ['write_file', 'read_file'],
            outcome: 'Successfully created reusable button component',
          },
        ],
        pendingTasks: [],
        modifiedFiles: ['/src/Button.tsx'],
        toolsUsed: ['write_file', 'read_file'],
        decisions: [
          {
            description: 'Use styled-components for styling',
            reasoning: 'Better integration with existing theme system',
            affectedFiles: ['/src/Button.tsx'],
            timestamp: Date.now(),
            alternatives: ['CSS modules', 'Tailwind CSS'],
          },
        ],
        insights: ['User prefers functional components over class components'],
        originalTokens: 2000,
        summaryTokens: 500,
        totalTokens: 2500,
        compressionRatio: 0.25,
        qualityScore: 0.85,
      };

      await memoryManager.addConversationSummary(summary);

      const stats = await memoryManager.getStats();
      expect(stats.summaryCount).toBe(1);
    });

    it('should maintain conversation summary history within limits', async () => {
      // Create multiple summaries to test limit enforcement
      const summaries: ConversationSummary[] = [];
      for (let i = 0; i < 5; i++) {
        summaries.push({
          id: `conv-${i}`,
          sessionId: `session-${i}`,
          startTime: Date.now() - (i + 1) * 60000,
          endTime: Date.now() - i * 60000,
          summary: `Conversation ${i}`,
          topics: ['general'],
          completedTasks: [],
          pendingTasks: [],
          modifiedFiles: [],
          toolsUsed: [],
          decisions: [],
          insights: [],
          originalTokens: 1000,
          summaryTokens: 200,
          totalTokens: 1200,
          compressionRatio: 0.2,
          qualityScore: 0.8,
        });
      }

      for (const summary of summaries) {
        await memoryManager.addConversationSummary(summary);
      }

      const stats = await memoryManager.getStats();
      expect(stats.summaryCount).toBe(5);
    });
  });

  describe('tool result caching', () => {
    beforeEach(async () => {
      memoryManager = new MemoryManager();
      await memoryManager.initialize(mockConfig);
    });

    it('should cache tool results', async () => {
      const toolName = 'read_file';
      const key = 'file-hash-123';
      const result: CachedToolResult = {
        key,
        parameters: { filePath: '/test/file.ts' },
        result: { content: 'file content', size: 1024 },
        timestamp: Date.now(),
        ttl: 60000,
        accessCount: 0,
        lastAccessed: Date.now(),
        size: 1024,
        valid: true,
        dependencies: ['/test/file.ts'],
      };

      await memoryManager.cacheToolResult(toolName, key, result);

      const cachedResult = await memoryManager.getCachedToolResult(
        toolName,
        key,
      );
      expect(cachedResult).toBeDefined();
      expect(cachedResult?.key).toBe(key);
      expect(cachedResult?.accessCount).toBe(1); // Should increment on access
    });

    it('should handle cache hits and misses', async () => {
      const toolName = 'shell';
      const key = 'ls-command-hash';
      const result: CachedToolResult = {
        key,
        parameters: { command: 'ls -la' },
        result: { output: 'file1.txt\nfile2.txt\n', exitCode: 0 },
        timestamp: Date.now(),
        ttl: 30000,
        accessCount: 0,
        lastAccessed: Date.now(),
        size: 500,
        valid: true,
        dependencies: [],
      };

      // Cache miss
      let cachedResult = await memoryManager.getCachedToolResult(toolName, key);
      expect(cachedResult).toBeUndefined();

      // Cache result
      await memoryManager.cacheToolResult(toolName, key, result);

      // Cache hit
      cachedResult = await memoryManager.getCachedToolResult(toolName, key);
      expect(cachedResult).toBeDefined();
      expect(cachedResult?.accessCount).toBe(1);

      // Another cache hit
      cachedResult = await memoryManager.getCachedToolResult(toolName, key);
      expect(cachedResult?.accessCount).toBe(2);
    });

    it('should expire cached results after TTL', async () => {
      const toolName = 'web_fetch';
      const key = 'url-hash-456';
      const result: CachedToolResult = {
        key,
        parameters: { url: 'https://example.com' },
        result: { content: 'webpage content', status: 200 },
        timestamp: Date.now() - 120000, // 2 minutes ago
        ttl: 60000, // 1 minute TTL
        accessCount: 0,
        lastAccessed: Date.now() - 120000,
        size: 2048,
        valid: true,
        dependencies: [],
      };

      await memoryManager.cacheToolResult(toolName, key, result);

      // Trigger cleanup to remove expired entries
      await memoryManager.cleanup();

      const cachedResult = await memoryManager.getCachedToolResult(
        toolName,
        key,
      );
      expect(cachedResult).toBeUndefined();
    });
  });

  describe('memory cleanup', () => {
    beforeEach(async () => {
      memoryManager = new MemoryManager();
      await memoryManager.initialize(mockConfig);
    });

    it('should cleanup expired entries', async () => {
      // Add some expired entries
      const expiredResult: CachedToolResult = {
        key: 'expired-key',
        parameters: { test: 'value' },
        result: { data: 'old data' },
        timestamp: Date.now() - 3600000, // 1 hour ago
        ttl: 1800000, // 30 minutes TTL
        accessCount: 0,
        lastAccessed: Date.now() - 3600000,
        size: 100,
        valid: true,
        dependencies: [],
      };

      await memoryManager.cacheToolResult(
        'test_tool',
        'expired-key',
        expiredResult,
      );

      // Add a fresh entry
      const freshResult: CachedToolResult = {
        key: 'fresh-key',
        parameters: { test: 'value' },
        result: { data: 'fresh data' },
        timestamp: Date.now() - 60000, // 1 minute ago
        ttl: 1800000, // 30 minutes TTL
        accessCount: 0,
        lastAccessed: Date.now() - 60000,
        size: 100,
        valid: true,
        dependencies: [],
      };

      await memoryManager.cacheToolResult(
        'test_tool',
        'fresh-key',
        freshResult,
      );

      // Cleanup should remove expired entry
      await memoryManager.cleanup();

      const expiredCached = await memoryManager.getCachedToolResult(
        'test_tool',
        'expired-key',
      );
      const freshCached = await memoryManager.getCachedToolResult(
        'test_tool',
        'fresh-key',
      );

      expect(expiredCached).toBeUndefined();
      expect(freshCached).toBeDefined();
    });

    it('should enforce memory limits', async () => {
      // Override config with small memory limit for testing
      const smallConfig = {
        ...mockConfig,
        maxMemorySize: 1024, // 1KB
        toolResultsConfig: {
          ...mockConfig.toolResultsConfig,
          maxCacheSize: 512, // 512 bytes
        },
      };

      memoryManager = new MemoryManager();
      await memoryManager.initialize(smallConfig);

      // Add results that exceed memory limit
      const largeResult: CachedToolResult = {
        key: 'large-key',
        parameters: { data: 'x'.repeat(1000) },
        result: { content: 'y'.repeat(1000) },
        timestamp: Date.now(),
        ttl: 60000,
        accessCount: 0,
        lastAccessed: Date.now(),
        size: 2000, // 2KB
        valid: true,
        dependencies: [],
      };

      await memoryManager.cacheToolResult(
        'large_tool',
        'large-key',
        largeResult,
      );

      const stats = await memoryManager.getStats();
      expect(stats.memoryPressure).toBe('high');

      // Cleanup should handle memory pressure
      await memoryManager.cleanup();
    });
  });

  describe('memory statistics', () => {
    beforeEach(async () => {
      memoryManager = new MemoryManager();
      await memoryManager.initialize(mockConfig);
    });

    it('should provide accurate memory statistics', async () => {
      // Add some data
      await memoryManager.updateFileContext('/test/file1.ts', {
        filePath: '/test/file1.ts',
        size: 1024,
      });

      await memoryManager.updateFileContext('/test/file2.ts', {
        filePath: '/test/file2.ts',
        size: 2048,
      });

      const summary: ConversationSummary = {
        id: 'conv-1',
        sessionId: 'session-1',
        startTime: Date.now() - 60000,
        endTime: Date.now(),
        summary: 'Test conversation',
        topics: ['test'],
        completedTasks: [],
        pendingTasks: [],
        modifiedFiles: [],
        toolsUsed: [],
        decisions: [],
        insights: [],
        originalTokens: 1000,
        summaryTokens: 200,
        totalTokens: 1200,
        compressionRatio: 0.2,
        qualityScore: 0.8,
      };

      await memoryManager.addConversationSummary(summary);

      const stats = await memoryManager.getStats();
      expect(stats.fileCount).toBe(2);
      expect(stats.summaryCount).toBe(1);
      expect(stats.cachedResultCount).toBe(0);
      expect(stats.memoryPressure).toBe('low');
    });

    it('should calculate cache hit ratios', async () => {
      const toolName = 'test_tool';
      const result: CachedToolResult = {
        key: 'test-key',
        parameters: { test: 'value' },
        result: { data: 'test data' },
        timestamp: Date.now(),
        ttl: 60000,
        accessCount: 0,
        lastAccessed: Date.now(),
        size: 100,
        valid: true,
        dependencies: [],
      };

      await memoryManager.cacheToolResult(toolName, 'test-key', result);

      // Simulate cache hits
      await memoryManager.getCachedToolResult(toolName, 'test-key');
      await memoryManager.getCachedToolResult(toolName, 'test-key');

      // Simulate cache miss
      await memoryManager.getCachedToolResult(toolName, 'non-existent-key');

      const stats = await memoryManager.getStats();
      expect(stats.cacheHitRatios[toolName]).toBeGreaterThan(0);
    });
  });

  describe('serialization and persistence', () => {
    beforeEach(async () => {
      memoryManager = new MemoryManager();
      await memoryManager.initialize(mockConfig);
    });

    it('should serialize memory state', async () => {
      // Add some data
      await memoryManager.updateFileContext('/test/file.ts', {
        filePath: '/test/file.ts',
        size: 1024,
        contentHash: 'hash123',
      });

      const serialized = await memoryManager.serialize();

      expect(serialized.fileStates).toBeDefined();
      expect(serialized.fileStates['/test/file.ts']).toBeDefined();
      expect(serialized.fileStates['/test/file.ts']?.size).toBe(1024);
      expect(serialized.metadata.version).toBeDefined();
      expect(serialized.metadata.timestamp).toBeGreaterThan(0);
    });

    it('should deserialize memory state', async () => {
      const serializedData: SerializedMemory = {
        fileStates: {
          '/test/restored.ts': {
            filePath: '/test/restored.ts',
            lastModified: Date.now(),
            size: 2048,
            contentHash: 'restored-hash',
            fileType: 'typescript',
            encoding: 'utf-8',
            exists: true,
            dependencies: [],
            dependents: [],
            diagnostics: [],
            metadata: {
              lineCount: 100,
              tokenCount: 400,
              frameworks: ['typescript'],
              exports: ['restoredFunction'],
              imports: ['path'],
              definitions: [],
            },
            lastUpdated: Date.now(),
          },
        },
        projectKnowledge: {
          rootPath: '/test',
          name: 'restored-project',
          type: 'typescript',
          languages: ['typescript'],
          frameworks: ['typescript'],
          configFiles: ['tsconfig.json'],
          dependencies: [],
          patterns: [],
          structure: {
            name: 'test',
            path: '/test',
            isDirectory: true,
            children: [],
            fileCount: 1,
          },
          documentation: [],
          lastAnalyzed: Date.now(),
          preferences: {
            codeStyle: {
              indentation: 'spaces',
              indentSize: 2,
              lineEnding: 'lf',
              maxLineLength: 80,
            },
            namingConventions: {
              functions: 'camelCase',
              variables: 'camelCase',
              classes: 'PascalCase',
              files: 'kebab-case',
            },
            architecture: {
              testLocation: 'alongside',
              importStyle: 'relative',
              componentStructure: 'feature-based',
            },
          },
        },
        sessionHistory: [],
        toolResults: {},
        metadata: {
          version: '1.0.0',
          timestamp: Date.now(),
          config: mockConfig,
        },
      };

      await memoryManager.deserialize(serializedData);

      const restoredContext =
        await memoryManager.getFileContext('/test/restored.ts');
      expect(restoredContext).toBeDefined();
      expect(restoredContext?.size).toBe(2048);
      expect(restoredContext?.contentHash).toBe('restored-hash');
    });
  });
});
