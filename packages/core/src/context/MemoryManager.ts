/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  MemoryOperations,
  MemoryConfig,
  ContextMemory,
  FileContext,
  ProjectContext,
  ConversationSummary,
  CachedToolResult,
  CacheStats,
  MemoryStats,
  SerializedMemory,
  MemoryEventEmitter,
} from './memory-interfaces.js';
import { FileContextManager } from './FileContextManager.js';
import { ProjectContextManager } from './ProjectContextManager.js';
import { ToolResultCache } from './ToolResultCache.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { homedir } from 'os';
import { EventEmitter } from 'events';

/**
 * Main memory manager that orchestrates all memory operations
 */
export class MemoryManager implements MemoryOperations, MemoryEventEmitter {
  private config!: MemoryConfig;
  private contextMemory: ContextMemory = {
    fileStates: new Map(),
    projectKnowledge: {} as ProjectContext,
    sessionHistory: [],
    toolResults: new Map(),
  };

  private fileContextManager = new FileContextManager();
  private projectContextManager = new ProjectContextManager();
  private eventEmitter = new EventEmitter();
  private cleanupTimer?: NodeJS.Timeout;
  private memoryFilePath?: string;

  /**
   * Initialize the memory system
   */
  async initialize(config: MemoryConfig): Promise<void> {
    this.validateConfig(config);
    this.config = config;

    // Set up memory file path
    this.memoryFilePath = path.join(homedir(), '.gemini', 'memory.json');

    // Load existing memory state
    await this.loadMemoryState();

    // Initialize project context if not exists
    if (!this.contextMemory.projectKnowledge.rootPath) {
      this.contextMemory.projectKnowledge =
        await this.detectAndAnalyzeProject();
    }

    // Start cleanup timer
    this.scheduleCleanup();

    // Emit initialization complete
    this.eventEmitter.emit('initialized', this.config);
  }

  /**
   * Update file context
   */
  async updateFileContext(
    filePath: string,
    context: Partial<FileContext>,
  ): Promise<void> {
    const normalizedPath = path.resolve(filePath);
    let existingContext = this.contextMemory.fileStates.get(normalizedPath);

    if (!existingContext) {
      existingContext =
        await this.fileContextManager.getOrCreateFileContext(normalizedPath);
    }

    // Merge the updates
    const updatedContext: FileContext = {
      ...existingContext,
      ...context,
      lastUpdated: Date.now(),
    };

    this.contextMemory.fileStates.set(normalizedPath, updatedContext);

    // Check memory limits
    await this.enforceMemoryLimits();

    // Emit event
    this.eventEmitter.emit(
      'fileContextUpdated',
      normalizedPath,
      updatedContext,
    );
  }

  /**
   * Get file context
   */
  async getFileContext(filePath: string): Promise<FileContext | undefined> {
    const normalizedPath = path.resolve(filePath);
    let context = this.contextMemory.fileStates.get(normalizedPath);

    if (!context) {
      // Try to load from file context manager
      context = await this.fileContextManager.getFileContext(normalizedPath);
      if (context) {
        this.contextMemory.fileStates.set(normalizedPath, context);
      }
    }

    return context;
  }

  /**
   * Update project context
   */
  async updateProjectContext(context: Partial<ProjectContext>): Promise<void> {
    this.contextMemory.projectKnowledge = {
      ...this.contextMemory.projectKnowledge,
      ...context,
      lastAnalyzed: Date.now(),
    };

    // Emit event
    this.eventEmitter.emit(
      'projectContextUpdated',
      this.contextMemory.projectKnowledge,
    );
  }

  /**
   * Get project context
   */
  getProjectContext(): ProjectContext {
    return this.contextMemory.projectKnowledge;
  }

  /**
   * Add conversation summary
   */
  async addConversationSummary(summary: ConversationSummary): Promise<void> {
    this.contextMemory.sessionHistory.push(summary);

    // Enforce session history limits
    const maxSessions = this.config.sessionHistoryConfig.maxSessions;
    if (this.contextMemory.sessionHistory.length > maxSessions) {
      // Remove oldest summaries
      this.contextMemory.sessionHistory =
        this.contextMemory.sessionHistory.slice(-maxSessions);
    }

    // Remove summaries older than maxAge
    const maxAge = this.config.sessionHistoryConfig.maxAge;
    const cutoffTime = Date.now() - maxAge;
    this.contextMemory.sessionHistory =
      this.contextMemory.sessionHistory.filter((s) => s.endTime > cutoffTime);

    // Emit event
    this.eventEmitter.emit('conversationSummaryAdded', summary);
  }

