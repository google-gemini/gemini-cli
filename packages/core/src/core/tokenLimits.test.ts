/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { tokenLimit, DEFAULT_TOKEN_LIMIT } from './tokenLimits.js';

describe('tokenLimit', () => {
  it('should return the correct token limit for gemini-1.5-pro', () => {
    expect(tokenLimit('gemini-1.5-pro')).toBe(2_097_152);
  });

  it('should return the correct token limit for gemini-1.5-flash', () => {
    expect(tokenLimit('gemini-1.5-flash')).toBe(1_048_576);
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
