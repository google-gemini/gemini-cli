/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Core context memory system interfaces for Phase 2.3
 * Manages session state, file tracking, project knowledge, and tool result caching
 */

/**
 * File context tracking with modification history and dependencies
 */
export interface FileContext {
  /** Absolute path to the file */
  filePath: string;
  /** Last modification time */
  lastModified: number;
  /** File size in bytes */
  size: number;
  /** Content hash for change detection */
  contentHash: string;
  /** File type/extension */
  fileType: string;
  /** Encoding used (e.g., 'utf-8') */
  encoding: string;
  /** Whether file exists */
  exists: boolean;
  /** Git status if in repository */
  gitStatus?: 'untracked' | 'modified' | 'added' | 'deleted' | 'renamed' | 'clean';
  /** Files this file depends on (imports, includes, etc.) */
  dependencies: string[];
  /** Files that depend on this file */
  dependents: string[];
  /** Syntax errors or warnings */
  diagnostics: FileDiagnostic[];
  /** Cached metadata about the file */
  metadata: FileMetadata;
  /** When this context was last updated */
  lastUpdated: number;
}

export interface FileDiagnostic {
  /** Line number (1-based) */
  line: number;
  /** Column number (1-based) */
  column: number;
  /** Error or warning message */
  message: string;
  /** Severity level */
  severity: 'error' | 'warning' | 'info';
  /** Source of the diagnostic (e.g., 'typescript', 'eslint') */
  source: string;
}

export interface FileMetadata {
  /** Number of lines */
  lineCount: number;
  /** Token count estimation */
  tokenCount: number;
  /** Programming language */
  language?: string;
  /** Detected frameworks or libraries */
  frameworks: string[];
  /** Exported symbols/functions/classes */
  exports: string[];
  /** Imported modules */
  imports: string[];
  /** Function/class definitions */
  definitions: SymbolDefinition[];
}

export interface SymbolDefinition {
  /** Symbol name */
  name: string;
  /** Symbol type */
  type: 'function' | 'class' | 'interface' | 'type' | 'variable' | 'constant';
  /** Line where defined */
  line: number;
  /** Access level */
  access: 'public' | 'private' | 'protected';
  /** Documentation comment */
  documentation?: string;
}

/**
 * Project-level context and knowledge
 */
export interface ProjectContext {
  /** Project root directory */
  rootPath: string;
  /** Project name */
  name: string;
  /** Project type/framework */
  type: 'nodejs' | 'python' | 'java' | 'typescript' | 'react' | 'nextjs' | 'generic';
  /** Programming languages used */
  languages: string[];
  /** Frameworks and libraries detected */
  frameworks: string[];
  /** Build system (npm, yarn, gradle, etc.) */
  buildSystem?: string;
  /** Testing framework */
  testFramework?: string;
  /** Configuration files */
  configFiles: string[];
  /** Package/dependency information */
  dependencies: ProjectDependency[];
  /** Coding patterns and conventions */
  patterns: CodingPattern[];
  /** Directory structure overview */
  structure: DirectoryNode;
  /** Git information */
  git?: GitContext;
  /** Documentation files */
  documentation: string[];
  /** When this context was last analyzed */
  lastAnalyzed: number;
  /** Project-specific rules and preferences */
  preferences: ProjectPreferences;
}

export interface ProjectDependency {
  /** Package name */
  name: string;
  /** Version or version range */
  version: string;
  /** Dependency type */
  type: 'production' | 'development' | 'peer' | 'optional';
  /** Package manager */
  manager: 'npm' | 'yarn' | 'pnpm' | 'pip' | 'maven' | 'gradle';
}

export interface CodingPattern {
  /** Pattern name */
  name: string;
  /** Pattern description */
  description: string;
  /** Examples of the pattern */
  examples: string[];
  /** Confidence score (0-1) */
  confidence: number;
  /** Files where pattern is used */
  files: string[];
}

export interface DirectoryNode {
  /** Directory name */
  name: string;
  /** Full path */
  path: string;
  /** Whether it's a directory */
  isDirectory: boolean;
  /** Child nodes */
  children: DirectoryNode[];
  /** Number of files in directory */
  fileCount: number;
  /** Purpose/description of directory */
  purpose?: string;
}

