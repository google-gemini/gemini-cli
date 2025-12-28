/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Standalone loop detection utility for LocalAgentExecutor.
 * Extracted core algorithms from LoopDetectionService for use in sub-agents.
 */

import { createHash } from 'node:crypto';

// Constants extracted from loopDetectionService.ts
const TOOL_CALL_LOOP_THRESHOLD = 5;
const CONTENT_LOOP_THRESHOLD = 10;
const CONTENT_CHUNK_SIZE = 50;
const MAX_HISTORY_LENGTH = 5000;

/**
 * Result of loop detection check
 */
export interface LoopDetectionResult {
  detected: boolean;
  loopType?: 'TOOL_CALL' | 'CONTENT';
  details?: string;
}

/**
 * Standalone loop detector for LocalAgentExecutor.
 * Provides tool call and content loop detection without GeminiClient dependency.
 *
 * Extracted from LoopDetectionService (lines 100-340) and adapted for sub-agents.
 */
export class LocalAgentLoopDetector {
  // Tool call tracking
  private lastToolCallKey: string | null = null;
  private toolCallRepetitionCount = 0;

  // Content loop tracking
  private streamContentHistory = '';
  private contentStats = new Map<string, number[]>();
  private lastContentIndex = 0;
  private inCodeBlock = false;

  // Configurable thresholds
  private toolThreshold: number;
  private contentThreshold: number;

  constructor(options?: { toolThreshold?: number; contentThreshold?: number }) {
    this.toolThreshold = options?.toolThreshold ?? TOOL_CALL_LOOP_THRESHOLD;
    this.contentThreshold = options?.contentThreshold ?? CONTENT_LOOP_THRESHOLD;
  }

  /**
   * Check if a tool call represents a loop.
   * Extracted from loopDetectionService.ts lines 201-220
   *
   * @param toolCall The tool call to check
   * @returns LoopDetectionResult with detection status
   */
  checkToolCallLoop(toolCall: {
    name: string;
    args: object;
  }): LoopDetectionResult {
    const key = this.getToolCallKey(toolCall);

    if (this.lastToolCallKey === key) {
      this.toolCallRepetitionCount++;

      if (this.toolCallRepetitionCount >= this.toolThreshold) {
        return {
          detected: true,
          loopType: 'TOOL_CALL',
          details: `Repeated ${toolCall.name} call ${this.toolCallRepetitionCount} times with identical arguments`,
        };
      }
    } else {
      this.lastToolCallKey = key;
      this.toolCallRepetitionCount = 1;
    }

    return { detected: false };
  }

