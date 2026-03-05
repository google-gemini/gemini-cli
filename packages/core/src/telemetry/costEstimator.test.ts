/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CostEstimator } from './costEstimator.js';

describe('CostEstimator', () => {
  let estimator: CostEstimator;

  beforeEach(() => {
    estimator = new CostEstimator();
  });

  describe('Usage Recording', () => {
    it('should accumulate token usage for a model', () => {
      estimator.recordUsage('gemini-2.5-pro', {
        input: 1000,
        output: 500,
        cached: 200,
      });
      estimator.recordUsage('gemini-2.5-pro', {
        input: 2000,
        output: 1000,
        cached: 500,
      });
      const summary = estimator.getSummary();
      const breakdown = summary.modelBreakdowns.find(
        (b) => b.model === 'gemini-2.5-pro',
      );
      expect(breakdown).toBeDefined();
      expect(breakdown!.inputTokens).toBe(3000);
      expect(breakdown!.outputTokens).toBe(1500);
      expect(breakdown!.cachedTokens).toBe(700);
    });

    it('should handle missing cached tokens', () => {
      estimator.recordUsage('gemini-2.0-flash', { input: 1000, output: 500 });
      const summary = estimator.getSummary();
      expect(summary.modelBreakdowns[0].cachedTokens).toBe(0);
    });
  });

  describe('Cost Calculation', () => {
    it('should compute costs using model pricing', () => {
      estimator.recordUsage('gemini-2.5-pro', {
        input: 1_000_000,
        output: 1_000_000,
        cached: 0,
      });
      const summary = estimator.getSummary();
      const breakdown = summary.modelBreakdowns[0];
      // gemini-2.5-pro: $1.25/M input, $10/M output
      expect(breakdown.inputCost).toBeCloseTo(1.25);
      expect(breakdown.outputCost).toBeCloseTo(10.0);
      expect(breakdown.totalCost).toBeCloseTo(11.25);
    });

    it('should compute cache savings correctly', () => {
      estimator.recordUsage('gemini-2.5-pro', {
        input: 1_000_000,
        output: 0,
        cached: 500_000,
      });
      const summary = estimator.getSummary();
      expect(summary.totalSavingsFromCache).toBeGreaterThan(0);
    });

    it('should fallback for unknown models', () => {
      estimator.recordUsage('unknown-model', {
        input: 1_000_000,
        output: 500_000,
      });
      const summary = estimator.getSummary();
      expect(summary.totalCost).toBeGreaterThan(0);
    });
  });

  describe('Multi-Model', () => {
    it('should track multiple models independently', () => {
      estimator.recordUsage('gemini-2.0-flash', { input: 1000, output: 500 });
      estimator.recordUsage('gemini-2.5-pro', { input: 1000, output: 500 });
      const summary = estimator.getSummary();
      expect(summary.modelBreakdowns.length).toBe(2);
    });

    it('should identify cheapest and most expensive models', () => {
      estimator.recordUsage('gemini-2.0-flash', { input: 10000, output: 5000 });
      estimator.recordUsage('gemini-2.5-pro', { input: 10000, output: 5000 });
      const summary = estimator.getSummary();
      expect(summary.cheapestModel).toBe('gemini-2.0-flash');
      expect(summary.mostExpensiveModel).toBe('gemini-2.5-pro');
    });

    it('should generate recommendation when cost difference is large', () => {
      estimator.recordUsage('gemini-2.0-flash', {
        input: 100000,
        output: 50000,
      });
      estimator.recordUsage('gemini-2.5-pro', { input: 100000, output: 50000 });
      const summary = estimator.getSummary();
      expect(summary.recommendation).toBeTruthy();
      expect(summary.recommendation).toContain('gemini-2.0-flash');
    });
  });

  describe('Pricing', () => {
    it('should support custom pricing', () => {
      const custom = new CostEstimator({
        'custom-model': {
          inputPerMillion: 5,
          outputPerMillion: 15,
          cachedInputPerMillion: 1,
        },
      });
      custom.recordUsage('custom-model', {
        input: 1_000_000,
        output: 1_000_000,
      });
      const summary = custom.getSummary();
      expect(summary.totalCost).toBeCloseTo(20);
    });

    it('should match model prefix', () => {
      const pricing = estimator.getPricing('gemini-2.5-pro-latest');
      expect(pricing.inputPerMillion).toBe(1.25);
    });
  });

  describe('Reset', () => {
    it('should clear all usage', () => {
      estimator.recordUsage('model', { input: 1000, output: 500 });
      estimator.reset();
      const summary = estimator.getSummary();
      expect(summary.modelBreakdowns.length).toBe(0);
      expect(summary.totalCost).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty summary', () => {
      const summary = estimator.getSummary();
      expect(summary.totalCost).toBe(0);
      expect(summary.cheapestModel).toBeNull();
      expect(summary.recommendation).toBeNull();
    });

    it('should handle single model with no recommendation', () => {
      estimator.recordUsage('gemini-2.0-flash', { input: 1000, output: 500 });
      const summary = estimator.getSummary();
      expect(summary.recommendation).toBeNull();
    });
  });
});
