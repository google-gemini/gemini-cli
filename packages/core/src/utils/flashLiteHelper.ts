/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content } from '@google/genai';
import type { GeminiClient } from '../core/client.js';
import type { ModelConfigKey } from '../services/modelConfigService.js';
import { debugLogger } from './debugLogger.js';
import { getResponseText } from './partUtils.js';

export const DEFAULT_FLASH_LITE_MODEL_CONFIG_KEY: ModelConfigKey = {
  model: 'flash-lite-helper',
};

export const DEFAULT_FLASH_LITE_MAX_INPUT_CHARS = 1200;
export const DEFAULT_FLASH_LITE_MAX_OUTPUT_CHARS = 180;
const INPUT_TRUNCATION_SUFFIX = '\n...[truncated]';

export const USER_STEERING_INSTRUCTION =
  'Internal instruction: Re-evaluate the active plan using this user steering update. ' +
  'Classify it as ADD_TASK, MODIFY_TASK, CANCEL_TASK, or EXTRA_CONTEXT. ' +
  'Apply minimal-diff changes only to affected tasks and keep unaffected tasks active. ' +
  'Do not cancel/skip tasks unless the user explicitly cancels them. ' +
  'Acknowledge the steering briefly and state the course correction.';

export function buildUserSteeringHintPrompt(hintText: string): string {
  const trimmedText = hintText.trim();
  return `User steering update: "${trimmedText}"\n${USER_STEERING_INSTRUCTION}`;
}

export function formatUserHintsForModel(hints: string[]): string | null {
  if (hints.length === 0) {
    return null;
  }
  const hintText = hints.map((hint) => `- ${hint}`).join('\n');
  return `User hints:\n${hintText}\n\n${USER_STEERING_INSTRUCTION}`;
}

const STEERING_ACK_INSTRUCTION =
  'Write one short, friendly sentence acknowledging a user steering update for an in-progress task. ' +
  'Be concrete when possible (e.g., mention skipped/cancelled item numbers). ' +
  'Do not apologize, do not mention internal policy, and do not add extra steps.';
const STEERING_ACK_TIMEOUT_MS = 1200;
const STEERING_ACK_MAX_INPUT_CHARS = 320;
const STEERING_ACK_MAX_OUTPUT_CHARS = 90;

function buildSteeringFallbackMessage(hintText: string): string {
  const normalized = hintText.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return 'Understood. Adjusting the plan.';
  }
  if (normalized.length <= 64) {
    return `Understood. ${normalized}`;
  }
  return `Understood. ${normalized.slice(0, 61)}...`;
}

export async function generateSteeringAckMessage(
  geminiClient: GeminiClient,
  hintText: string,
): Promise<string> {
  const fallbackText = buildSteeringFallbackMessage(hintText);

  const abortController = new AbortController();
  const timeout = setTimeout(
    () => abortController.abort(),
    STEERING_ACK_TIMEOUT_MS,
  );

  try {
    return await generateFlashLiteText(geminiClient, {
      instruction: STEERING_ACK_INSTRUCTION,
      input: hintText.replace(/\s+/g, ' ').trim(),
      fallbackText,
      abortSignal: abortController.signal,
      maxInputChars: STEERING_ACK_MAX_INPUT_CHARS,
      maxOutputChars: STEERING_ACK_MAX_OUTPUT_CHARS,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export interface GenerateFlashLiteTextOptions {
  instruction: string;
  input: string;
  fallbackText: string;
  abortSignal: AbortSignal;
  modelConfigKey?: ModelConfigKey;
  maxInputChars?: number;
  maxOutputChars?: number;
}

export function truncateFlashLiteInput(
  input: string,
  maxInputChars: number = DEFAULT_FLASH_LITE_MAX_INPUT_CHARS,
): string {
  if (maxInputChars <= INPUT_TRUNCATION_SUFFIX.length) {
    return input.slice(0, Math.max(maxInputChars, 0));
  }
  if (input.length <= maxInputChars) {
    return input;
  }
  const keepChars = maxInputChars - INPUT_TRUNCATION_SUFFIX.length;
  return input.slice(0, keepChars) + INPUT_TRUNCATION_SUFFIX;
}

export async function generateFlashLiteText(
  geminiClient: GeminiClient,
  options: GenerateFlashLiteTextOptions,
): Promise<string> {
  const {
    instruction,
    input,
    fallbackText,
    abortSignal,
    modelConfigKey = DEFAULT_FLASH_LITE_MODEL_CONFIG_KEY,
    maxInputChars = DEFAULT_FLASH_LITE_MAX_INPUT_CHARS,
    maxOutputChars = DEFAULT_FLASH_LITE_MAX_OUTPUT_CHARS,
  } = options;

  const safeInstruction = instruction.trim();
  if (!safeInstruction) {
    return fallbackText;
  }

  const safeInput = truncateFlashLiteInput(input.trim(), maxInputChars);
  const prompt = `${safeInstruction}\n\nUser input:\n"""${safeInput}"""`;
  const contents: Content[] = [{ role: 'user', parts: [{ text: prompt }] }];

  try {
    const response = await geminiClient.generateContent(
      modelConfigKey,
      contents,
      abortSignal,
    );
    const responseText = getResponseText(response)?.replace(/\s+/g, ' ').trim();
    if (!responseText) {
      return fallbackText;
    }

    if (maxOutputChars > 0 && responseText.length > maxOutputChars) {
      return responseText.slice(0, maxOutputChars).trimEnd();
    }
    return responseText;
  } catch (error) {
    debugLogger.debug(
      `[FlashLiteHelper] Generation failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return fallbackText;
  }
}
