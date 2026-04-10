/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Memory system for persistent storage of user preferences, project context,
 * and feedback across sessions.
 *
 * This module provides:
 * - MEMORY.md file discovery and loading (like Claude Code's claudemd)
 * - Session logging for tracking what happens in each conversation
 * - Background consolidation to keep memories accurate and up-to-date
 */

// Types
export {
  MEMORY_TYPES,
  parseMemoryType,
  type MemoryType,
  type MemoryFile,
  type MemoryFrontmatter,
  type MemoryIndexEntry,
  type MemoryLoadResult,
  type SessionLogEntry,
  type SessionLogFile,
} from './types.js';

// Memory discovery and loading
export {
  getMemoryDir,
  getMemoryEntrypoint,
  ensureMemoryDirExists,
  parseFrontmatter,
  createFrontmatter,
  createDefaultMemoryIndex,
  truncateEntrypointContent,
  readMemoryFile,
  scanMemoryFiles,
  loadMemoryDirectory,
  buildMemoryPrompt,
} from './memoryDiscovery.js';

// Session logging
export {
  getSessionLogsDir,
  getSessionLogPath,
  ensureSessionLogsDirExists,
  rotateSessionLogs,
  appendSessionLog,
  readSessionLog,
  readSessionLogsInRange,
  getRecentSessionLogs,
  summarizeSessionLogs,
} from './sessionLog.js';

// Memory consolidation
export {
  runConsolidation,
  spawnConsolidationWorker,
  maybeRunConsolidation,
} from './memoryConsolidation.js';