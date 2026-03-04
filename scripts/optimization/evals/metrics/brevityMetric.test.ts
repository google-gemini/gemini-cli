/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { evaluateBrevity } from './brevityMetric.js';

describe('evaluateBrevity 4-tier step-function', () => {
  it('should return 1.0 for a succinct response (<= 10 words)', () => {
    const prediction = { output_text: 'I have updated the file for you now.' }; // 8 words
    const result = evaluateBrevity(prediction);
    expect(result.score).toBe(1.0);
    expect(result.metadata?.tier).toBe('succinct');
  });

  it('should return 0.7 for an acceptable response (11-25 words)', () => {
    const text =
      'I have successfully updated the file. Everything looks good to proceed with the next step.';
    // 16 words
    const prediction = { output_text: text };
    const result = evaluateBrevity(prediction);
    expect(result.score).toBe(0.7);
    expect(result.metadata?.tier).toBe('acceptable');
  });

  it('should return 0.4 for a verbose response (26-50 words)', () => {
    const text =
      'Certainly! I would be more than happy to assist you with that request. I am now proceeding to surgically update the file using the replace tool to ensure accuracy.';
    // 29 words
    const prediction = { output_text: text };
    const result = evaluateBrevity(prediction);
    expect(result.score).toBe(0.4);
    expect(result.metadata?.tier).toBe('verbose');
  });

  it('should return 0.1 for a heavy response (> 50 words)', () => {
    const text =
      'Certainly! I would be more than happy to assist you with that request. I am now proceeding to surgically update the file using the replace tool to ensure accuracy. I will then verify the changes and let you know when I am finished with the task so we can move to the next stage of implementation.';
    // 53 words
    const prediction = { output_text: text };
    const result = evaluateBrevity(prediction);
    expect(result.score).toBe(0.1);
    expect(result.metadata?.tier).toBe('heavy');
  });

  it('should handle missing output text as succinct (0 words)', () => {
    const prediction = {};
    const result = evaluateBrevity(prediction);
    expect(result.score).toBe(1.0);
    expect(result.metadata?.tier).toBe('succinct');
  });
});
