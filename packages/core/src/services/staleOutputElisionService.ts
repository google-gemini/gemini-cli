/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content, Part } from '@google/genai';
import path from 'node:path';
import { estimateTokenCountSync } from '../utils/tokenCalculation.js';
import { debugLogger } from '../utils/debugLogger.js';
import type { Config } from '../config/config.js';
import { logStaleOutputElision } from '../telemetry/loggers.js';
import { StaleOutputElisionEvent } from '../telemetry/types.js';
import {
  READ_FILE_TOOL_NAME,
  READ_MANY_FILES_TOOL_NAME,
  EDIT_TOOL_NAME,
  WRITE_FILE_TOOL_NAME,
} from '../tools/tool-names.js';

/**
 * XML-style tag used as the elision indicator. Allows idempotency checks and
 * future tooling to identify elided outputs.
 */
export const STALE_OUTPUT_ELISION_TAG = 'stale_output_elided';

/**
 * Minimum number of tokens a read output must occupy before we consider
 * eliding it. Tiny reads are not worth the overhead of tracking.
 */
export const MIN_TOKENS_TO_ELIDE = 100;

/**
 * Tool names that produce stale outputs when a subsequent write occurs.
 */
const READ_TOOL_NAMES = new Set([
  READ_FILE_TOOL_NAME,
  READ_MANY_FILES_TOOL_NAME,
]);

/**
 * Tool names that invalidate prior read outputs for the same file path.
 */
const WRITE_TOOL_NAMES = new Set([EDIT_TOOL_NAME, WRITE_FILE_TOOL_NAME]);

export interface ElisionResult {
  newHistory: Content[];
  elisionCount: number;
  tokensSaved: number;
}

/**
 * Represents a write tool invocation extracted from history.
 */
interface WriteEntry {
  /** Resolved, normalised absolute file path. */
  filePath: string;
  /** Index of the Content block in the history array. */
  contentIndex: number;
  /** Name of the write tool (edit / write_file). */
  toolName: string;
}

/**
 * Represents a read tool response that is a candidate for elision.
 */
interface ReadCandidate {
  contentIndex: number;
  partIndex: number;
  filePath: string;
  tokens: number;
}

/**
 * Service to elide stale tool read outputs from chat history.
 *
 * When the agent reads a file (via `read_file` or `read_many_files`) and
 * subsequently modifies it (via `edit` or `write_file`), the original read
 * output in history is now stale – it describes a file version that no longer
 * exists on disk. This service retroactively replaces the stale content with a
 * compact elision marker, saving context window tokens and preventing the model
 * from being confused by outdated file content.
 *
 * ## Algorithm  (two forward-passes, O(n) in history length)
 *
 * **Pass 1: build a write-log and an args-map.**
 * - Iterate model-role Content blocks.
 * - Collect every `functionCall` part whose name is a write tool.
 * - Record `callId → { filePath, contentIndex, toolName }`.
 * - Also collect `callId → args` for read tools to support Pass 2 arg lookup.
 *
 * **Pass 2: find stale read outputs.**
 * - Iterate user-role Content blocks that contain `functionResponse` parts.
 * - For each read tool response, look up the file path from the call args map.
 * - Look up whether any write occurred at that path *after* the read's content
 *   index in the history.
 * - If so, replace the `functionResponse.response` with the elision marker.
 *
 * @remarks
 * This service is intentionally O(n) and allocation-light. It copies only
 * the Content blocks and Part arrays it modifies, preserving references to
 * all others (immutable-update approach), which is safe because
 * `GeminiChat.getHistory()` returns a shallow copy on main.
 */
