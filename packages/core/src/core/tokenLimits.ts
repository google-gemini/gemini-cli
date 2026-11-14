/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BASE_GEMINI_FLASH_LITE_MODEL,
  BASE_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_FLASH_LITE_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_MODEL_AUTO,
  GEMINI_MODEL_ALIAS_AUTO,
  GEMINI_MODEL_ALIAS_FLASH,
  GEMINI_MODEL_ALIAS_FLASH_LITE,
  GEMINI_MODEL_ALIAS_PRO,
  GEMMA_4_26B_A4B_IT_MODEL,
  GEMMA_4_31B_IT_MODEL,
  LATEST_GEMINI_FLASH_LITE_MODEL,
  LATEST_GEMINI_FLASH_MODEL,
  LEGACY_CCPA_FLASH_MODEL,
  PREVIEW_GEMINI_3_1_CUSTOM_TOOLS_MODEL,
  PREVIEW_GEMINI_3_1_MODEL,
  PREVIEW_GEMINI_FLASH_MODEL,
  PREVIEW_GEMINI_MODEL,
  PREVIEW_GEMINI_MODEL_AUTO,
} from '../config/models.js';

type Model = string;
type TokenCount = number;

export const DEFAULT_TOKEN_LIMIT = 1_048_576;
export const DEFAULT_OUTPUT_TOKEN_LIMIT = 65_536;
export const GEMMA_4_TOKEN_LIMIT = 256_000;

export function tokenLimit(model: Model): TokenCount {
  // Add other models as they become relevant or if specified by config
  // Pulled from https://ai.google.dev/gemini-api/docs/models
  switch (model) {
    case GEMMA_4_31B_IT_MODEL:
    case GEMMA_4_26B_A4B_IT_MODEL:
      return GEMMA_4_TOKEN_LIMIT;
    case PREVIEW_GEMINI_MODEL:
    case PREVIEW_GEMINI_FLASH_MODEL:
    case DEFAULT_GEMINI_MODEL:
    case DEFAULT_GEMINI_FLASH_MODEL:
    case DEFAULT_GEMINI_FLASH_LITE_MODEL:
      return 1_048_576;
    default:
      return DEFAULT_TOKEN_LIMIT;
  }
}

export function outputTokenLimit(model: Model): TokenCount | undefined {
  // Add other models as they become relevant or if specified by config
  // Pulled from https://ai.google.dev/gemini-api/docs/models
  switch (model) {
    case PREVIEW_GEMINI_MODEL:
    case PREVIEW_GEMINI_3_1_MODEL:
    case PREVIEW_GEMINI_3_1_CUSTOM_TOOLS_MODEL:
    case PREVIEW_GEMINI_FLASH_MODEL:
    case DEFAULT_GEMINI_MODEL:
    case DEFAULT_GEMINI_FLASH_MODEL:
    case DEFAULT_GEMINI_FLASH_LITE_MODEL:
    case BASE_GEMINI_FLASH_MODEL:
    case LATEST_GEMINI_FLASH_MODEL:
    case LEGACY_CCPA_FLASH_MODEL:
    case BASE_GEMINI_FLASH_LITE_MODEL:
    case LATEST_GEMINI_FLASH_LITE_MODEL:
    case 'gemini-2.5-flash':
    case 'gemini-2.5-flash-lite':
    case 'gemini-3.1-flash-lite-preview':
    case GEMINI_MODEL_ALIAS_AUTO:
    case PREVIEW_GEMINI_MODEL_AUTO:
    case DEFAULT_GEMINI_MODEL_AUTO:
    case GEMINI_MODEL_ALIAS_PRO:
    case GEMINI_MODEL_ALIAS_FLASH:
    case GEMINI_MODEL_ALIAS_FLASH_LITE:
      return DEFAULT_OUTPUT_TOKEN_LIMIT;
    default:
      return undefined;
  }
}
