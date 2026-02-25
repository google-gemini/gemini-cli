/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content } from '@google/genai';
import { createHash } from 'node:crypto';
import type { ServerGeminiStreamEvent } from '../core/turn.js';
import { GeminiEventType } from '../core/turn.js';
import {
  logLoopDetected,
  logLoopDetectionDisabled,
  logLlmLoopCheck,
} from '../telemetry/loggers.js';
import {
  LoopDetectedEvent,
  LoopDetectionDisabledEvent,
  LoopType,
  LlmLoopCheckEvent,
  LlmRole,
} from '../telemetry/types.js';
import type { Config } from '../config/config.js';
import {
  isFunctionCall,
  isFunctionResponse,
} from '../utils/messageInspectors.js';
import { debugLogger } from '../utils/debugLogger.js';

const TOOL_CALL_LOOP_THRESHOLD = 5;
const CONTENT_LOOP_THRESHOLD = 10;
const CONTENT_CHUNK_SIZE = 50;
const MAX_HISTORY_LENGTH = 5000;

/**
 * The number of recent conversation turns to include in the history when asking the LLM to check for a loop.
 */
const LLM_LOOP_CHECK_HISTORY_COUNT = 20;

/**
 * The number of turns that must pass in a single prompt before the LLM-based loop check is activated.
 */
const LLM_CHECK_AFTER_TURNS = 20;

/**
 * The default interval, in number of turns, at which the LLM-based loop check is performed.
 * This value is adjusted dynamically based on the LLM's confidence.
 */
const DEFAULT_LLM_CHECK_INTERVAL = 3;

/**
 * The minimum interval for LLM-based loop checks.
 * This is used when the confidence of a loop is high, to check more frequently.
 */
const MIN_LLM_CHECK_INTERVAL = 5;

/**
 * The maximum interval for LLM-based loop checks.
 * This is used when the confidence of a loop is low, to check less frequently.
 */
const MAX_LLM_CHECK_INTERVAL = 15;

/**
 * The confidence threshold above which the LLM is considered to have detected a loop.
 */
const LLM_CONFIDENCE_THRESHOLD = 0.9;
const DOUBLE_CHECK_MODEL_ALIAS = 'loop-detection-double-check';

/**
 * Result of a loop detection check.
 */
export interface LoopDetectionResult {
  count: number;
  detail?: string;
}

/**
 * Service for detecting and preventing infinite loops in AI responses.
 * Monitors tool call repetitions and content sentence repetitions.
 */
export class LoopDetectionService {
  private readonly config: Config;
  private promptId = '';

  // Tool call tracking
  private lastToolCallKey: string | null = null;
  private toolCallRepetitionCount: number = 0;

  // Content streaming tracking
  private streamContentHistory = '';
  private contentStats = new Map<string, number[]>();
  private lastContentIndex = 0;
  private loopDetected = false;
  private detectedCount = 0;
  private lastLoopDetail?: string;
  private inCodeBlock = false;

  // LLM loop track tracking
  private turnsInCurrentPrompt = 0;
  private llmCheckInterval = DEFAULT_LLM_CHECK_INTERVAL;
  private lastCheckTurn = 0;

  // Session-level disable flag
  private disabledForSession = false;

  constructor(config: Config) {
    this.config = config;
  }

  /**
   * Disables loop detection for the current session.
   */
  disableForSession(): void {
    this.disabledForSession = true;
    logLoopDetectionDisabled(
      this.config,
      new LoopDetectionDisabledEvent(this.promptId),
    );
  }

  private getToolCallKey(toolCall: { name: string; args: object }): string {
    const argsString = JSON.stringify(toolCall.args);
    const keyString = `${toolCall.name}:${argsString}`;
    return createHash('sha256').update(keyString).digest('hex');
  }

