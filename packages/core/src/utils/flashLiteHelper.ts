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
