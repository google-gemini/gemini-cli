/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { MemoryManager } from './MemoryManager.js';
import { PromptAssembler } from '../prompt-system/PromptAssembler.js';
import {
  TaskContext,
  AssemblyResult,
} from '../prompt-system/interfaces/prompt-assembly.js';
import {
  MemoryConfig,
  ConversationSummary,
  FileContext,
  DirectoryNode,
} from './memory-interfaces.js';
import { BaseTool, ToolResult } from '../tools/tools.js';

/**
 * Integration layer between memory system and prompt assembly
 */
export class MemoryIntegration {
  private memoryManager: MemoryManager;
  private originalPromptAssembler?: PromptAssembler;

  constructor(memoryManager: MemoryManager) {
    this.memoryManager = memoryManager;
  }

  /**
   * Enhance PromptAssembler with memory-aware context
   */
  enhancePromptAssembler(
    promptAssembler: PromptAssembler,
  ): MemoryAwarePromptAssembler {
    this.originalPromptAssembler = promptAssembler;
    return new MemoryAwarePromptAssembler(promptAssembler, this.memoryManager);
  }

  /**
   * Create memory-aware tool wrapper
   */
  createMemoryAwareTool<
    TParams,
    TResult extends ToolResult,
    T extends BaseTool<TParams, TResult>,
  >(tool: T): MemoryAwareTool<T> {
    return new MemoryAwareTool(tool, this.memoryManager);
  }

  /**
   * Get default memory configuration
   */
  static getDefaultConfig(): MemoryConfig {
    return {
      maxMemorySize: 100 * 1024 * 1024, // 100MB
      fileStatesConfig: {
        maxFiles: 2000,
        ttl: 24 * 60 * 60 * 1000, // 24 hours
        checkInterval: 5 * 60 * 1000, // 5 minutes
      },
      sessionHistoryConfig: {
        maxSessions: 50,
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        compressionRatio: 0.3,
      },
      toolResultsConfig: {
        maxCacheSize: 20 * 1024 * 1024, // 20MB
        defaultTtl: 60 * 60 * 1000, // 1 hour
        maxResultSize: 2 * 1024 * 1024, // 2MB
      },
      projectContextConfig: {
        analysisInterval: 30 * 60 * 1000, // 30 minutes
        maxPatterns: 100,
        maxDependencies: 2000,
      },
    };
  }
}

/**
 * Memory-aware prompt assembler that includes context from memory
 */
export class MemoryAwarePromptAssembler {
  constructor(
    private baseAssembler: PromptAssembler,
    private memoryManager: MemoryManager,
  ) {}

  /**
   * Assemble prompt with memory context
   */
  async assemblePrompt(context: TaskContext): Promise<AssemblyResult> {
    // Get base assembly result
    const baseResult = await this.baseAssembler.assemblePrompt(context);

    // Enhance with memory context
    const memoryContext = await this.buildMemoryContext(context);

    // Combine base prompt with memory context
    const enhancedPrompt = this.combinePromptWithMemory(
      baseResult.prompt,
      memoryContext,
    );

    return {
      ...baseResult,
      prompt: enhancedPrompt,
      warnings: [...baseResult.warnings, ...memoryContext.warnings],
      metadata: {
        ...baseResult.metadata,
        memoryContext: {
          fileContextsIncluded: memoryContext.fileContexts.length,
          sessionHistoryIncluded: memoryContext.sessionHistory.length,
          projectPatternsIncluded: memoryContext.projectPatterns.length,
          memoryTokens: memoryContext.estimatedTokens,
        },
      } as typeof baseResult.metadata & {
        memoryContext: {
          fileContextsIncluded: number;
          sessionHistoryIncluded: number;
          projectPatternsIncluded: number;
          memoryTokens: number;
        };
      },
    };
  }