  /**
   * Processes a stream event and checks for loop conditions.
   * @param event - The stream event to process
   * @returns A LoopDetectionResult
   */
  addAndCheck(event: ServerGeminiStreamEvent): LoopDetectionResult {
    if (this.disabledForSession || this.config.getDisableLoopDetection()) {
      return { count: 0 };
    }

    if (this.loopDetected) {
      return { count: this.detectedCount, detail: this.lastLoopDetail };
    }

    let isLoop = false;
    let detail: string | undefined;

    switch (event.type) {
      case GeminiEventType.ToolCallRequest:
        // content chanting only happens in one single stream, reset if there
        // is a tool call in between
        this.resetContentTracking();
        isLoop = this.checkToolCallLoop(event.value);
        if (isLoop) {
          detail = `Repeated tool call: ${event.value.name} with arguments ${JSON.stringify(event.value.args)}`;
        }
        break;
      case GeminiEventType.Content:
        isLoop = this.checkContentLoop(event.value);
        if (isLoop) {
          detail = `Repeating content detected: "${this.streamContentHistory.substring(Math.max(0, this.lastContentIndex - 20), this.lastContentIndex + CONTENT_CHUNK_SIZE).trim()}..."`;
        }
        break;
      default:
        break;
    }

    if (isLoop) {
      this.loopDetected = true;
      this.detectedCount++;
      this.lastLoopDetail = detail;
    }
    return isLoop
      ? { count: this.detectedCount, detail: this.lastLoopDetail }
      : { count: 0 };
  }

