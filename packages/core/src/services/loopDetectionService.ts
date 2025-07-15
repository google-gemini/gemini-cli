/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash } from 'crypto';
import { GeminiEventType, ServerGeminiStreamEvent } from '../core/turn.js';
import { logLoopDetected } from '../telemetry/loggers.js';
import { LoopDetectedEvent, LoopType } from '../telemetry/types.js';
import { Config } from '../config/config.js';

const TOOL_CALL_LOOP_THRESHOLD = 5;
const CONTENT_LOOP_THRESHOLD = 10;
const SENTENCE_ENDING_PUNCTUATION_REGEX = /[.!?]+(?=\s|$)/;

/**
 * Service for detecting and preventing infinite loops in AI responses.
 * Monitors tool call repetitions and content sentence repetitions.
 */
export class LoopDetectionService {
  // Tool call tracking
  private lastToolCallKey: string | null = null;
  private toolCallRepetitionCount: number = 0;

  // Content streaming tracking
  private lastRepeatedSentence: string = '';
  private sentenceRepetitionCount: number = 0;
  private partialContent: string = '';
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  private getToolCallKey(toolCall: { name: string; args: object }): string {
    const argsString = JSON.stringify(toolCall.args);
    const keyString = `${toolCall.name}:${argsString}`;
    return createHash('sha256').update(keyString).digest('hex');
  }

  /**
   * Processes a stream event and checks for loop conditions.
   * @param event - The stream event to process
   * @returns true if a loop is detected, false otherwise
   */
  addAndCheck(event: ServerGeminiStreamEvent): boolean {
    switch (event.type) {
      case GeminiEventType.ToolCallRequest:
        // content chanting only happens in one single stream, reset if there
        // is a tool call in between
        this.resetSentenceCount();
        return this.checkToolCallLoop(event.value);
      case GeminiEventType.Content:
        return this.checkContentLoop(event.value);
      default:
        this.reset();
        return false;
    }
  }

  private checkToolCallLoop(toolCall: { name: string; args: object }): boolean {
    const key = this.getToolCallKey(toolCall);
    if (this.lastToolCallKey === key) {
      this.toolCallRepetitionCount++;
    } else {
      this.lastToolCallKey = key;
      this.toolCallRepetitionCount = 1;
    }
    if (this.toolCallRepetitionCount >= TOOL_CALL_LOOP_THRESHOLD) {
      logLoopDetected(
        this.config,
        new LoopDetectedEvent(LoopType.CONSECUTIVE_IDENTICAL_TOOL_CALLS),
      );
      return true;
    }
    return false;
  }

  private checkContentLoop(content: string): boolean {
    this.partialContent += content;

    if (!SENTENCE_ENDING_PUNCTUATION_REGEX.test(this.partialContent)) {
      return false;
    }

    const completeSentences =
      this.partialContent.match(/[^.!?]+[.!?]+(?=\s|$)/g) || [];
    if (completeSentences.length === 0) {
      return false;
    }

    const lastSentence = completeSentences[completeSentences.length - 1];
    const lastCompleteIndex = this.partialContent.lastIndexOf(lastSentence);
    const endOfLastSentence = lastCompleteIndex + lastSentence.length;
    this.partialContent = this.partialContent.slice(endOfLastSentence);

    for (const sentence of completeSentences) {
      const trimmedSentence = sentence.trim();
      if (trimmedSentence === '') {
        continue;
      }

      if (this.lastRepeatedSentence === trimmedSentence) {
        this.sentenceRepetitionCount++;
      } else {
        this.lastRepeatedSentence = trimmedSentence;
        this.sentenceRepetitionCount = 1;
      }

      if (this.sentenceRepetitionCount >= CONTENT_LOOP_THRESHOLD) {
        logLoopDetected(
          this.config,
          new LoopDetectedEvent(LoopType.CHANTING_IDENTICAL_SENTENCES),
        );
        return true;
      }
    }
    return false;
  }

  /**
   * Resets all loop detection state.
   */
  reset(): void {
    this.resetToolCallCount();
    this.resetSentenceCount();
  }

  private resetToolCallCount(): void {
    this.lastToolCallKey = null;
    this.toolCallRepetitionCount = 0;
  }

  private resetSentenceCount(): void {
    this.lastRepeatedSentence = '';
    this.sentenceRepetitionCount = 0;
    this.partialContent = '';
  }
}
