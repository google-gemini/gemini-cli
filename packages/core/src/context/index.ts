/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Export existing context system
export { ChunkRegistry } from './ChunkRegistry.js';
export { ContextLogger } from './ContextLogger.js';
export { ContextManager } from './ContextManager.js';
export { ContextPruner } from './ContextPruner.js';
export { FallbackStrategy } from './FallbackStrategies.js';

// Export memory system interfaces
export type {
  ContextMemory,
  FileContext,
  FileDiagnostic,
  FileMetadata,
  SymbolDefinition,
  ProjectContext,
  ProjectDependency,
  CodingPattern,
  DirectoryNode,
  GitContext,
  ProjectPreferences,
  ConversationSummary,
  TaskSummary,
  Decision,
  ToolResultCache as IToolResultCache,
  CachedToolResult,
  CacheStats,
  MemoryConfig,
  MemoryOperations,
  MemoryStats,
  SerializedMemory,
  MemoryEventEmitter,
} from './memory-interfaces.js';

// Export memory system implementations
export { MemoryManager } from './MemoryManager.js';
export { FileContextManager } from './FileContextManager.js';
export { ProjectContextManager } from './ProjectContextManager.js';
export { ToolResultCache } from './ToolResultCache.js';

// Export memory integration
export {
  MemoryIntegration,
  MemoryAwarePromptAssembler,
  MemoryAwareTool,
  MemoryIntegrationFactory,
} from './MemoryIntegration.js';

// Export existing context types for backward compatibility
export type {
  ConversationChunk,
  ChunkMetadata,
  ScoringWeights,
  ContextWindow,
  ContextOptimizationConfig,
  RelevanceQuery,
  ScoringResult,
  PruningStats,
} from './types.js';
