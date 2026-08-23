/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Reconstructs the pre-session workspace state from session
 * tool call records.
 *
 * By walking a ConversationRecord's tool calls in chronological order, we can
 * infer which files existed before the agent started (files that were read
 * before any write occurred to them) and what their initial contents were.
 * Files that were only written but never read first are treated as newly
 * created by the agent and are excluded from the reconstructed workspace.
 */

import path from 'node:path';
import type {
  ConversationRecord,
  ToolCallRecord,
} from '@google/gemini-cli-core';

export interface WorkspaceFiles {
  /**
   * A map of workspace-relative (or absolute) file paths to their initial
   * contents — i.e., the state before the agent modified anything.
   * This maps directly onto the `files` property of an EvalCase.
   */
  files: Record<string, string>;

  /**
   * The inferred workspace root directory (common ancestor of all file paths).
   * May be undefined if no file paths were encountered.
   */
  workspaceRoot: string | undefined;

  /**
   * All file paths that the agent read during the session.
   */
  readPaths: string[];

  /**
   * All file paths that the agent wrote or edited during the session.
   */
  writtenPaths: string[];

  /**
   * All tool names that were called and completed successfully.
   */
  observedTools: string[];
}

/** Tool names that indicate a file read */
const READ_TOOLS = new Set(['read_file', 'read_many_files']);

/** Tool names that indicate a file write (creation or overwrite) */
const WRITE_TOOLS = new Set(['write_file']);

/** Tool names that indicate an in-place edit */
const EDIT_TOOLS = new Set(['replace']);

/** Extracts file paths from the args of a read_file tool call. */
function extractReadPaths(args: Record<string, unknown>): string[] {
  const paths: string[] = [];

  // read_file: { path: string }
  if (typeof args['path'] === 'string' && args['path']) {
    paths.push(args['path']);
  }

  // read_many_files: { paths: string[] }
  if (Array.isArray(args['paths'])) {
    for (const p of args['paths']) {
      if (typeof p === 'string' && p) paths.push(p);
    }
  }

  return paths;
}

/** Extracts the file path and content from a write_file tool call's result. */
function extractWriteInfo(
  args: Record<string, unknown>,
): { filePath: string; content: string } | undefined {
  const filePath = typeof args['path'] === 'string' ? args['path'] : undefined;
  const content =
    typeof args['content'] === 'string' ? args['content'] : undefined;

  if (!filePath) return undefined;
  return { filePath, content: content ?? '' };
}

/** Extracts the file path from a replace tool call. */
function extractEditPath(args: Record<string, unknown>): string | undefined {
  return typeof args['path'] === 'string' ? args['path'] : undefined;
}

/**
 * Extracts file content from a read_file tool result.
 * Results are PartListUnion — we try to find a text part.
 */
function extractReadContent(result: unknown): string | undefined {
  if (typeof result === 'string') return result;

  if (Array.isArray(result)) {
    const textParts = result
      .filter(
        (p): p is { text: string } =>
          typeof p === 'object' &&
          p !== null &&
          'text' in p &&
          typeof (p as { text: unknown }).text === 'string',
      )
      .map((p) => p.text);
    if (textParts.length > 0) return textParts.join('');
  }

  return undefined;
}

/**
 * Infers the common ancestor directory of a list of absolute paths.
 * Returns undefined if the list is empty or paths are not absolute.
 *
 * Handles both forward-slash and backslash paths, normalizing to the
 * platform separator before comparing components.
 */
export function inferWorkspaceRoot(filePaths: string[]): string | undefined {
  // Normalize all paths to use the platform separator and resolve '..'
  const absPaths = filePaths
    .map((p) => p.replace(/[\\/]/g, path.sep)) // normalize separators
    .filter((p) => path.isAbsolute(p));

  if (absPaths.length === 0) return undefined;

  // Split each path into its components
  const parts = absPaths.map((p) => p.split(path.sep));
  const [first, ...rest] = parts;

  // Find the longest common prefix of path components
  let common = first;
  for (const other of rest) {
    const shorter = Math.min(common.length, other.length);
    let i = 0;
    while (i < shorter && common[i] === other[i]) i++;
    common = common.slice(0, i);
  }

  if (common.length === 0) return undefined;

  const candidate = common.join(path.sep);
  return candidate || undefined;
}

