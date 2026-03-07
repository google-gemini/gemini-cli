/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content, Part } from '@google/genai';
import { debugLogger } from '../utils/debugLogger.js';

/**
 * Validates the history contains the correct roles.
 *
 * @throws Error if the history does not start with a user turn.
 * @throws Error if the history contains an invalid role.
 */
export function validateHistory(history: Content[]) {
  for (const content of history) {
    if (content.role !== 'user' && content.role !== 'model') {
      throw new Error(`Invalid role in history: ${content.role}`);
    }
  }
}

/**
 * Checks if a content object is valid (has non-empty parts).
 */
export function isValidContent(content: Content): boolean {
  if (!content.parts || content.parts.length === 0) {
    return false;
  }
  return content.parts.some((part: Part) => {
    return (
      (part.text && part.text.trim().length > 0) ||
      part.functionCall ||
      part.functionResponse ||
      part.inlineData ||
      part.thought
    );
  });
}

/**
 * Options for extracting history projections.
 */
export interface HistoryProjectionOptions {
  curated?: boolean;
  addMetadata?: boolean;
  sessionId?: string;
}

/**
 * Manages the message history, elisions, and projections for a chat session.
 */
export class HistoryManager {
  private history: Content[] = [];
  private distilledResults: Map<string, any> = new Map();
  private elidedIndices: Set<number> = new Set();
  private elidedCallIds: Set<string> = new Set();
  private sessionContext: string | undefined;
  private continuityAnchor: string | undefined;
  private turnIds: Map<number, string> = new Map();
  private callIdToIndex: Map<string, number> = new Map();

  constructor(initialHistory: Content[] = []) {
    validateHistory(initialHistory);
    this.history = [...initialHistory];
  }

  /**
   * Sets the singleton session context for this history.
   */
  setSessionContext(context: string): void {
    this.sessionContext = context;
  }

  /**
   * Sets the current continuity anchor (snapshot summary).
   */
  setContinuityAnchor(anchor: string | undefined): void {
    this.continuityAnchor = anchor;
  }

  /**
   * Gets the current continuity anchor.
   */
  getContinuityAnchor(): string | undefined {
    return this.continuityAnchor;
  }

  /**
   * Adds a message to the history.
   */
  addMessage(content: Content, turnId?: string): void {
    const index = this.history.length;
    if (turnId) {
      this.turnIds.set(index, turnId);

      // Scan for call IDs to build mappings
      if (content.parts) {
        for (const part of content.parts) {
          const isToolPart = !!(part.functionCall || part.functionResponse);
          if (isToolPart) {
            const callId = part.functionCall?.id || part.functionResponse?.id;
            if (!callId) {
              throw new Error(
                `[PROJECT CLARITY] CRITICAL: Tool part missing ID in turn ${turnId}. All tool parts must be normalized before entering history.`,
              );
            }
            // Always index the latest occurrence.
            // For elideBetween, this means we find the most recent message for a call ID.
            this.callIdToIndex.set(callId, index);
          }
        }
      }
    }
    this.history.push(content);
  }

  /**
   * Pre-registers a call ID for the turn currently being built.
   * This is necessary so that meta-tools can elide themselves before the turn
   * is fully consolidated and pushed to history.
   */
  preRegisterCallId(callId: string, _turnId: string): void {
    const nextIndex = this.history.length;
    debugLogger.debug(
      `[PROJECT CLARITY] Pre-registering callId ${callId} (will be index ${nextIndex})`,
    );
    this.callIdToIndex.set(callId, nextIndex);
  }

  /**
   * Marks a specific turn ID for elision.
   * Note: This is now a blunt index-based elision of all messages in that turn.
   */
  addElidedTurnId(turnId: string): void {
    debugLogger.debug(`[PROJECT CLARITY] Eliding turn: ${turnId}`);
    for (const [index, tid] of this.turnIds.entries()) {
      if (tid === turnId) {
        this.elidedIndices.add(index);
      }
    }
  }

