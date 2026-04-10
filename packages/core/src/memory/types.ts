/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Memory type taxonomy for the persistent memory system.
 *
 * Memories are constrained to four types capturing context NOT derivable
 * from the current project state. Code patterns, architecture, git history,
 * and file structure are derivable (via grep/git/GEMINI.md) and should NOT
 * be saved as memories.
 */

export const MEMORY_TYPES = ['user', 'feedback', 'project', 'reference'] as const;
export type MemoryType = (typeof MEMORY_TYPES)[number];

/**
 * Parse a raw frontmatter value into a MemoryType.
 * Invalid or missing values return undefined — legacy files without a
 * `type:` field keep working, files with unknown types degrade gracefully.
 */
export function parseMemoryType(raw: unknown): MemoryType | undefined {
  if (typeof raw !== 'string') return undefined;
  return MEMORY_TYPES.find((t) => t === raw);
}

/**
 * Parsed memory file with frontmatter and content.
 */
export interface MemoryFile {
  /** Absolute path to the memory file */
  path: string;
  /** Name from frontmatter */
  name: string;
  /** Description from frontmatter */
  description: string;
  /** Type from frontmatter */
  type: MemoryType;
  /** Raw content (without frontmatter) */
  content: string;
  /** Raw content including frontmatter */
  rawContent: string;
}

/**
 * Frontmatter structure for memory files.
 */
export interface MemoryFrontmatter {
  name: string;
  description: string;
  type: MemoryType;
}

/**
 * Entry in the MEMORY.md index file.
 * Each entry is a pointer to an actual memory file.
 */
export interface MemoryIndexEntry {
  title: string;
  path: string;
  hook: string;
}

/**
 * Result of loading the memory directory.
 */
export interface MemoryLoadResult {
  /** Path to the memory directory */
  memoryDir: string;
  /** Content of MEMORY.md index (if exists) */
  indexContent: string | null;
  /** All loaded memory files */
  files: MemoryFile[];
  /** Whether this is a new/empty memory system */
  isNew: boolean;
}

/**
 * Session log entry for daily logging.
 */
export interface SessionLogEntry {
  /** ISO timestamp of the session */
  timestamp: string;
  /** User's prompt */
  prompt: string;
  /** Summary of what was done */
  summary: string;
  /** Files that were modified */
  modifiedFiles: string[];
}

/**
 * Session log file structure.
 */
export interface SessionLogFile {
  /** Date of the log (YYYY-MM-DD) */
  date: string;
  /** Entries for this day */
  entries: SessionLogEntry[];
}