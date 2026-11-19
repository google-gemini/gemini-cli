/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  tokenLimit,
  outputTokenLimit,
  DEFAULT_TOKEN_LIMIT,
  DEFAULT_OUTPUT_TOKEN_LIMIT,
} from './tokenLimits.js';
import {
  BASE_GEMINI_FLASH_LITE_MODEL,
  BASE_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_FLASH_LITE_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_MODEL,
  GEMINI_MODEL_ALIAS_AUTO,
  GEMINI_MODEL_ALIAS_FLASH,
  GEMINI_MODEL_ALIAS_FLASH_LITE,
  GEMINI_MODEL_ALIAS_PRO,
  GEMMA_4_26B_A4B_IT_MODEL,
  GEMMA_4_31B_IT_MODEL,
  LATEST_GEMINI_FLASH_LITE_MODEL,
  LATEST_GEMINI_FLASH_MODEL,
  PREVIEW_GEMINI_3_1_CUSTOM_TOOLS_MODEL,
  PREVIEW_GEMINI_3_1_MODEL,
  PREVIEW_GEMINI_FLASH_MODEL,
  PREVIEW_GEMINI_MODEL,
} from '../config/models.js';

describe('tokenLimit', () => {
  it('should return the correct token limit for default models', () => {
    expect(tokenLimit(DEFAULT_GEMINI_MODEL)).toBe(1_048_576);
    expect(tokenLimit(DEFAULT_GEMINI_FLASH_MODEL)).toBe(1_048_576);
    expect(tokenLimit(DEFAULT_GEMINI_FLASH_LITE_MODEL)).toBe(1_048_576);
  });

  it('should return the correct token limit for preview models', () => {
    expect(tokenLimit(PREVIEW_GEMINI_MODEL)).toBe(1_048_576);
    expect(tokenLimit(PREVIEW_GEMINI_FLASH_MODEL)).toBe(1_048_576);
  });

  it('should return the default token limit for an unknown model', () => {
    expect(tokenLimit('unknown-model')).toBe(DEFAULT_TOKEN_LIMIT);
  });

  it('should return the default token limit if no model is provided', () => {
    // @ts-expect-error testing invalid input
    expect(tokenLimit(undefined)).toBe(DEFAULT_TOKEN_LIMIT);
  });

  it('should have the correct default token limit value', () => {
    expect(DEFAULT_TOKEN_LIMIT).toBe(1_048_576);
  });
});

describe('outputTokenLimit', () => {
  it('should return 65,536 for default and GA Gemini models', () => {
    expect(outputTokenLimit(DEFAULT_GEMINI_MODEL)).toBe(65_536);
    expect(outputTokenLimit(DEFAULT_GEMINI_FLASH_MODEL)).toBe(65_536);
    expect(outputTokenLimit(DEFAULT_GEMINI_FLASH_LITE_MODEL)).toBe(65_536);
    expect(outputTokenLimit(BASE_GEMINI_FLASH_MODEL)).toBe(65_536);
    expect(outputTokenLimit(LATEST_GEMINI_FLASH_MODEL)).toBe(65_536);
    expect(outputTokenLimit(BASE_GEMINI_FLASH_LITE_MODEL)).toBe(65_536);
    expect(outputTokenLimit(LATEST_GEMINI_FLASH_LITE_MODEL)).toBe(65_536);
    expect(outputTokenLimit('gemini-2.5-flash')).toBe(65_536);
    expect(outputTokenLimit('gemini-2.5-flash-lite')).toBe(65_536);
  });

  it('should return 65,536 for preview Gemini models and aliases', () => {
    expect(outputTokenLimit(PREVIEW_GEMINI_MODEL)).toBe(65_536);
    expect(outputTokenLimit(PREVIEW_GEMINI_3_1_MODEL)).toBe(65_536);
    expect(outputTokenLimit(PREVIEW_GEMINI_3_1_CUSTOM_TOOLS_MODEL)).toBe(
      65_536,
    );
    expect(outputTokenLimit(PREVIEW_GEMINI_FLASH_MODEL)).toBe(65_536);
    expect(outputTokenLimit(GEMINI_MODEL_ALIAS_AUTO)).toBe(65_536);
    expect(outputTokenLimit(GEMINI_MODEL_ALIAS_PRO)).toBe(65_536);
    expect(outputTokenLimit(GEMINI_MODEL_ALIAS_FLASH)).toBe(65_536);
    expect(outputTokenLimit(GEMINI_MODEL_ALIAS_FLASH_LITE)).toBe(65_536);
  });

  it('should return undefined for unknown or custom models', () => {
    expect(outputTokenLimit('unknown-model')).toBeUndefined();
    expect(outputTokenLimit(GEMMA_4_31B_IT_MODEL)).toBeUndefined();
    expect(outputTokenLimit(GEMMA_4_26B_A4B_IT_MODEL)).toBeUndefined();
    // @ts-expect-error testing invalid input
    expect(outputTokenLimit(undefined)).toBeUndefined();
  });

  it('should have the correct default output token limit value', () => {
    expect(DEFAULT_OUTPUT_TOKEN_LIMIT).toBe(65_536);
  });
});