  /**
   * Checks if a specific turn ID is marked for elision.
   */
  isTurnElided(turnId: string): boolean {
    for (const [index, tid] of this.turnIds.entries()) {
      if (tid === turnId && this.elidedIndices.has(index)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Elides everything between two call IDs, inclusive of the end call's message.
   * Exclusive of the start call's message (to preserve the target).
   */
  elideBetween(startCallId: string, endCallId: string): void {
    const startIndex = this.callIdToIndex.get(startCallId);
    const endIndex = this.callIdToIndex.get(endCallId);

    if (startIndex === undefined || endIndex === undefined) {
      debugLogger.warn(
        `[PROJECT CLARITY] elideBetween failed: startCallId=${startCallId} (${startIndex}), endCallId=${endCallId} (${endIndex})`,
      );
      return;
    }

    debugLogger.debug(
      `[PROJECT CLARITY] elideBetween indices: ${startIndex} to ${endIndex}`,
    );

    // We elide everything strictly AFTER the start message, up to and including the end message.
    for (let i = startIndex + 1; i <= endIndex; i++) {
      this.elidedIndices.add(i);
    }

    // Also explicitly elide the end call ID itself (the meta-tool call)
    // to ensure it's filtered even if its message parts were partially visible.
    this.elidedCallIds.add(endCallId);
  }

  /**
   * Replaces the entire history.
   */
  replaceHistory(newHistory: Content[]): void {
    validateHistory(newHistory);
    this.history = [...newHistory];
    this.distilledResults.clear();
    this.turnIds.clear();
    this.callIdToIndex.clear();
    this.elidedIndices.clear();
    this.elidedCallIds.clear();
  }

  /**
   * Clears the history.
   */
  clearHistory(): void {
    this.history = [];
    this.distilledResults.clear();
    this.elidedIndices.clear();
    this.elidedCallIds.clear();
    this.turnIds.clear();
    this.callIdToIndex.clear();
    this.sessionContext = undefined;
    this.continuityAnchor = undefined;
  }

  /**
   * Marks a call ID for elision.
   */
  addElidedCallId(callId: string): void {
    this.elidedCallIds.add(callId);
  }

  /**
   * Clears elision markers. Usually called at the start of a new root-level turn.
   */
  clearElisions(): void {
    this.elidedCallIds.clear();
    this.elidedIndices.clear();
  }

  /**
   * Records a distilled result for a tool call.
   */
  addDistilledResult(callId: string, result: any): void {
    this.distilledResults.set(callId, result);
  }

  /**
   * Gets the raw, comprehensive history.
   */
  getComprehensiveHistory(): Content[] {
    return [...this.history];
  }

  /**
   * Prepares the history for an API request by appending the current user content
   * and merging consecutive user turns (e.g., merging metadata into the first message).
   */
  getHistoryForRequest(userContent: Content): Content[] {
    const projection = this.getProjection({ curated: true, addMetadata: true });

    if (
      projection.length > 0 &&
      projection[projection.length - 1].role === 'user'
    ) {
      // Merge consecutive user turns.
      const lastTurn = projection[projection.length - 1];
      const mergedTurn: Content = {
        ...lastTurn,
        parts: [...(lastTurn.parts || []), ...(userContent.parts || [])],
      };
      return [...projection.slice(0, -1), mergedTurn];
    }

    return [...projection, userContent];
  }

  /**
   * Gets the history projection based on elisions and distillations.
   */
  getProjection(options: HistoryProjectionOptions = {}): Content[] {
    const { curated = false, addMetadata = false } = options;

    let baseHistory = curated
      ? this.extractCuratedHistory()
      : [...this.history];

    if (addMetadata) {
      baseHistory = this.applyMetadata(baseHistory);
    }

    return baseHistory;
  }

  /**
   * Returns the metadata parts (session context, continuity anchor) if they exist.
   */
  getMetadataParts(): Part[] {
    const metadataParts: Part[] = [];

    // Order is strictly: Session Context -> Continuity Anchor (Snapshot)
    if (this.sessionContext) {
      metadataParts.push({ text: this.sessionContext });
    }

    if (this.continuityAnchor) {
      metadataParts.push({
        text: `<state_checkpoint>\n${this.continuityAnchor}\n</state_checkpoint>`,
      });
    }

    return metadataParts;
  }

  /**
   * Logic for extracting curated history (applying elisions and distillations).
   */
  private extractCuratedHistory(): Content[] {
    const curatedHistory: Content[] = [];
    const length = this.history.length;

    for (let i = 0; i < length; i++) {
      if (this.elidedIndices.has(i)) {
        continue;
      }

      const originalContent = this.history[i];

      // Filter elided call IDs first.
      const filteredParts = this.filterParts(originalContent.parts || []);
      if (filteredParts.length === 0) {
        continue;
      }

      if (originalContent.role === 'user') {
        const parts = filteredParts.map((part: Part) => {
          if (part.functionResponse) {
            const id = part.functionResponse.id;
            if (id && this.distilledResults.has(id)) {
              return {
                functionResponse: {
                  ...part.functionResponse,
                  response: this.distilledResults.get(id),
                },
              };
            }
          }
          return part;
        });
        curatedHistory.push({ ...originalContent, parts });
      } else if (originalContent.role === 'model') {
        const modelOutput: Content[] = [];
        let isValid = isValidContent({
          ...originalContent,
          parts: filteredParts,
        });
        modelOutput.push({ ...originalContent, parts: filteredParts });

        // Collect consecutive model outputs (e.g., thoughts then tool calls)
        while (i + 1 < length && this.history[i + 1].role === 'model') {
          i++;
          if (this.elidedIndices.has(i)) {
            continue;
          }

          const nextContent = this.history[i];
          const nextFilteredParts = this.filterParts(nextContent.parts || []);
          if (nextFilteredParts.length === 0) continue;

          modelOutput.push({ ...nextContent, parts: nextFilteredParts });
          if (isValid && !isValidContent({ ...nextContent, parts: nextFilteredParts })) {
            isValid = false;
          }
        }

        if (isValid) {
          curatedHistory.push(...modelOutput);
        }
      }
    }

    return curatedHistory;
  }

  /**
   * Prepends metadata (session context, anchors) to the history.
   */
  private applyMetadata(
    history: Content[],
    _pendingContent?: Content,
  ): Content[] {
    const baseHistory = [...history];
    const metadataParts = this.getMetadataParts();

    if (metadataParts.length === 0) {
      return baseHistory;
    }

    // 1. Try to merge into the very first message in history if it's from the user.
    if (baseHistory.length > 0 && baseHistory[0].role === 'user') {
      const firstMessage = { ...baseHistory[0] };
      firstMessage.parts = [...metadataParts, ...(firstMessage.parts || [])];
      baseHistory[0] = firstMessage;
      return baseHistory;
    }

    // 2. Fallback: prepend a synthetic user turn.
    // This happens when history is empty, OR if the first turn is NOT a user turn (unlikely).
    baseHistory.unshift({
      role: 'user',
      parts: metadataParts,
    });

    return baseHistory;
  }

  /**
   * Filters parts for elision.
   */
  filterParts(parts: Part[]): Part[] {
    return parts.filter((part: Part) => {
      const id = part.functionCall?.id || part.functionResponse?.id;
      return !id || !this.elidedCallIds.has(id);
    });
  }

  getHistoryLength(): number {
    return this.history.length;
  }

  getMessageAt(index: number): Content | undefined {
    return this.history[index];
  }
}
