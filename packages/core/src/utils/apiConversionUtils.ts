/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GenerateContentParameters } from '@google/genai';

/**
 * Transforms a standard SDK GenerateContentParameters object into the
 * equivalent REST API payload format. This is primarily used for debugging
 * and exporting requests.
 */
export function convertToRestPayload(
  req: GenerateContentParameters,
): Record<string, unknown> {
  // Extract top-level REST fields from the SDK config object.
  // 'pureGenerationConfig' will capture any remaining hyperparameters (e.g., temperature, topP).
  const {
    systemInstruction: sdkSystemInstruction,
    tools: sdkTools,
    toolConfig: sdkToolConfig,
    safetySettings: sdkSafetySettings,
    cachedContent: sdkCachedContent,
    abortSignal: _sdkAbortSignal, // Exclude JS-specific abort controller
    ...pureGenerationConfig
  } = req.config || {};

  // Normalize systemInstruction to the expected REST Content format.
  let restSystemInstruction;
  if (typeof sdkSystemInstruction === 'string') {
    restSystemInstruction = {
      parts: [{ text: sdkSystemInstruction }],
    };
  } else if (sdkSystemInstruction !== undefined) {
    restSystemInstruction = sdkSystemInstruction;
  }

  const restPayload: Record<string, unknown> = {
    contents: req.contents,
  };

  // Only include generationConfig if actual hyperparameters exist.
  if (Object.keys(pureGenerationConfig).length > 0) {
    restPayload['generationConfig'] = pureGenerationConfig;
  }

  // Assign extracted capabilities to the root level.
  if (restSystemInstruction)
    restPayload['systemInstruction'] = restSystemInstruction;
  if (sdkTools) restPayload['tools'] = sdkTools;
  if (sdkToolConfig) restPayload['toolConfig'] = sdkToolConfig;
  if (sdkSafetySettings) restPayload['safetySettings'] = sdkSafetySettings;
  if (sdkCachedContent) restPayload['cachedContent'] = sdkCachedContent;

  return restPayload;
}
