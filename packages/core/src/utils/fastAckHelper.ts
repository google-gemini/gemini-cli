/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { LlmRole } from '../telemetry/llmRole.js';
import type { BaseLlmClient } from '../core/baseLlmClient.js';
import type { ModelConfigKey } from '../services/modelConfigService.js';
import { debugLogger } from './debugLogger.js';
import { getResponseText } from './partUtils.js';
import { getErrorMessage } from './errors.js';

export const DEFAULT_FAST_ACK_MODEL_CONFIG_KEY: ModelConfigKey = {
  model: 'fast-ack-helper',
};

export const DEFAULT_MAX_INPUT_CHARS = 1200;
export const DEFAULT_MAX_OUTPUT_CHARS = 180;
const INPUT_TRUNCATION_SUFFIX = '\n...[truncated]';

/**
 * Normalizes whitespace in a string and trims it.
 */
export function normalizeSpace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Grapheme-aware slice.
 */
function safeSlice(text: string, start: number, end?: number): string {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const segments = Array.from(segmenter.segment(text));
  return segments
    .slice(start, end)
    .map((s) => s.segment)
    .join('');
}

/**
 * Grapheme-aware length.
 */
function safeLength(text: string): number {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  let count = 0;
  for (const _ of segmenter.segment(text)) {
    count++;
  }
  return count;
}

export const USER_STEERING_INSTRUCTION =
  'Internal instruction: Re-evaluate the active plan using this user steering update. ' +
  'Classify it as ADD_TASK, MODIFY_TASK, CANCEL_TASK, or EXTRA_CONTEXT. ' +
  'Apply minimal-diff changes only to affected tasks and keep unaffected tasks active. ' +
  'Do not cancel/skip tasks unless the user explicitly cancels them. ' +
  'Acknowledge the steering briefly and state the course correction.';

/**
 * Wraps user input in XML-like tags to mitigate prompt injection.
 */
function wrapInput(input: string): string {
  return `<user_input>\n${input}\n</user_input>`;
}

export function buildUserSteeringHintPrompt(hintText: string): string {
  const cleanHint = normalizeSpace(hintText);
  return `User steering update:\n${wrapInput(cleanHint)}\n${USER_STEERING_INSTRUCTION}`;
}

export function formatUserHintsForModel(hints: string[]): string | null {
  if (hints.length === 0) {
    return null;
  }
  const hintText = hints.map((hint) => `- ${normalizeSpace(hint)}`).join('\n');
  return `User hints:\n${wrapInput(hintText)}\n\n${USER_STEERING_INSTRUCTION}`;
}

const STEERING_ACK_INSTRUCTION =
  'Write one short, friendly sentence acknowledging a user steering update for an in-progress task. ' +
  'Be concrete when possible (e.g., mention skipped/cancelled item numbers). ' +
  'Do not apologize, do not mention internal policy, and do not add extra steps.';
const STEERING_ACK_TIMEOUT_MS = 1200;
const STEERING_ACK_MAX_INPUT_CHARS = 320;
const STEERING_ACK_MAX_OUTPUT_CHARS = 90;

function buildSteeringFallbackMessage(hintText: string): string {
  const normalized = normalizeSpace(hintText);
  if (!normalized) {
    return 'Understood. Adjusting the plan.';
  }
  if (safeLength(normalized) <= 64) {
    return `Understood. ${normalized}`;
  }
  return `Understood. ${safeSlice(normalized, 0, 61)}...`;
}

export async function generateSteeringAckMessage(
  llmClient: BaseLlmClient,
  hintText: string,
): Promise<string> {
  const fallbackText = buildSteeringFallbackMessage(hintText);

  const abortController = new AbortController();
  const timeout = setTimeout(
    () => abortController.abort(),
    STEERING_ACK_TIMEOUT_MS,
  );

  try {
    return await generateFastAckText(llmClient, {
      instruction: STEERING_ACK_INSTRUCTION,
      input: normalizeSpace(hintText),
      fallbackText,
      abortSignal: abortController.signal,
      maxInputChars: STEERING_ACK_MAX_INPUT_CHARS,
      maxOutputChars: STEERING_ACK_MAX_OUTPUT_CHARS,
      promptId: 'steering-ack',
    });
  } finally {
    clearTimeout(timeout);
  }
}

export interface GenerateFastAckTextOptions {
  instruction: string;
  input: string;
  fallbackText: string;
  abortSignal: AbortSignal;
  promptId: string;
  modelConfigKey?: ModelConfigKey;
  maxInputChars?: number;
  maxOutputChars?: number;
}

export function truncateFastAckInput(
  input: string,
  maxInputChars: number = DEFAULT_MAX_INPUT_CHARS,
): string {
  const suffixLength = safeLength(INPUT_TRUNCATION_SUFFIX);
  if (maxInputChars <= suffixLength) {
    return safeSlice(input, 0, Math.max(maxInputChars, 0));
  }
  if (safeLength(input) <= maxInputChars) {
    return input;
  }
  const keepChars = maxInputChars - suffixLength;
  return safeSlice(input, 0, keepChars) + INPUT_TRUNCATION_SUFFIX;
}

export async function generateFastAckText(
  llmClient: BaseLlmClient,
  options: GenerateFastAckTextOptions,
): Promise<string> {
  const {
    instruction,
    input,
    fallbackText,
    abortSignal,
    promptId,
    modelConfigKey = DEFAULT_FAST_ACK_MODEL_CONFIG_KEY,
    maxInputChars = DEFAULT_MAX_INPUT_CHARS,
    maxOutputChars = DEFAULT_MAX_OUTPUT_CHARS,
  } = options;

  const safeInstruction = instruction.trim();
  if (!safeInstruction) {
    return fallbackText;
  }

  const safeInput = truncateFastAckInput(input.trim(), maxInputChars);
  const prompt = `${safeInstruction}\n\nUser input:\n${wrapInput(safeInput)}`;

  try {
    const response = await llmClient.generateContent({
      modelConfigKey,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      role: LlmRole.UTILITY_FAST_ACK_HELPER,
      abortSignal,
      promptId,
      maxAttempts: 1, // Fast path, don't retry much
    });

    const responseText = normalizeSpace(getResponseText(response) || '');
    if (!responseText) {
      return fallbackText;
    }

    if (maxOutputChars > 0 && safeLength(responseText) > maxOutputChars) {
      return safeSlice(responseText, 0, maxOutputChars).trimEnd();
    }
    return responseText;
  } catch (error) {
    debugLogger.debug(
      `[FastAckHelper] Generation failed: ${getErrorMessage(error)}`,
    );
    return fallbackText;
  }
}
