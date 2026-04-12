/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Part, PartListUnion, PartUnion } from '@google/genai';
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

  const memoryContextManager = config.getMemoryContextManager();
  if (!memoryContextManager) {
    return '';
  }

  const trustedRoots = [...config.getWorkspaceContext().getDirectories()];

  try {
    return await memoryContextManager.discoverContext(
      accessedPath,
      trustedRoots,
    );
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

/**
 * Appends JIT context to non-string tool content (e.g., images, PDFs) by
 * wrapping both the original content and the JIT context into a Part array.
 *
 * @param llmContent - The original non-string tool output content.
 * @param jitContext - The discovered JIT context string.
 * @returns A Part array containing the original content and JIT context.
 */
export function appendJitContextToParts(
  llmContent: PartListUnion,
  jitContext: string,
): PartUnion[] {
  const jitPart: Part = {
    text: `${JIT_CONTEXT_PREFIX}${jitContext}${JIT_CONTEXT_SUFFIX}`,
  };
  const existingParts: PartUnion[] = Array.isArray(llmContent)
    ? llmContent
    : [llmContent];
  return [...existingParts, jitPart];
}