export interface GitContext {
  /** Current branch */
  branch: string;
  /** Remote URL */
  remote?: string;
  /** Commit hash */
  commit: string;
  /** Modified files */
  modifiedFiles: string[];
  /** Untracked files */
  untrackedFiles: string[];
  /** Staged files */
  stagedFiles: string[];
}

export interface ProjectPreferences {
  /** Code style preferences */
  codeStyle: {
    indentation: 'spaces' | 'tabs';
    indentSize: number;
    lineEnding: 'lf' | 'crlf';
    maxLineLength: number;
  };
  /** Naming conventions */
  namingConventions: {
    functions: 'camelCase' | 'snake_case' | 'PascalCase';
    variables: 'camelCase' | 'snake_case' | 'PascalCase';
    classes: 'PascalCase' | 'camelCase';
    files: 'camelCase' | 'kebab-case' | 'snake_case' | 'PascalCase';
  };
  /** Architecture preferences */
  architecture: {
    testLocation: 'alongside' | 'separate' | 'mixed';
    importStyle: 'relative' | 'absolute' | 'mixed';
    componentStructure: 'flat' | 'nested' | 'feature-based';
  };
}

/**
 * Conversation history and context summaries
 */
export interface ConversationSummary {
  /** Unique identifier for the summary */
  id: string;
  /** Session identifier */
  sessionId: string;
  /** Start time of the conversation period */
  startTime: number;
  /** End time of the conversation period */
  endTime: number;
  /** Summary of the conversation */
  summary: string;
  /** Key topics discussed */
  topics: string[];
  /** Tasks completed */
  completedTasks: TaskSummary[];
  /** Tasks still pending */
  pendingTasks: TaskSummary[];
  /** Files that were modified */
  modifiedFiles: string[];
  /** Tools that were used */
  toolsUsed: string[];
  /** Important decisions made */
  decisions: Decision[];
  /** Key insights or learnings */
  insights: string[];
  /** Token count of original conversation */
  originalTokens: number;
  /** Token count of this summary */
  summaryTokens: number;
  /** Compression ratio */
  compressionRatio: number;
  /** Quality score of the summary */
  qualityScore: number;
}

export interface TaskSummary {
  /** Task description */
  description: string;
  /** Task status */
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  /** Priority level */
  priority: 'low' | 'medium' | 'high';
  /** Files involved */
  files: string[];
  /** Tools used */
  tools: string[];
  /** Outcome or result */
  outcome?: string;
}

export interface Decision {
  /** Decision description */
  description: string;
  /** Reasoning behind the decision */
  reasoning: string;
  /** Files affected by the decision */
  affectedFiles: string[];
  /** Timestamp of the decision */
  timestamp: number;
  /** Alternatives considered */
  alternatives: string[];
}

/**
 * Tool result caching for performance optimization
 */
export interface ToolResultCache {
  /** Tool name */
  toolName: string;
  /** Cached results */
  results: Map<string, CachedToolResult>;
  /** Maximum cache size */
  maxSize: number;
  /** Cache hit statistics */
  stats: CacheStats;
  /** Last cleanup time */
  lastCleanup: number;
  /** Cleanup interval in ms */
  cleanupInterval: number;
}

export interface CachedToolResult {
  /** Cache key (usually hashed parameters) */
  key: string;
  /** Tool parameters that generated this result */
  parameters: Record<string, unknown>;
  /** Tool result */
  result: unknown;
  /** When the result was cached */
  timestamp: number;
  /** Time to live in ms */
  ttl: number;
  /** Number of times this result was accessed */
  accessCount: number;
  /** Last access time */
  lastAccessed: number;
  /** Size in bytes (estimated) */
  size: number;
  /** Result validity state */
  valid: boolean;
  /** Dependencies that could invalidate this result */
  dependencies: string[];
}

export interface CacheStats {
  /** Total number of cache hits */
  hits: number;
  /** Total number of cache misses */
  misses: number;
  /** Hit ratio (hits / (hits + misses)) */
  hitRatio: number;
  /** Total cache size in bytes */
  totalSize: number;
  /** Number of cached items */
  itemCount: number;
  /** Number of evictions due to size limits */
  evictions: number;
  /** Number of expirations due to TTL */
  expirations: number;
}

