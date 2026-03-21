/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { tokenLimit, DEFAULT_TOKEN_LIMIT } from './tokenLimits.js';
import {
  DEFAULT_GEMINI_FLASH_LITE_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_MODEL,
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

  it('should return a safe default for unknown models', () => {
    expect(tokenLimit('unknown-model')).toBe(128_000);
  });

  it('should return the Gemini default if no model is provided', () => {
    // @ts-expect-error testing invalid input
    expect(tokenLimit(undefined)).toBe(DEFAULT_TOKEN_LIMIT);
  });

  it('should have the correct default token limit value', () => {
    expect(DEFAULT_TOKEN_LIMIT).toBe(1_048_576);
  });

  it('should return correct limits for OpenAI-compatible models', () => {
    expect(tokenLimit('claude-opus-4')).toBe(200_000);
    expect(tokenLimit('claude-3-5-sonnet-20241022')).toBe(200_000);
    expect(tokenLimit('gpt-4o')).toBe(128_000);
    expect(tokenLimit('gpt-4-turbo')).toBe(128_000);
    expect(tokenLimit('o1-preview')).toBe(200_000);
    expect(tokenLimit('o3-mini')).toBe(200_000);
    expect(tokenLimit('codex-mini-latest')).toBe(200_000);
  });
});