  /**
   * Check if streaming content represents a loop.
   * Extracted from loopDetectionService.ts lines 233-338
   *
   * Algorithm:
   * 1. Skip detection in code blocks and markdown structures
   * 2. Chunk content into fixed-size pieces (50 chars)
   * 3. Hash chunks for efficient comparison
   * 4. Detect when same chunk appears 10+ times within short distance
   *
   * @param content The content chunk to analyze
   * @returns LoopDetectionResult with detection status
   */
  checkContentLoop(content: string): LoopDetectionResult {
    // Detect markdown structures to avoid false positives
    const numFences = (content.match(/```/g) ?? []).length;
    const hasTable = /(^|\n)\s*(\|.*\||[|+-]{3,})/.test(content);
    const hasListItem =
      /(^|\n)\s*[*-+]\s/.test(content) || /(^|\n)\s*\d+\.\s/.test(content);
    const hasHeading = /(^|\n)#+\s/.test(content);
    const hasBlockquote = /(^|\n)>\s/.test(content);
    const isDivider = /^[+-_=*\u2500-\u257F]+$/.test(content);

    if (
      numFences ||
      hasTable ||
      hasListItem ||
      hasHeading ||
      hasBlockquote ||
      isDivider
    ) {
      // Reset tracking when different content elements are detected
      this.resetContentTracking();
    }

    // Track code block state
    const wasInCodeBlock = this.inCodeBlock;
    this.inCodeBlock =
      numFences % 2 === 0 ? this.inCodeBlock : !this.inCodeBlock;

    // Skip detection inside code blocks or dividers
    if (wasInCodeBlock || this.inCodeBlock || isDivider) {
      return { detected: false };
    }

    // Add content to history
    this.streamContentHistory += content;

    // Truncate if needed
    this.truncateAndUpdate();

    // Analyze chunks for loops
    return this.analyzeContentChunksForLoop();
  }

  /**
   * Generate hash key for tool call (name + args).
   * Extracted from loopDetectionService.ts lines 138-142
   */
  private getToolCallKey(toolCall: { name: string; args: object }): string {
    const argsString = JSON.stringify(toolCall.args);
    const keyString = `${toolCall.name}:${argsString}`;
    return createHash('sha256').update(keyString).digest('hex');
  }

  /**
   * Truncates content history to prevent unbounded memory growth.
   * Extracted from loopDetectionService.ts lines 275-302
   */
  private truncateAndUpdate(): void {
    if (this.streamContentHistory.length <= MAX_HISTORY_LENGTH) {
      return;
    }

    const truncationAmount =
      this.streamContentHistory.length - MAX_HISTORY_LENGTH;
    this.streamContentHistory =
      this.streamContentHistory.slice(truncationAmount);
    this.lastContentIndex = Math.max(
      0,
      this.lastContentIndex - truncationAmount,
    );

    // Update all stored chunk indices
    for (const [hash, oldIndices] of this.contentStats.entries()) {
      const adjustedIndices = oldIndices
        .map((index) => index - truncationAmount)
        .filter((index) => index >= 0);

      if (adjustedIndices.length > 0) {
        this.contentStats.set(hash, adjustedIndices);
      } else {
        this.contentStats.delete(hash);
      }
    }
  }

  /**
   * Analyzes content in fixed-size chunks for repetitive patterns.
   * Extracted from loopDetectionService.ts lines 313-338
   */
  private analyzeContentChunksForLoop(): LoopDetectionResult {
    while (this.hasMoreChunksToProcess()) {
      const currentChunk = this.streamContentHistory.substring(
        this.lastContentIndex,
        this.lastContentIndex + CONTENT_CHUNK_SIZE,
      );
      const chunkHash = createHash('sha256').update(currentChunk).digest('hex');

      if (this.isLoopDetectedForChunk(currentChunk, chunkHash)) {
        return {
          detected: true,
          loopType: 'CONTENT',
          details: `Detected repetitive content pattern (${this.contentThreshold}+ identical chunks)`,
        };
      }

      this.lastContentIndex++;
    }

    return { detected: false };
  }

  private hasMoreChunksToProcess(): boolean {
    return (
      this.lastContentIndex + CONTENT_CHUNK_SIZE <=
      this.streamContentHistory.length
    );
  }

  /**
   * Determines if a chunk indicates a loop pattern.
   * Extracted from loopDetectionService.ts lines 357-383
   */
  private isLoopDetectedForChunk(chunk: string, hash: string): boolean {
    const existingIndices = this.contentStats.get(hash);

    if (!existingIndices) {
      this.contentStats.set(hash, [this.lastContentIndex]);
      return false;
    }

    // Verify actual content matches (prevent hash collisions)
    if (!this.isActualContentMatch(chunk, existingIndices[0])) {
      return false;
    }

    existingIndices.push(this.lastContentIndex);

    if (existingIndices.length < this.contentThreshold) {
      return false;
    }

    // Analyze clustering: loop detected when chunks are close together
    const recentIndices = existingIndices.slice(-this.contentThreshold);
    const totalDistance =
      recentIndices[recentIndices.length - 1] - recentIndices[0];
    const averageDistance = totalDistance / (this.contentThreshold - 1);
    const maxAllowedDistance = CONTENT_CHUNK_SIZE * 5;

    return averageDistance <= maxAllowedDistance;
  }

  /**
   * Verifies actual content match to prevent hash collisions.
   * Extracted from loopDetectionService.ts lines 389-398
   */
  private isActualContentMatch(
    currentChunk: string,
    originalIndex: number,
  ): boolean {
    const originalChunk = this.streamContentHistory.substring(
      originalIndex,
      originalIndex + CONTENT_CHUNK_SIZE,
    );
    return originalChunk === currentChunk;
  }

  /**
   * Reset content tracking state
   */
  private resetContentTracking(resetHistory = true): void {
    if (resetHistory) {
      this.streamContentHistory = '';
    }
    this.contentStats.clear();
    this.lastContentIndex = 0;
  }

  /**
   * Reset all loop detection state.
   * Call at the start of each agent execution.
   */
  reset(): void {
    this.lastToolCallKey = null;
    this.toolCallRepetitionCount = 0;
    this.resetContentTracking();
    this.inCodeBlock = false;
  }
}