  /**
   * Build memory context for prompt assembly
   */
  private async buildMemoryContext(
    context: TaskContext,
  ): Promise<MemoryContextData> {
    const memoryContext: MemoryContextData = {
      fileContexts: [],
      sessionHistory: [],
      projectPatterns: [],
      estimatedTokens: 0,
      warnings: [],
    };

    try {
      // Get project context
      const projectContext = this.memoryManager.getProjectContext();

      // Include relevant coding patterns
      if (projectContext.patterns) {
        memoryContext.projectPatterns = projectContext.patterns
          .filter((pattern) => pattern.confidence > 0.7)
          .slice(0, 5); // Limit to top 5 patterns
      }

      // Get relevant file contexts based on current working directory
      const cwd = process.cwd();
      const recentFiles = await this.getRecentFileContexts(cwd, 10);
      memoryContext.fileContexts = recentFiles;

      // Get recent session history
      const recentSessions = await this.getRecentSessionHistory(3);
      memoryContext.sessionHistory = recentSessions;

      // Estimate token usage
      memoryContext.estimatedTokens = this.estimateMemoryTokens(memoryContext);

      // Check if we're within token budget
      if (
        context.tokenBudget &&
        memoryContext.estimatedTokens > context.tokenBudget * 0.3
      ) {
        // Reduce memory context if it's too large
        memoryContext.warnings.push(
          'Memory context reduced due to token budget constraints',
        );
        this.reduceMemoryContext(memoryContext, context.tokenBudget * 0.3);
      }
    } catch (error) {
      memoryContext.warnings.push(`Failed to load memory context: ${error}`);
    }

    return memoryContext;
  }

  /**
   * Get recent file contexts from current directory
   */
  private async getRecentFileContexts(
    basePath: string,
    limit: number,
  ): Promise<FileContext[]> {
    try {
      const fileContexts: FileContext[] = [];

      // Get all file contexts from memory manager
      const projectContext = this.memoryManager.getProjectContext();

      // If we have a project structure, use it to find relevant files
      if (projectContext.structure) {
        const relevantFiles = this.findRelevantFilesInStructure(
          projectContext.structure,
          basePath,
        );

        // Get file contexts for these files, prioritizing recently accessed ones
        for (const filePath of relevantFiles.slice(0, limit)) {
          const fileContext = await this.memoryManager.getFileContext(filePath);
          if (fileContext) {
            fileContexts.push(fileContext);
          }
        }
      }

      // Sort by last accessed/updated time
      fileContexts.sort(
        (a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0),
      );

      return fileContexts.slice(0, limit);
    } catch (error) {
      console.warn('Failed to get recent file contexts:', error);
      return [];
    }
  }

  /**
   * Get recent session history
   */
  private async getRecentSessionHistory(
    limit: number,
  ): Promise<ConversationSummary[]> {
    try {
      // Get session history from memory manager
      const sessionHistory = this.memoryManager.getSessionHistory();

      // Sort by end time (most recent first) and limit
      return sessionHistory
        .sort((a, b) => b.endTime - a.endTime)
        .slice(0, limit);
    } catch (error) {
      console.warn('Failed to get recent session history:', error);
      return [];
    }
  }

  /**
   * Find relevant files in project structure relative to base path
   */
  private findRelevantFilesInStructure(
    structure: DirectoryNode,
    basePath: string,
  ): string[] {
    const relevantFiles: string[] = [];

    const traverseNode = (node: DirectoryNode, currentDepth: number = 0) => {
      // Stop if we've gone too deep
      if (currentDepth > 5) return;

      // If this is the base path or a child of it, prioritize its files
      const isRelevantPath =
        node.path.includes(basePath) || basePath.includes(node.path);

      // If it's a file (no children), add it to relevantFiles
      if (!node.children || node.children.length === 0) {
        if (isRelevantPath) {
          relevantFiles.push(node.path);
        }
        return;
      }

      // For directories, traverse children
      for (const child of node.children) {
        traverseNode(child, currentDepth + 1);
      }

      // Also add the current directory path if it contains files
      if (node.fileCount > 0 && isRelevantPath) {
        // Don't add directory paths, just traverse them
      }
    };

    traverseNode(structure);

    // Sort by relevance (files closer to basePath first)
    relevantFiles.sort((a, b) => {
      const aDistance = this.calculatePathDistance(a, basePath);
      const bDistance = this.calculatePathDistance(b, basePath);
      return aDistance - bDistance;
    });

    return relevantFiles;
  }