  /**
   * Get session history
   */
  getSessionHistory(): ConversationSummary[] {
    return [...this.contextMemory.sessionHistory]; // Return a copy
  }

  /**
   * Cache tool result
   */
  async cacheToolResult(
    toolName: string,
    key: string,
    result: CachedToolResult,
  ): Promise<void> {
    let cache = this.contextMemory.toolResults.get(toolName);

    if (!cache) {
      cache = new ToolResultCache(toolName, {
        maxSize: this.config.toolResultsConfig.maxCacheSize,
        defaultTtl: this.config.toolResultsConfig.defaultTtl,
        maxResultSize: this.config.toolResultsConfig.maxResultSize,
        cleanupInterval: 5 * 60 * 1000, // 5 minutes
      });
      this.contextMemory.toolResults.set(toolName, cache);
    }

    const success = await cache.set(key, result);

    if (success) {
      // Emit event
      this.eventEmitter.emit('toolResultCached', toolName, key, result);
    }
  }

  /**
   * Get cached tool result
   */
  async getCachedToolResult(
    toolName: string,
    key: string,
  ): Promise<CachedToolResult | undefined> {
    const cache = this.contextMemory.toolResults.get(toolName);
    if (!cache) {
      return undefined;
    }

    return await cache.get(key);
  }

  /**
   * Cleanup expired entries and enforce memory limits
   */
  async cleanup(): Promise<void> {
    const startTime = Date.now();

    // Cleanup tool result caches
    for (const [_toolName, cache] of this.contextMemory.toolResults.entries()) {
      await cache.cleanup();
    }

    // Cleanup file contexts based on LRU and TTL
    await this.cleanupFileContexts();

    // Cleanup session history
    await this.cleanupSessionHistory();

    // Check memory pressure and emit event if needed
    const stats = await this.getStats();
    if (stats.memoryPressure !== 'low') {
      this.eventEmitter.emit('memoryPressureChanged', stats.memoryPressure);
    }

    // Save memory state to disk
    await this.saveMemoryState();

    // Emit cleanup event
    this.eventEmitter.emit('memoryCleanup', stats);

    console.log(`Memory cleanup completed in ${Date.now() - startTime}ms`);
  }

  /**
   * Get memory usage statistics
   */
  async getStats(): Promise<MemoryStats> {
    const totalMemoryUsage = await this.calculateMemoryUsage();
    const fileCount = this.contextMemory.fileStates.size;
    const summaryCount = this.contextMemory.sessionHistory.length;

    let cachedResultCount = 0;
    const cacheHitRatios: Record<string, number> = {};

    for (const [toolName, cache] of this.contextMemory.toolResults.entries()) {
      const cacheStats = await cache.getStats();
      cachedResultCount += cacheStats.itemCount;
      cacheHitRatios[toolName] = cacheStats.hitRatio;
    }

    const memoryPressure = this.calculateMemoryPressure(totalMemoryUsage);

    return {
      totalMemoryUsage,
      fileCount,
      summaryCount,
      cachedResultCount,
      cacheHitRatios,
      lastCleanup: Date.now(),
      memoryPressure,
    };
  }

  /**
   * Serialize memory state for persistence
   */
  async serialize(): Promise<SerializedMemory> {
    const fileStates: Record<string, FileContext> = {};
    for (const [path, context] of this.contextMemory.fileStates.entries()) {
      fileStates[path] = context;
    }

    const toolResults: Record<
      string,
      {
        toolName: string;
        results: Record<string, CachedToolResult>;
        stats: CacheStats;
      }
    > = {};
    for (const [toolName, cache] of this.contextMemory.toolResults.entries()) {
      const stats = await cache.getStats();
      const results: Record<string, CachedToolResult> = {};

      // Extract cached results from the Map
      for (const [key, cachedResult] of cache.results.entries()) {
        // Only serialize non-expired results
        const age = Date.now() - cachedResult.timestamp;
        if (age <= cachedResult.ttl) {
          results[key] = cachedResult;
        }
      }

      toolResults[toolName] = {
        toolName,
        results,
        stats,
      };
    }

    return {
      fileStates,
      projectKnowledge: this.contextMemory.projectKnowledge,
      sessionHistory: this.contextMemory.sessionHistory,
      toolResults,
      metadata: {
        version: '1.0.0',
        timestamp: Date.now(),
        config: this.config,
      },
    };
  }