/**
 * Collects all tool calls from a ConversationRecord's messages in
 * chronological order.
 */
function collectToolCalls(conversation: ConversationRecord): ToolCallRecord[] {
  const calls: ToolCallRecord[] = [];
  for (const message of conversation.messages) {
    if (message.type === 'gemini' && Array.isArray(message.toolCalls)) {
      calls.push(...message.toolCalls);
    }
  }
  return calls;
}

/**
 * Reconstructs the pre-session workspace state from a ConversationRecord.
 *
 * A file is included in the reconstructed workspace if:
 *  - It was read via `read_file` or `read_many_files` AND the tool call
 *    completed successfully (status === 'complete'), AND
 *  - The read happened BEFORE any write to that path.
 *
 * Files that were only written (never read first) are newly created by the
 * agent and are NOT included in the pre-session workspace.
 */
export function extractWorkspaceFiles(
  conversation: ConversationRecord,
): WorkspaceFiles {
  const toolCalls = collectToolCalls(conversation);

  // Track state per path
  const preSessionFiles: Record<string, string> = {}; // path → original content
  const writtenPaths = new Set<string>();
  const readPaths: string[] = [];
  const allObservedTools: string[] = [];

  for (const call of toolCalls) {
    const toolName = call.name;
    const args =
      typeof call.args === 'object' && call.args !== null
        ? (call.args as Record<string, unknown>)
        : {};
    const isComplete = call.status === 'complete';

    if (!isComplete) continue; // Skip failed/cancelled tool calls

    // Track all successful tool names for assertion generation
    if (!allObservedTools.includes(toolName)) {
      allObservedTools.push(toolName);
    }

    if (READ_TOOLS.has(toolName)) {
      const paths = extractReadPaths(args);
      for (const filePath of paths) {
        readPaths.push(filePath);
        // Only record the pre-session content if this file hasn't been
        // written to yet (i.e., it existed before the session started)
        if (!writtenPaths.has(filePath) && !(filePath in preSessionFiles)) {
          const content = extractReadContent(call.result);
          if (content !== undefined) {
            preSessionFiles[filePath] = content;
          }
        }
      }
    } else if (WRITE_TOOLS.has(toolName)) {
      const info = extractWriteInfo(args);
      if (info) {
        writtenPaths.add(info.filePath);
      }
    } else if (EDIT_TOOLS.has(toolName)) {
      const filePath = extractEditPath(args);
      if (filePath) {
        writtenPaths.add(filePath);
      }
    }
  }

  // Collect all file paths to infer workspace root
  const allPaths = [
    ...Object.keys(preSessionFiles),
    ...Array.from(writtenPaths),
  ];
  const workspaceRoot = inferWorkspaceRoot(allPaths);

  return {
    files: preSessionFiles,
    workspaceRoot,
    readPaths: [...new Set(readPaths)],
    writtenPaths: Array.from(writtenPaths),
    observedTools: allObservedTools,
  };
}

/**
 * Extracts the first user-typed prompt from a ConversationRecord.
 * Returns undefined if no user message is found.
 */
export function extractUserPrompt(
  conversation: ConversationRecord,
): string | undefined {
  for (const message of conversation.messages) {
    if (message.type !== 'user') continue;

    const content = message.content;
    if (typeof content === 'string' && content.trim()) {
      return content.trim();
    }
    if (Array.isArray(content)) {
      const text = content
        .filter(
          (p): p is { text: string } =>
            typeof p === 'object' &&
            p !== null &&
            'text' in p &&
            typeof (p as { text: unknown }).text === 'string',
        )
        .map((p) => p.text)
        .join('');
      if (text.trim()) return text.trim();
    }
  }
  return undefined;
}