  /**
   * Calculate distance between two paths (lower is closer)
   */
  private calculatePathDistance(filePath: string, basePath: string): number {
    const fileSegments = filePath.split('/');
    const baseSegments = basePath.split('/');

    // Find common prefix length
    let commonLength = 0;
    const minLength = Math.min(fileSegments.length, baseSegments.length);

    for (let i = 0; i < minLength; i++) {
      if (fileSegments[i] === baseSegments[i]) {
        commonLength++;
      } else {
        break;
      }
    }

    // Distance is the sum of remaining segments
    return (
      fileSegments.length - commonLength + (baseSegments.length - commonLength)
    );
  }

  /**
   * Estimate token count for memory context
   */
  private estimateMemoryTokens(memoryContext: MemoryContextData): number {
    let tokens = 0;

    // File contexts
    for (const fileContext of memoryContext.fileContexts) {
      tokens += 50; // Base tokens for file info
      tokens += fileContext.dependencies.length * 5;
      tokens += fileContext.diagnostics.length * 20;
    }

    // Project patterns
    for (const pattern of memoryContext.projectPatterns) {
      tokens += 30; // Base tokens for pattern
      tokens += pattern.examples.length * 10;
    }

    // Session history
    for (const session of memoryContext.sessionHistory) {
      tokens += session.summaryTokens;
    }

    return tokens;
  }

  /**
   * Reduce memory context to fit within token budget
   */
  private reduceMemoryContext(
    memoryContext: MemoryContextData,
    maxTokens: number,
  ): void {
    while (memoryContext.estimatedTokens > maxTokens) {
      // Remove lowest priority items first
      if (memoryContext.fileContexts.length > 0) {
        memoryContext.fileContexts.pop();
      } else if (memoryContext.projectPatterns.length > 0) {
        memoryContext.projectPatterns.pop();
      } else if (memoryContext.sessionHistory.length > 0) {
        memoryContext.sessionHistory.pop();
      } else {
        break;
      }

      memoryContext.estimatedTokens = this.estimateMemoryTokens(memoryContext);
    }
  }

  /**
   * Combine base prompt with memory context
   */
  private combinePromptWithMemory(
    basePrompt: string,
    memoryContext: MemoryContextData,
  ): string {
    const memorySection = this.buildMemorySection(memoryContext);

    if (!memorySection) {
      return basePrompt;
    }

    // Insert memory section after the core identity but before task-specific guidance
    const sections = basePrompt.split('\n\n');
    const insertIndex = Math.min(2, sections.length - 1); // After identity and mandates

    sections.splice(insertIndex, 0, memorySection);

    return sections.join('\n\n');
  }