  /**
   * Signals the start of a new turn in the conversation.
   *
   * This method increments the turn counter and, if specific conditions are met,
   * triggers an LLM-based check to detect potential conversation loops. The check
   * is performed periodically based on the `llmCheckInterval`.
   *
   * @param signal - An AbortSignal to allow for cancellation of the asynchronous LLM check.
   * @returns A promise that resolves to a LoopDetectionResult.
   */
  async turnStarted(signal: AbortSignal): Promise<LoopDetectionResult> {
    if (this.disabledForSession || this.config.getDisableLoopDetection()) {
      return { count: 0 };
    }

    if (this.loopDetected) {
      return { count: this.detectedCount, detail: this.lastLoopDetail };
    }

    this.turnsInCurrentPrompt++;

    if (
      this.turnsInCurrentPrompt >= LLM_CHECK_AFTER_TURNS &&
      this.turnsInCurrentPrompt - this.lastCheckTurn >= this.llmCheckInterval
    ) {
      this.lastCheckTurn = this.turnsInCurrentPrompt;
      const { isLoop, analysis } = await this.checkForLoopWithLLM(signal);
      if (isLoop) {
        this.loopDetected = true;
        this.detectedCount++;
        this.lastLoopDetail = analysis;
        return { count: this.detectedCount, detail: this.lastLoopDetail };
      }
    }

    return { count: 0 };
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
        new LoopDetectedEvent(
          LoopType.CONSECUTIVE_IDENTICAL_TOOL_CALLS,
          this.promptId,
        ),
      );
      return true;
    }
    return false;
  }

  /**
   * Detects content loops by analyzing streaming text for repetitive patterns.
   *
   * The algorithm works by:
   * 1. Appending new content to the streaming history
   * 2. Truncating history if it exceeds the maximum length
   * 3. Analyzing content chunks for repetitive patterns using hashing
   * 4. Detecting loops when identical chunks appear frequently within a short distance
   * 5. Disabling loop detection within code blocks to prevent false positives,
   *    as repetitive code structures are common and not necessarily loops.
   */
  private checkContentLoop(content: string): boolean {
    // Different content elements can often contain repetitive syntax that is not indicative of a loop.
    // To avoid false positives, we detect when we encounter different content types and
    // reset tracking to avoid analyzing content that spans across different element boundaries.
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
      // Reset tracking when different content elements are detected to avoid analyzing content
      // that spans across different element boundaries.
      this.resetContentTracking();
    }

    const wasInCodeBlock = this.inCodeBlock;
    this.inCodeBlock =
      numFences % 2 === 0 ? this.inCodeBlock : !this.inCodeBlock;
    if (wasInCodeBlock || this.inCodeBlock || isDivider) {
      return false;
    }

    this.streamContentHistory += content;

    this.truncateAndUpdate();
    return this.analyzeContentChunksForLoop();
  }

  /**
   * Truncates the content history to prevent unbounded memory growth.
   * When truncating, adjusts all stored indices to maintain their relative positions.
   */
  private truncateAndUpdate(): void {
    if (this.streamContentHistory.length <= MAX_HISTORY_LENGTH) {
      return;
    }

    // Calculate how much content to remove from the beginning
    const truncationAmount =
      this.streamContentHistory.length - MAX_HISTORY_LENGTH;
    this.streamContentHistory =
      this.streamContentHistory.slice(truncationAmount);
    this.lastContentIndex = Math.max(
      0,
      this.lastContentIndex - truncationAmount,
    );

    // Update all stored chunk indices to account for the truncation
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
   * Analyzes content in fixed-size chunks to detect repetitive patterns.
   *
   * Uses a sliding window approach:
   * 1. Extract chunks of fixed size (CONTENT_CHUNK_SIZE)
   * 2. Hash each chunk for efficient comparison
   * 3. Track positions where identical chunks appear
   * 4. Detect loops when chunks repeat frequently within a short distance
   */
  private analyzeContentChunksForLoop(): boolean {
    while (this.hasMoreChunksToProcess()) {
      // Extract current chunk of text
      const currentChunk = this.streamContentHistory.substring(
        this.lastContentIndex,
        this.lastContentIndex + CONTENT_CHUNK_SIZE,
      );
      const chunkHash = createHash('sha256').update(currentChunk).digest('hex');

      if (this.isLoopDetectedForChunk(currentChunk, chunkHash)) {
        logLoopDetected(
          this.config,
          new LoopDetectedEvent(
            LoopType.CHANTING_IDENTICAL_SENTENCES,
            this.promptId,
          ),
        );
        return true;
      }

      // Move to next position in the sliding window
      this.lastContentIndex++;
    }

    return false;
  }

  private hasMoreChunksToProcess(): boolean {
    return (
      this.lastContentIndex + CONTENT_CHUNK_SIZE <=
      this.streamContentHistory.length
    );
  }

  /**
   * Determines if a content chunk indicates a loop pattern.
   *
   * Loop detection logic:
   * 1. Check if we've seen this hash before (new chunks are stored for future comparison)
   * 2. Verify actual content matches to prevent hash collisions
   * 3. Track all positions where this chunk appears
   * 4. A loop is detected when the same chunk appears CONTENT_LOOP_THRESHOLD times
   *    within a small average distance (≤ 5 * chunk size)
   */
  private isLoopDetectedForChunk(chunk: string, hash: string): boolean {
    const existingIndices = this.contentStats.get(hash);

    if (!existingIndices) {
      this.contentStats.set(hash, [this.lastContentIndex]);
      return false;
    }

    if (!this.isActualContentMatch(chunk, existingIndices[0])) {
      return false;
    }

    existingIndices.push(this.lastContentIndex);

    if (existingIndices.length < CONTENT_LOOP_THRESHOLD) {
      return false;
    }

    // Analyze the most recent occurrences to see if they're clustered closely together
    const recentIndices = existingIndices.slice(-CONTENT_LOOP_THRESHOLD);
    const totalDistance =
      recentIndices[recentIndices.length - 1] - recentIndices[0];
    const averageDistance = totalDistance / (CONTENT_LOOP_THRESHOLD - 1);
    const maxAllowedDistance = CONTENT_CHUNK_SIZE * 5;

    if (averageDistance > maxAllowedDistance) {
      return false;
    }

    // Verify that the sequence is actually repeating, not just sharing a common prefix.
    // For a true loop, the text between occurrences of the chunk (the period) should be highly repetitive.
    const periods = new Set<string>();
    for (let i = 0; i < recentIndices.length - 1; i++) {
      periods.add(
        this.streamContentHistory.substring(
          recentIndices[i],
          recentIndices[i + 1],
        ),
      );
    }

    // If the periods are mostly unique, it's a list of distinct items with a shared prefix.
    // A true loop will have a small number of unique periods (usually 1, sometimes 2 or 3).
    // We use Math.floor(CONTENT_LOOP_THRESHOLD / 2) as a safe threshold.
    if (periods.size > Math.floor(CONTENT_LOOP_THRESHOLD / 2)) {
      return false;
    }

    return true;
  }

  /**
   * Verifies that two chunks with the same hash actually contain identical content.
   * This prevents false positives from hash collisions.
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

  private trimRecentHistory(history: Content[]): Content[] {
    // A function response must be preceded by a function call.
    // Continuously removes dangling function calls from the end of the history
    // until the last turn is not a function call.
    while (history.length > 0 && isFunctionCall(history[history.length - 1])) {
      history.pop();
    }

    // A function response should follow a function call.
    // Continuously removes leading function responses from the beginning of history
    // until the first turn is not a function response.
    while (history.length > 0 && isFunctionResponse(history[0])) {
      history.shift();
    }

    return history.map((content) => ({
      role: content.role,
      parts: (content.parts || []).map((part) => {
        if (part.text && part.text.length > 500) {
          return { text: part.text.substring(0, 500) + '... [TRUNCATED]' };
        }
        return part;
      }),
    }));
  }

  private async checkForLoopWithLLM(
    signal: AbortSignal,
  ): Promise<{ isLoop: boolean; analysis?: string }> {
    const recentHistory = this.config
      .getGeminiClient()
      .getHistory()
      .slice(-LLM_LOOP_CHECK_HISTORY_COUNT);

    const trimmedHistory = this.trimRecentHistory(recentHistory);

    const taskPrompt = `Please analyze the conversation history to determine the possibility that the conversation is stuck in a repetitive, non-productive state. Provide your response in the requested JSON format.`;

    const contents = [
      ...trimmedHistory,
      { role: 'user', parts: [{ text: taskPrompt }] },
    ];
    if (contents.length > 0 && isFunctionCall(contents[0])) {
      contents.unshift({
        role: 'user',
        parts: [{ text: 'Recent conversation history:' }],
      });
    }

    const flashResult = await this.queryLoopDetectionModel(
      'loop-detection',
      contents,
      signal,
    );

    if (!flashResult) {
      return { isLoop: false };
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const flashConfidence = flashResult[
      'unproductive_state_confidence'
    ] as number;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const flashAnalysis = flashResult['unproductive_state_analysis'] as string;

    const doubleCheckModelName =
      this.config.modelConfigService.getResolvedConfig({
        model: DOUBLE_CHECK_MODEL_ALIAS,
      }).model;

    if (flashConfidence < LLM_CONFIDENCE_THRESHOLD) {
      logLlmLoopCheck(
        this.config,
        new LlmLoopCheckEvent(
          this.promptId,
          flashConfidence,
          doubleCheckModelName,
          -1,
        ),
      );
      this.updateCheckInterval(flashConfidence);
      return { isLoop: false };
    }

    const availability = this.config.getModelAvailabilityService();

    if (!availability.snapshot(doubleCheckModelName).available) {
      const flashModelName = this.config.modelConfigService.getResolvedConfig({
        model: 'loop-detection',
      }).model;
      this.handleConfirmedLoop(flashResult, flashModelName);
      return { isLoop: true, analysis: flashAnalysis };
    }

    // Double check with configured model
    const mainModelResult = await this.queryLoopDetectionModel(
      DOUBLE_CHECK_MODEL_ALIAS,
      contents,
      signal,
    );

    const mainModelConfidence = mainModelResult
      ? // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        (mainModelResult['unproductive_state_confidence'] as number)
      : 0;
    const mainModelAnalysis = mainModelResult
      ? // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        (mainModelResult['unproductive_state_analysis'] as string)
      : undefined;

    logLlmLoopCheck(
      this.config,
      new LlmLoopCheckEvent(
        this.promptId,
        flashConfidence,
        doubleCheckModelName,
        mainModelConfidence,
      ),
    );

    if (mainModelResult) {
      if (mainModelConfidence >= LLM_CONFIDENCE_THRESHOLD) {
        this.handleConfirmedLoop(mainModelResult, doubleCheckModelName);
        return { isLoop: true, analysis: mainModelAnalysis };
      } else {
        this.updateCheckInterval(mainModelConfidence);
      }
    }

    return { isLoop: false };
  }

  private async queryLoopDetectionModel(
    modelAlias: string,
    contents: Content[],
    signal: AbortSignal,
  ): Promise<Record<string, unknown> | null> {
    const diagnosticPrompt = `You are a diagnostic assistant. Your task is to evaluate a conversation history between a user and an AI agent to determine if the agent is stuck in a repetitive loop.

Analyze the history for patterns such as:
1. "Cognitive Loops": The AI agent keeps performing the same sequence of actions without making forward progress.
2. "Repetitive Actions": The agent makes the same tool calls with the same arguments repeatedly.

Analyze the last several turns closely.

You MUST respond in JSON with the following fields:
- "unproductive_state_confidence": A number between 0 and 1, representing your confidence that the agent is in a repetitive loop.
- "unproductive_state_analysis": A string explaining your reasoning.

Focus on the most recent activity. High confidence should be reserved for clear signs of repetitive, non-productive behavior.`;

    try {
      return await this.config.getBaseLlmClient().generateJson({
        modelConfigKey: { model: modelAlias },
        systemInstruction: diagnosticPrompt,
        contents,
        schema: {
          type: 'object',
          properties: {
            unproductive_state_confidence: { type: 'number' },
            unproductive_state_analysis: { type: 'string' },
          },
          required: [
            'unproductive_state_confidence',
            'unproductive_state_analysis',
          ],
        },
        promptId: this.promptId,
        abortSignal: signal,
        role: LlmRole.UTILITY_LOOP_DETECTOR,
      });
    } catch (error) {
      if (this.config.getDebugMode()) {
        debugLogger.warn(
          `Error querying loop detection model (${modelAlias}): ${String(error)}`,
        );
      }
      return null;
    }
  }

  private handleConfirmedLoop(
    result: Record<string, unknown>,
    modelName: string,
  ): void {
    if (
      typeof result['unproductive_state_analysis'] === 'string' &&
      result['unproductive_state_analysis']
    ) {
      debugLogger.warn(result['unproductive_state_analysis']);
    }
    logLoopDetected(
      this.config,
      new LoopDetectedEvent(
        LoopType.LLM_DETECTED_LOOP,
        this.promptId,
        modelName,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        result['unproductive_state_analysis'] as string,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        result['unproductive_state_confidence'] as number,
      ),
    );
  }

  private updateCheckInterval(unproductive_state_confidence: number): void {
    this.llmCheckInterval = Math.round(
      MIN_LLM_CHECK_INTERVAL +
        (MAX_LLM_CHECK_INTERVAL - MIN_LLM_CHECK_INTERVAL) *
          (1 - unproductive_state_confidence),
    );
  }

  /**
   * Resets all loop detection state.
   */
  reset(promptId: string): void {
    this.promptId = promptId;
    this.resetToolCallCount();
    this.resetContentTracking();
    this.resetLlmCheckTracking();
    this.loopDetected = false;
    this.detectedCount = 0;
    this.lastLoopDetail = undefined;
  }

  private resetToolCallCount(): void {
    this.lastToolCallKey = null;
    this.toolCallRepetitionCount = 0;
  }

  private resetContentTracking(resetHistory = true): void {
    if (resetHistory) {
      this.streamContentHistory = '';
    }
    this.contentStats.clear();
    this.lastContentIndex = 0;
  }

  private resetLlmCheckTracking(): void {
    this.turnsInCurrentPrompt = 0;
    this.llmCheckInterval = DEFAULT_LLM_CHECK_INTERVAL;
    this.lastCheckTurn = 0;
  }
}