/**
 * Main context memory interface as specified in PLAN.md
 */
export interface ContextMemory {
  /** File state tracking */
  fileStates: Map<string, FileContext>;
  /** Project-level knowledge */
  projectKnowledge: ProjectContext;
  /** Session history summaries */
  sessionHistory: ConversationSummary[];
  /** Tool result caches */
  toolResults: Map<string, ToolResultCache>;
}

/**
 * Memory management configuration
 */
export interface MemoryConfig {
  /** Maximum memory size in bytes */
  maxMemorySize: number;
  /** File state cache settings */
  fileStatesConfig: {
    maxFiles: number;
    ttl: number;
    checkInterval: number;
  };
  /** Session history settings */
  sessionHistoryConfig: {
    maxSessions: number;
    maxAge: number;
    compressionRatio: number;
  };
  /** Tool result cache settings */
  toolResultsConfig: {
    maxCacheSize: number;
    defaultTtl: number;
    maxResultSize: number;
  };
  /** Project context settings */
  projectContextConfig: {
    analysisInterval: number;
    maxPatterns: number;
    maxDependencies: number;
  };
}

/**
 * Memory operations interface
 */
export interface MemoryOperations {
  /** Initialize memory system */
  initialize(config: MemoryConfig): Promise<void>;
  /** Update file context */
  updateFileContext(filePath: string, context: Partial<FileContext>): Promise<void>;
  /** Get file context */
  getFileContext(filePath: string): Promise<FileContext | undefined>;
  /** Update project context */
  updateProjectContext(context: Partial<ProjectContext>): Promise<void>;
  /** Add conversation summary */
  addConversationSummary(summary: ConversationSummary): Promise<void>;
  /** Cache tool result */
  cacheToolResult(toolName: string, key: string, result: CachedToolResult): Promise<void>;
  /** Get cached tool result */
  getCachedToolResult(toolName: string, key: string): Promise<CachedToolResult | undefined>;
  /** Cleanup expired entries */
  cleanup(): Promise<void>;
  /** Get memory usage statistics */
  getStats(): Promise<MemoryStats>;
  /** Serialize memory state */
  serialize(): Promise<SerializedMemory>;
  /** Deserialize memory state */
  deserialize(data: SerializedMemory): Promise<void>;
}

export interface MemoryStats {
  /** Total memory usage in bytes */
  totalMemoryUsage: number;
  /** Number of tracked files */
  fileCount: number;
  /** Number of conversation summaries */
  summaryCount: number;
  /** Number of cached tool results */
  cachedResultCount: number;
  /** Cache hit ratios by tool */
  cacheHitRatios: Record<string, number>;
  /** Last cleanup time */
  lastCleanup: number;
  /** Memory pressure level */
  memoryPressure: 'low' | 'medium' | 'high';
}

export interface SerializedMemory {
  /** Serialized file states */
  fileStates: Record<string, FileContext>;
  /** Serialized project context */
  projectKnowledge: ProjectContext;
  /** Serialized session history */
  sessionHistory: ConversationSummary[];
  /** Serialized tool results */
  toolResults: Record<string, {
    toolName: string;
    results: Record<string, CachedToolResult>;
    stats: CacheStats;
  }>;
  /** Metadata about the serialization */
  metadata: {
    version: string;
    timestamp: number;
    config: MemoryConfig;
  };
}

/**
 * Memory events for integration with the prompt system
 */
export interface MemoryEventEmitter {
  /** Emitted when a file context is updated */
  on(event: 'fileContextUpdated', listener: (filePath: string, context: FileContext) => void): void;
  /** Emitted when project context is updated */
  on(event: 'projectContextUpdated', listener: (context: ProjectContext) => void): void;
  /** Emitted when a conversation summary is added */
  on(event: 'conversationSummaryAdded', listener: (summary: ConversationSummary) => void): void;
  /** Emitted when a tool result is cached */
  on(event: 'toolResultCached', listener: (toolName: string, key: string, result: CachedToolResult) => void): void;
  /** Emitted when memory cleanup occurs */
  on(event: 'memoryCleanup', listener: (stats: MemoryStats) => void): void;
  /** Emitted when memory pressure changes */
  on(event: 'memoryPressureChanged', listener: (level: 'low' | 'medium' | 'high') => void): void;
}