  /**
   * Build memory context section for prompt
   */
  private buildMemorySection(memoryContext: MemoryContextData): string {
    const sections: string[] = [];

    // Project patterns
    if (memoryContext.projectPatterns.length > 0) {
      sections.push('## Project Context\n');
      sections.push(
        'Based on analysis of this codebase, the following patterns are commonly used:\n',
      );

      for (const pattern of memoryContext.projectPatterns) {
        sections.push(`- **${pattern.name}**: ${pattern.description}`);
        if (pattern.examples.length > 0) {
          sections.push(
            `  Examples: ${pattern.examples.slice(0, 3).join(', ')}`,
          );
        }
      }
      sections.push('');
    }

    // File contexts
    if (memoryContext.fileContexts.length > 0) {
      sections.push('## Recent File Activity\n');

      for (const fileContext of memoryContext.fileContexts.slice(0, 5)) {
        sections.push(
          `- \`${fileContext.filePath}\`: ${fileContext.fileType} file`,
        );

        if (fileContext.diagnostics.length > 0) {
          const errorCount = fileContext.diagnostics.filter(
            (d) => d.severity === 'error',
          ).length;
          const warningCount = fileContext.diagnostics.filter(
            (d) => d.severity === 'warning',
          ).length;
          if (errorCount > 0 || warningCount > 0) {
            sections.push(
              `  Issues: ${errorCount} errors, ${warningCount} warnings`,
            );
          }
        }

        if (fileContext.dependencies.length > 0) {
          sections.push(
            `  Dependencies: ${fileContext.dependencies.length} files`,
          );
        }
      }
      sections.push('');
    }

    // Session history
    if (memoryContext.sessionHistory.length > 0) {
      sections.push('## Recent Session Context\n');

      for (const session of memoryContext.sessionHistory.slice(0, 2)) {
        sections.push(`- Previous session: ${session.summary}`);

        if (session.pendingTasks.length > 0) {
          sections.push(`  Pending tasks: ${session.pendingTasks.length}`);
        }

        if (session.insights.length > 0) {
          sections.push(
            `  Key insights: ${session.insights.slice(0, 2).join('; ')}`,
          );
        }
      }
      sections.push('');
    }

    return sections.length > 0 ? sections.join('\n') : '';
  }
}

/**
 * Memory-aware tool wrapper that caches results
 */
export class MemoryAwareTool<T extends BaseTool<unknown, ToolResult>> {
  constructor(
    private baseTool: T,
    private memoryManager: MemoryManager,
  ) {}

  /**
   * Execute tool with memory caching
   */
  async execute(
    params: Parameters<T['execute']>[0],
    signal: AbortSignal,
  ): Promise<ToolResult> {
    const cacheKey = this.generateCacheKey(params);

    // Check cache first
    const cachedResult = await this.memoryManager.getCachedToolResult(
      this.baseTool.name,
      cacheKey,
    );

    if (cachedResult && cachedResult.valid) {
      // Update access count and return cached result
      return cachedResult.result as ToolResult;
    }

    // Execute tool
    const startTime = Date.now();
    const result = await this.baseTool.execute(params, signal);
    const executionTime = Date.now() - startTime;

    // Cache the result
    await this.cacheResult(cacheKey, params, result, executionTime);

    // Update file contexts if this tool modifies files
    await this.updateFileContextsIfNeeded(
      params as Record<string, unknown>,
      result,
    );

    return result;
  }

  /**
   * Generate cache key for parameters
   */
  private generateCacheKey(params: unknown): string {
    const sortedParams = this.sortObject(params);
    return Buffer.from(JSON.stringify(sortedParams)).toString('base64');
  }

  /**
   * Cache tool result
   */
  private async cacheResult(
    key: string,
    params: unknown,
    result: ToolResult,
    executionTime: number,
  ): Promise<void> {
    const dependencies = this.extractDependencies(
      params as Record<string, unknown>,
    );
    const size = this.estimateResultSize(result);
    const ttl = this.calculateTtl(executionTime, size);

    await this.memoryManager.cacheToolResult(this.baseTool.name, key, {
      key,
      parameters: params as Record<string, unknown>,
      result,
      timestamp: Date.now(),
      ttl,
      accessCount: 0,
      lastAccessed: Date.now(),
      size,
      valid: true,
      dependencies,
    });
  }

  /**
   * Extract file dependencies from tool parameters
   */
  private extractDependencies(params: Record<string, unknown>): string[] {
    const dependencies: string[] = [];

    // Common file path parameters
    const fileParams = ['filePath', 'file', 'path', 'input', 'output'];

    for (const param of fileParams) {
      if (params[param] && typeof params[param] === 'string') {
        dependencies.push(params[param]);
      }
    }

    // Handle arrays of file paths
    if (Array.isArray(params.files)) {
      dependencies.push(...params.files.filter((f) => typeof f === 'string'));
    }

    return dependencies;
  }

