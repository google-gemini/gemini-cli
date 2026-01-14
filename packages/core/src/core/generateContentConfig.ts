/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type GenerateContentConfig, ThinkingLevel } from '@google/genai';
import type { Config } from '../config/config.js';

export function applyGlobalGenerationConfig(
  generateContentConfig: GenerateContentConfig,
  config: Config,
): GenerateContentConfig {
  const newConfig = { ...generateContentConfig };

  const globalSeed = config.getModelSeed();
  if (globalSeed !== undefined) {
    newConfig.seed = globalSeed;
  }

  const globalTemperature = config.getModelTemperature();
  if (globalTemperature !== undefined) {
    newConfig.temperature = globalTemperature;
  }

  const globalTopK = config.getModelTopK();
  if (globalTopK !== undefined) {
    newConfig.topK = globalTopK;
  }

  const globalTopP = config.getModelTopP();
  if (globalTopP !== undefined) {
    newConfig.topP = globalTopP;
  }

  const globalThinkingLevel = config.getModelThinkingLevel();
  const globalIncludeThoughts = config.getModelIncludeThoughts();
  const globalThinkingBudget = config.getModelThinkingBudget();

  if (
    globalThinkingLevel ||
    globalIncludeThoughts !== undefined ||
    globalThinkingBudget !== undefined
  ) {
    newConfig.thinkingConfig = {
      ...newConfig.thinkingConfig,
      ...(globalThinkingLevel
        ? {
            thinkingLevel:
              ThinkingLevel[globalThinkingLevel as keyof typeof ThinkingLevel],
          }
        : {}),
      ...(globalIncludeThoughts !== undefined
        ? { includeThoughts: globalIncludeThoughts }
        : {}),
      ...(globalThinkingBudget !== undefined
        ? { thinkingBudget: globalThinkingBudget }
        : {}),
    };
  }

  return newConfig;
}
