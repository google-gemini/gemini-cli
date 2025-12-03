/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect, describe, it } from 'vitest';
import { performInit } from './init.js';

describe('performInit', () => {
  it('returns info if GEMINI.md already exists', () => {
    const result = performInit({
      doesGeminiMdExist: () => true,
    });

    expect(result.type).toBe('info');
    if (result.type === 'info') {
      expect(result.message).toContain('already exists');
    }
  });

  it('returns new_file with a prompt if GEMINI.md does not exist', () => {
    const result = performInit({
      doesGeminiMdExist: () => false,
    });

    expect(result.type).toBe('new_file');
    if (result.type === 'new_file') {
      expect(result.prompt).toContain('You are an AI agent');
    }
  });
});