  /**
   * Update file contexts after tool execution
   */
  private async updateFileContextsIfNeeded(
    params: Record<string, unknown>,
    _result: ToolResult,
  ): Promise<void> {
    // Update file contexts for tools that modify files
    const fileModifyingTools = ['write_file', 'edit', 'shell'];

    if (fileModifyingTools.includes(this.baseTool.name)) {
      const dependencies = this.extractDependencies(
        params as Record<string, unknown>,
      );

      for (const filePath of dependencies) {
        try {
          // Trigger file context update
          await this.memoryManager.updateFileContext(filePath, {
            lastUpdated: Date.now(),
          });
        } catch (error) {
          console.warn(`Failed to update file context for ${filePath}:`, error);
        }
      }
    }
  }

  /**
   * Estimate result size for caching decisions
   */
  private estimateResultSize(result: ToolResult): number {
    const resultString = JSON.stringify(result);
    return new Blob([resultString]).size;
  }

  /**
   * Calculate TTL based on execution time and result size
   */
  private calculateTtl(executionTime: number, size: number): number {
    // Base TTL
    let ttl = 60 * 60 * 1000; // 1 hour

    // Longer TTL for expensive operations
    if (executionTime > 5000) {
      // 5 seconds
      ttl = 24 * 60 * 60 * 1000; // 24 hours
    }

    // Shorter TTL for large results
    if (size > 1024 * 1024) {
      // 1MB
      ttl = 30 * 60 * 1000; // 30 minutes
    }

    return ttl;
  }

  /**
   * Sort object for consistent serialization
   */
  private sortObject(obj: unknown): unknown {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.sortObject(item));
    }

    const sorted: Record<string, unknown> = {};
    const keys = Object.keys(obj as Record<string, unknown>).sort();

    for (const key of keys) {
      sorted[key] = this.sortObject((obj as Record<string, unknown>)[key]);
    }

    return sorted;
  }

  // Delegate other BaseTool properties and methods
  get name(): string {
    return this.baseTool.name;
  }

  get displayName(): string {
    return this.baseTool.displayName;
  }

  get description(): string {
    return this.baseTool.description;
  }

  get parameters(): Record<string, unknown> {
    return this.baseTool.parameterSchema;
  }
}

/**
 * Memory context data structure
 */
interface MemoryContextData {
  fileContexts: FileContext[];
  sessionHistory: ConversationSummary[];
  projectPatterns: Array<{
    name: string;
    description: string;
    examples: string[];
    confidence: number;
  }>;
  estimatedTokens: number;
  warnings: string[];
}

/**
 * Factory for creating memory-integrated components
 */
export class MemoryIntegrationFactory {
  private memoryManager: MemoryManager;
  private integration: MemoryIntegration;

  constructor(config?: Partial<MemoryConfig>) {
    const _fullConfig = {
      ...MemoryIntegration.getDefaultConfig(),
      ...config,
    };

    this.memoryManager = new MemoryManager();
    this.integration = new MemoryIntegration(this.memoryManager);
  }

  /**
   * Initialize the memory system
   */
  async initialize(config?: Partial<MemoryConfig>): Promise<void> {
    const fullConfig = {
      ...MemoryIntegration.getDefaultConfig(),
      ...config,
    };

    await this.memoryManager.initialize(fullConfig);
  }

  /**
   * Create memory-aware prompt assembler
   */
  createPromptAssembler(
    baseAssembler: PromptAssembler,
  ): MemoryAwarePromptAssembler {
    return this.integration.enhancePromptAssembler(baseAssembler);
  }

  /**
   * Create memory-aware tool
   */
  createTool<T extends BaseTool<unknown, ToolResult>>(
    tool: T,
  ): MemoryAwareTool<T> {
    return this.integration.createMemoryAwareTool(tool);
  }

  /**
   * Get memory manager instance
   */
  getMemoryManager(): MemoryManager {
    return this.memoryManager;
  }

  /**
   * Destroy and cleanup
   */
  async destroy(): Promise<void> {
    await this.memoryManager.destroy();
  }
}