export class StaleOutputElisionService {
  async elide(
    history: readonly Content[],
    config: Config,
  ): Promise<ElisionResult> {
    if (history.length === 0) {
      return { newHistory: [...history], elisionCount: 0, tokensSaved: 0 };
    }

    // -------------------------------------------------------------------------
    // Pass 1: Build indexes from model-role functionCall parts.
    // -------------------------------------------------------------------------

    /**
     * Maps callId → resolved file path(s) for READ tool calls.
     * `read_many_files` can have multiple paths; we store them as a Set.
     */
    const readCallArgs = new Map<string, Set<string>>();

    /**
     * Maps normalised-file-path → WriteEntry (the *latest* write to that path).
     * We update this entry as we scan forward so that the final entry always
     * represents the most recent write.
     */
    const writeLog = new Map<string, WriteEntry>();

    for (let i = 0; i < history.length; i++) {
      const content = history[i];
      if (content.role !== 'model') continue;

      for (const part of content.parts ?? []) {
        if (!part.functionCall) continue;

        const { name, args, id } = part.functionCall;
        if (!name || !id) continue;

        const argsRecord = args ?? {};

        if (READ_TOOL_NAMES.has(name)) {
          const paths = this.extractReadPaths(name, argsRecord);
          if (paths.size > 0) {
            readCallArgs.set(id, paths);
          }
        } else if (WRITE_TOOL_NAMES.has(name)) {
          const filePath = this.extractWritePath(argsRecord);
          if (filePath) {
            const normPath = this.normalizePath(filePath);
            writeLog.set(normPath, {
              filePath: normPath,
              contentIndex: i,
              toolName: name,
            });
          }
        }
      }
    }

    if (writeLog.size === 0) {
      // No write operations in history — nothing can be stale.
      return { newHistory: [...history], elisionCount: 0, tokensSaved: 0 };
    }

    // -------------------------------------------------------------------------
    // Pass 2: Identify stale read outputs.
    // -------------------------------------------------------------------------

    const candidates: ReadCandidate[] = [];

    for (let i = 0; i < history.length; i++) {
      const content = history[i];
      // functionResponse parts always live in user-role Content blocks.
      if (content.role !== 'user') continue;

      for (let j = 0; j < (content.parts ?? []).length; j++) {
        const part = content.parts![j];
        if (!part.functionResponse) continue;

        const { name, id } = part.functionResponse;
        if (!name || !id) continue;
        if (!READ_TOOL_NAMES.has(name)) continue;

        // Skip if already elided (idempotency).
        if (this.isAlreadyElided(part)) continue;

        // Skip error responses — error context is valuable for the model.
        if (this.isErrorResponse(part)) continue;

        const readPaths = readCallArgs.get(id);
        if (!readPaths || readPaths.size === 0) continue;

        // Check if any of the paths read by this call were subsequently
        // written to (i.e., the write appears later in history).
        let isStale = false;
        for (const readPath of readPaths) {
          const normPath = this.normalizePath(readPath);
          const writeEntry = writeLog.get(normPath);
          if (writeEntry && writeEntry.contentIndex > i) {
            isStale = true;
            break;
          }
        }

        if (!isStale) continue;

        const tokens = estimateTokenCountSync([part]);
        if (tokens < MIN_TOKENS_TO_ELIDE) continue;

        candidates.push({
          contentIndex: i,
          partIndex: j,
          filePath: [...readPaths][0], // representative path for the marker
          tokens,
        });
      }
    }

    if (candidates.length === 0) {
      return { newHistory: [...history], elisionCount: 0, tokensSaved: 0 };
    }

    debugLogger.debug(
      `[StaleOutputElision] Found ${candidates.length} stale read output(s) to elide.`,
    );

    // -------------------------------------------------------------------------
    // Apply elisions (immutable-update pattern).
    // -------------------------------------------------------------------------

    const newHistory = [...history];
    let elisionCount = 0;
    let tokensSaved = 0;

    for (const { contentIndex, partIndex, filePath } of candidates) {
      const contentRecord = newHistory[contentIndex];
      const part = contentRecord.parts![partIndex];
      if (!part.functionResponse) continue;

      // Find the write tool name for the elision marker.
      const readPaths =
        readCallArgs.get(part.functionResponse.id ?? '') ?? new Set();
      let modifyingToolName = WRITE_FILE_TOOL_NAME;
      for (const rp of readPaths) {
        const we = writeLog.get(this.normalizePath(rp));
        if (we && we.contentIndex > contentIndex) {
          modifyingToolName = we.toolName;
          break;
        }
      }

      const elisionMarker = this.formatElisionMarker(
        filePath,
        modifyingToolName,
      );

      const elidedPart: Part = {
        ...part,
        functionResponse: {
          ...part.functionResponse,
          response: { output: elisionMarker },
        },
      };

      const newTokens = estimateTokenCountSync([elidedPart]);
      const savings = part.functionResponse
        ? estimateTokenCountSync([part]) - newTokens
        : 0;

      if (savings > 0) {
        const newParts = [...contentRecord.parts!];
        newParts[partIndex] = elidedPart;
        newHistory[contentIndex] = { ...contentRecord, parts: newParts };
        tokensSaved += savings;
        elisionCount++;
      }
    }

    debugLogger.debug(
      `[StaleOutputElision] Elided ${elisionCount} stale tool output(s). Saved ~${tokensSaved.toLocaleString()} tokens.`,
    );

    if (elisionCount > 0) {
      logStaleOutputElision(
        config,
        new StaleOutputElisionEvent({
          elision_count: elisionCount,
          tokens_saved: tokensSaved,
        }),
      );
    }

    return {
      newHistory,
      elisionCount,
      tokensSaved,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Extracts and normalises the set of file paths read by a given read tool call.
   * For `read_file`: single path from `file_path`.
   * For `read_many_files`: paths from `paths` array.
   */
  private extractReadPaths(
    toolName: string,
    args: Record<string, unknown>,
  ): Set<string> {
    const paths = new Set<string>();

    if (toolName === READ_FILE_TOOL_NAME) {
      const filePath = args['file_path'];
      if (typeof filePath === 'string' && filePath.trim()) {
        paths.add(filePath.trim());
      }
    } else if (toolName === READ_MANY_FILES_TOOL_NAME) {
      // read_many_files accepts a `paths` array.
      const pathsArg = args['paths'];
      if (Array.isArray(pathsArg)) {
        for (const p of pathsArg) {
          if (typeof p === 'string' && p.trim()) {
            paths.add(p.trim());
          }
        }
      }
    }

    return paths;
  }

  /**
   * Extracts the target file path from a write tool call's arguments.
   * Both `edit` and `write_file` use a `file_path` parameter.
   */
  private extractWritePath(args: Record<string, unknown>): string | null {
    const filePath = args['file_path'];
    if (typeof filePath === 'string' && filePath.trim()) {
      return filePath.trim();
    }
    return null;
  }

  /**
   * Normalises a path to its absolute form for reliable comparison.
   * Falls back to the original string on resolution errors.
   */
  private normalizePath(filePath: string): string {
    try {
      return path.resolve(filePath);
    } catch {
      return filePath;
    }
  }

  /**
   * Returns true if the functionResponse part has already been elided.
   */
  private isAlreadyElided(part: Part): boolean {
    if (!part.functionResponse?.response) return false;
    const response = part.functionResponse.response;
    const output = response['output'];
    return (
      typeof output === 'string' &&
      output.includes(`<${STALE_OUTPUT_ELISION_TAG}`)
    );
  }

  /**
   * Returns true if the functionResponse represents a tool error.
   * Error outputs contain a top-level `error` key in the response.
   */
  private isErrorResponse(part: Part): boolean {
    if (!part.functionResponse?.response) return false;
    const response = part.functionResponse.response;
    // Tool errors typically set `error` or have `llmContent` containing error text.
    // We check for the `error` key as the canonical signal.
    return 'error' in response && !!response['error'];
  }

  /**
   * Formats the compact elision marker that replaces the stale tool output.
   */
  private formatElisionMarker(
    filePath: string,
    modifyingToolName: string,
  ): string {
    return `<${STALE_OUTPUT_ELISION_TAG}>\n[Content elided – file '${filePath}' was subsequently modified by ${modifyingToolName}]\n</${STALE_OUTPUT_ELISION_TAG}>`;
  }
}
