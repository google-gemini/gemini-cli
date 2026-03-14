/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';

/**
 * Discovers and returns JIT (Just-In-Time) subdirectory context for a given
 * file or directory path. This is used by "high-intent" tools (read_file,
 * list_directory, write_file, replace, read_many_files) to dynamically load
 * GEMINI.md context files from subdirectories when the agent accesses them.
 *
 * @param config - The runtime configuration.
 * @param accessedPath - The absolute path being accessed by the tool.
 * @returns The discovered context string, or empty string if none found or JIT is disabled.
 */
export async function discoverJitContext(
  config: Config,
  accessedPath: string,
): Promise<string> {
  if (!config.isJitContextEnabled?.()) {
    return '';
  }

  const contextManager = config.getContextManager();
  if (!contextManager) {
    return '';
  }

  const trustedRoots = [...config.getWorkspaceContext().getDirectories()];

  try {
    return await contextManager.discoverContext(accessedPath, trustedRoots);
  } catch {
    // JIT context is supplementary — never fail the tool's primary operation.
    return '';
  }
}

/**
 * Format string to delimit JIT context in tool output.
 */
export const JIT_CONTEXT_PREFIX =
  '\n\n--- Newly Discovered Project Context ---\n';
export const JIT_CONTEXT_SUFFIX = '\n--- End Project Context ---';

/**
 * Appends JIT context to tool LLM content if any was discovered.
 * Returns the original content unchanged if no context was found.
 *
 * @param llmContent - The original tool output content.
 * @param jitContext - The discovered JIT context string.
 * @returns The content with JIT context appended, or unchanged if empty.
 */
export function appendJitContext(
  llmContent: string,
  jitContext: string,
): string {
  if (!jitContext) {
    return llmContent;
  }
  return `${llmContent}${JIT_CONTEXT_PREFIX}${jitContext}${JIT_CONTEXT_SUFFIX}`;
}
