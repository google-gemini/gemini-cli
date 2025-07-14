/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash } from 'crypto';
import { GeminiEventType, ServerGeminiStreamEvent } from '../core/turn.js';

const TOOL_CALL_LOOP_THRESHOLD = 5;
const CONTENT_LOOP_THRESHOLD = 10;

export class LoopDetectionService {
  private toolCallCounts = new Map<string, number>();
  private adjacentRepeatingSentences: string[] = [];
  private partialContent = '';

  private getToolCallKey(toolCall: { name: string; args: object }): string {
    // Stringify args for a consistent key.
    const argsString = JSON.stringify(toolCall.args);
    const keyString = `${toolCall.name}:${argsString}`;
    return createHash('sha256').update(keyString).digest('hex');
  }

  addAndCheck(event: ServerGeminiStreamEvent): boolean {
    switch (event.type) {
      case GeminiEventType.ToolCallRequest: {
        const key = this.getToolCallKey(event.value);
        const count = (this.toolCallCounts.get(key) ?? 0) + 1;
        this.toolCallCounts.set(key, count);
        return count >= TOOL_CALL_LOOP_THRESHOLD;
      }
      case GeminiEventType.Content: {
        this.partialContent += event.value;

        // We only check for repetition when a sentence is likely to be complete,
        // which we detect by the presence of sentence-ending punctuation.
        if (!/[.!?]/.test(this.partialContent)) {
          return false;
        }

        // Extract complete sentences from the accumulated partial content
        const completeSentences =
          this.partialContent.match(/[^.!?]+[.!?]/g) || [];

        if (completeSentences.length === 0) {
          return false;
        }

        // Keep any remaining partial content after the last complete sentence
        const lastCompleteIndex = this.partialContent.lastIndexOf(
          completeSentences[completeSentences.length - 1],
        );
        const endOfLastSentence =
          lastCompleteIndex +
          completeSentences[completeSentences.length - 1].length;
        this.partialContent = this.partialContent.slice(endOfLastSentence);

        for (const sentence of completeSentences) {
          const trimmedSentence = sentence.trim();
          if (trimmedSentence === '') {
            continue;
          }

          // Check if this sentence continues the adjacent repetition
          if (
            this.adjacentRepeatingSentences.length === 0 ||
            this.adjacentRepeatingSentences[
              this.adjacentRepeatingSentences.length - 1
            ] === trimmedSentence
          ) {
            // Add to adjacent repeating sentences
            this.adjacentRepeatingSentences.push(trimmedSentence);

            // Check if we've hit the loop threshold
            if (
              this.adjacentRepeatingSentences.length >= CONTENT_LOOP_THRESHOLD
            ) {
              return true;
            }
          } else {
            // Different sentence breaks the adjacent repetition, reset and start new
            this.adjacentRepeatingSentences = [trimmedSentence];
          }
        }

        return false;
      }
      default:
        return false;
    }
  }

  reset() {
    this.toolCallCounts.clear();
    this.adjacentRepeatingSentences = [];
    this.partialContent = '';
  }
}