  /**
   * Deserialize memory state from persistence
   */
  async deserialize(data: SerializedMemory): Promise<void> {
    // Restore file states
    this.contextMemory.fileStates.clear();
    for (const [path, context] of Object.entries(data.fileStates)) {
      this.contextMemory.fileStates.set(path, context);
    }

    // Restore project knowledge
    this.contextMemory.projectKnowledge = data.projectKnowledge;

    // Restore session history
    this.contextMemory.sessionHistory = data.sessionHistory;

    // Restore tool results (simplified - would need better implementation)
    this.contextMemory.toolResults.clear();
    for (const [toolName, _cacheData] of Object.entries(data.toolResults)) {
      const cache = new ToolResultCache(toolName, {
        maxSize: this.config.toolResultsConfig.maxCacheSize,
        defaultTtl: this.config.toolResultsConfig.defaultTtl,
        maxResultSize: this.config.toolResultsConfig.maxResultSize,
        cleanupInterval: 5 * 60 * 1000,
      });
      this.contextMemory.toolResults.set(toolName, cache);
    }
  }

  /**
   * Event emitter methods
   */
  on(event: 'initialized', listener: (config: MemoryConfig) => void): void;
  on(
    event: 'fileContextUpdated',
    listener: (filePath: string, context: FileContext) => void,
  ): void;
  on(
    event: 'projectContextUpdated',
    listener: (context: ProjectContext) => void,
  ): void;
  on(
    event: 'conversationSummaryAdded',
    listener: (summary: ConversationSummary) => void,
  ): void;
  on(
    event: 'toolResultCached',
    listener: (toolName: string, key: string, result: CachedToolResult) => void,
  ): void;
  on(event: 'memoryCleanup', listener: (stats: MemoryStats) => void): void;
  on(
    event: 'memoryPressureChanged',
    listener: (level: 'low' | 'medium' | 'high') => void,
  ): void;
  on(event: string, listener: (...args: unknown[]) => void): void {
    this.eventEmitter.on(event, listener);
  }

  off(event: string, listener: (...args: unknown[]) => void): void {
    this.eventEmitter.off(event, listener);
  }

  emit(event: string, ...args: unknown[]): boolean {
    return this.eventEmitter.emit(event, ...args);
  }

  /**
   * Destroy the memory manager and cleanup resources
   */
  async destroy(): Promise<void> {
    // Stop cleanup timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }

    // Destroy tool result caches
    for (const cache of this.contextMemory.toolResults.values()) {
      cache.destroy();
    }

    // Save final state
    await this.saveMemoryState();

    // Remove all event listeners
    this.eventEmitter.removeAllListeners();
  }

  /**
   * Validate configuration
   */
  private validateConfig(config: MemoryConfig): void {
    if (config.maxMemorySize <= 0) {
      throw new Error(
        'Invalid memory configuration: maxMemorySize must be positive',
      );
    }

    if (config.fileStatesConfig.maxFiles <= 0) {
      throw new Error(
        'Invalid memory configuration: fileStatesConfig.maxFiles must be positive',
      );
    }

    if (config.sessionHistoryConfig.maxSessions <= 0) {
      throw new Error(
        'Invalid memory configuration: sessionHistoryConfig.maxSessions must be positive',
      );
    }

    if (config.toolResultsConfig.maxCacheSize <= 0) {
      throw new Error(
        'Invalid memory configuration: toolResultsConfig.maxCacheSize must be positive',
      );
    }
  }

  /**
   * Load memory state from disk
   */
  private async loadMemoryState(): Promise<void> {
    if (!this.memoryFilePath) return;

    try {
      await fs.access(this.memoryFilePath);
      const data = await fs.readFile(this.memoryFilePath, 'utf-8');
      const serializedMemory: SerializedMemory = JSON.parse(data);
      await this.deserialize(serializedMemory);
    } catch {
      // File doesn't exist or is invalid, start fresh
      console.log('No existing memory state found, starting fresh');
    }
  }

