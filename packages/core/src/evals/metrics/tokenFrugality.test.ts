/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { evaluateTokenFrugality } from './tokenFrugality.js';
import { MetricObjective, OptimizationDirection } from '../types.js';

describe('evaluateTokenFrugality', () => {
  it('should return the raw character count as the score', () => {
    const prediction = { output_text: 'Hello' };
    const result = evaluateTokenFrugality(prediction);
    expect(result.score).toBe(5);
    expect(result.objective).toBe(MetricObjective.FRUGALITY);
    expect(result.direction).toBe(OptimizationDirection.MINIMIZE);
    expect(result.reason).toContain('contains 5 characters');
  });

  it('should flag if response is succinct (under threshold)', () => {
    const prediction = { output_text: 'Short' };
    const result = evaluateTokenFrugality(prediction);
    expect(result.metadata?.['isOverThreshold']).toBe(false);
    expect(result.reason).toContain('Succinct response');
  });

  it('should flag if response exceeds chatter threshold', () => {
    const prediction = { output_text: 'a'.repeat(50) };
    const result = evaluateTokenFrugality(prediction);
    expect(result.metadata?.['isOverThreshold']).toBe(true);
    expect(result.reason).toContain('Exceeds threshold');
  });

  it('should handle missing output text as 0 chars', () => {
    const prediction = {};
    const result = evaluateTokenFrugality(prediction);
    expect(result.score).toBe(0);
    expect(result.reason).toContain('contains 0 characters');
  });
});
