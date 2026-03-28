/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  DEFAULT_GEMINI_FLASH_LITE_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_MODEL,
  PREVIEW_GEMINI_FLASH_MODEL,
  PREVIEW_GEMINI_MODEL,
} from '../config/models.js';

type Model = string;
type TokenCount = number;

export const DEFAULT_TOKEN_LIMIT = 1_048_576;

export function tokenLimit(model: Model): TokenCount {
  // Exact matches for known Gemini models
  switch (model) {
    case PREVIEW_GEMINI_MODEL:
    case PREVIEW_GEMINI_FLASH_MODEL:
    case DEFAULT_GEMINI_MODEL:
    case DEFAULT_GEMINI_FLASH_MODEL:
    case DEFAULT_GEMINI_FLASH_LITE_MODEL:
      return 1_048_576;
    default:
      break;
  }

  // Pattern-based matching for models routed via OpenAI-compatible endpoints
  if (!model) return DEFAULT_TOKEN_LIMIT;
  const m = model.toLowerCase();

  if (/claude/.test(m)) return 200_000;
  if (/gpt-4o|gpt-4-turbo/.test(m)) return 128_000;
  if (/gpt-4(?!o|-turbo)/.test(m)) return 8_192;
  if (/^o[134]/.test(m)) return 200_000;
  if (/codex/.test(m)) return 200_000;
  if (/gemini/.test(m)) return 1_048_576;

  // Unknown models: 128K is a safe middle ground.
  // 1M is dangerous (causes 403s on smaller-context models).
  return 128_000;
}
