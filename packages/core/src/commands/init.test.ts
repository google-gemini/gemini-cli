/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect, describe, it } from 'vitest';
import { performInit } from './init.js';

describe('performInit', () => {
  it('returns info if GEMINI.md already exists', () => {
    const result = performInit(true);

    expect(result.type).toBe('message');
    if (result.type === 'message') {
      expect(result.messageType).toBe('info');
      expect(result.content).toContain('already exists');
    }
  });

  it('returns submit_prompt if GEMINI.md does not exist', () => {
    const result = performInit(false);
    expect(result.type).toBe('submit_prompt');

    if (result.type === 'submit_prompt') {
      expect(result.content).toContain('You are an AI agent');
    }
  });
});