  /**
   * Save memory state to disk
   */
  private async saveMemoryState(): Promise<void> {
    if (!this.memoryFilePath) return;

    try {
      const serialized = await this.serialize();
      const dir = path.dirname(this.memoryFilePath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(
        this.memoryFilePath,
        JSON.stringify(serialized, null, 2),
        'utf-8',
      );
    } catch (error) {
      console.error('Failed to save memory state:', error);
    }
  }

  /**
   * Detect and analyze current project
   */
  private async detectAndAnalyzeProject(): Promise<ProjectContext> {
    const cwd = process.cwd();

    try {
      return await this.projectContextManager.analyzeProject(cwd);
    } catch (error) {
      console.warn('Failed to analyze project context:', error);

      // Return minimal project context
      return {
        rootPath: cwd,
        name: path.basename(cwd),
        type: 'generic',
        languages: [],
        frameworks: [],
        configFiles: [],
        dependencies: [],
        patterns: [],
        structure: {
          name: path.basename(cwd),
          path: cwd,
          isDirectory: true,
          children: [],
          fileCount: 0,
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
      };
    }
  }

  /**
   * Cleanup file contexts based on LRU and TTL
   */
  private async cleanupFileContexts(): Promise<void> {
    const maxFiles = this.config.fileStatesConfig.maxFiles;
    const ttl = this.config.fileStatesConfig.ttl;
    const cutoffTime = Date.now() - ttl;

    // Remove expired contexts
    const expiredKeys: string[] = [];
    for (const [path, context] of this.contextMemory.fileStates.entries()) {
      if (context.lastUpdated < cutoffTime) {
        expiredKeys.push(path);
      }
    }

    for (const key of expiredKeys) {
      this.contextMemory.fileStates.delete(key);
    }

    // Enforce max files limit using LRU
    if (this.contextMemory.fileStates.size > maxFiles) {
      const sortedContexts = Array.from(
        this.contextMemory.fileStates.entries(),
      ).sort(([, a], [, b]) => a.lastUpdated - b.lastUpdated);

      const keysToRemove = sortedContexts
        .slice(0, this.contextMemory.fileStates.size - maxFiles)
        .map(([path]) => path);

      for (const key of keysToRemove) {
        this.contextMemory.fileStates.delete(key);
      }
    }
  }

  /**
   * Cleanup session history
   */
  private async cleanupSessionHistory(): Promise<void> {
    const maxAge = this.config.sessionHistoryConfig.maxAge;
    const cutoffTime = Date.now() - maxAge;

    this.contextMemory.sessionHistory =
      this.contextMemory.sessionHistory.filter(
        (summary) => summary.endTime > cutoffTime,
      );
  }

  /**
   * Enforce memory limits
   */
  private async enforceMemoryLimits(): Promise<void> {
    const currentUsage = await this.calculateMemoryUsage();

    if (currentUsage > this.config.maxMemorySize) {
      // Implement aggressive cleanup
      await this.aggressiveCleanup();
    }
  }

  /**
   * Perform aggressive cleanup when memory limits are exceeded
   */
  private async aggressiveCleanup(): Promise<void> {
    // Remove half of the file contexts (LRU)
    const fileContexts = Array.from(
      this.contextMemory.fileStates.entries(),
    ).sort(([, a], [, b]) => a.lastUpdated - b.lastUpdated);

    const toRemove = Math.floor(fileContexts.length / 2);
    for (let i = 0; i < toRemove; i++) {
      this.contextMemory.fileStates.delete(fileContexts[i][0]);
    }

    // Remove half of the session history
    const historyToRemove = Math.floor(
      this.contextMemory.sessionHistory.length / 2,
    );
    this.contextMemory.sessionHistory =
      this.contextMemory.sessionHistory.slice(historyToRemove);

    // Clear tool result caches
    for (const cache of this.contextMemory.toolResults.values()) {
      await cache.clear();
    }
  }

  /**
   * Calculate total memory usage
   */
  private async calculateMemoryUsage(): Promise<number> {
    let totalSize = 0;

    // File contexts size
    for (const context of this.contextMemory.fileStates.values()) {
      totalSize += this.estimateObjectSize(context);
    }

    // Project knowledge size
    totalSize += this.estimateObjectSize(this.contextMemory.projectKnowledge);

    // Session history size
    for (const summary of this.contextMemory.sessionHistory) {
      totalSize += this.estimateObjectSize(summary);
    }

    // Tool results size
    for (const cache of this.contextMemory.toolResults.values()) {
      const stats = await cache.getStats();
      totalSize += stats.totalSize;
    }

    return totalSize;
  }

  /**
   * Estimate object size in bytes
   */
  private estimateObjectSize(obj: unknown): number {
    const jsonString = JSON.stringify(obj);
    return new Blob([jsonString]).size;
  }

  /**
   * Calculate memory pressure level
   */
  private calculateMemoryPressure(
    currentUsage: number,
  ): 'low' | 'medium' | 'high' {
    const ratio = currentUsage / this.config.maxMemorySize;

    if (ratio < 0.6) return 'low';
    if (ratio < 0.8) return 'medium';
    return 'high';
  }

  /**
   * Schedule cleanup operations
   */
  private scheduleCleanup(): void {
    const interval = this.config.fileStatesConfig.checkInterval;
    this.cleanupTimer = setInterval(() => {
      this.cleanup().catch((error) => {
        console.error('Cleanup failed:', error);
      });
    }, interval);
  }
}
