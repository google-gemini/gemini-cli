/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  calculateCost,
  calculateTotalCost,
  formatCost,
  getModelPricing,
} from './tokenPricing.js';

describe('tokenPricing', () => {
  describe('getModelPricing', () => {
    it('returns pricing for known models', () => {
      const pricing = getModelPricing('gemini-2.5-flash');
      expect(pricing.input).toBe(0.15);
      expect(pricing.output).toBe(0.6);
    });

    it('returns pricing for flash-lite model', () => {
      const pricing = getModelPricing('gemini-2.5-flash-lite');
      expect(pricing.input).toBe(0.075);
      expect(pricing.output).toBe(0.3);
    });

    it('returns default pricing for unknown models', () => {
      const pricing = getModelPricing('unknown-model');
      expect(pricing.input).toBe(0.1);
      expect(pricing.output).toBe(0.4);
    });
  });

  describe('calculateCost', () => {
    it('calculates cost for gemini-2.5-flash', () => {
      // 1M input tokens at $0.15/1M = $0.15
      // 1M output tokens at $0.60/1M = $0.60
      const cost = calculateCost(1_000_000, 1_000_000, 'gemini-2.5-flash');
      expect(cost).toBeCloseTo(0.75, 3);
    });

    it('calculates cost for gemini-2.5-pro', () => {
      // 1M input tokens at $1.25/1M = $1.25
      // 1M output tokens at $10/1M = $10
      const cost = calculateCost(1_000_000, 1_000_000, 'gemini-2.5-pro');
      expect(cost).toBeCloseTo(11.25, 2);
    });

    it('calculates cost for gemini-3-pro-preview', () => {
      // 1M input tokens at $2.00/1M = $2.00
      // 1M output tokens at $12.00/1M = $12.00
      const cost = calculateCost(1_000_000, 1_000_000, 'gemini-3-pro-preview');
      expect(cost).toBeCloseTo(14.0, 2);
    });

    it('returns 0 for zero tokens', () => {
      const cost = calculateCost(0, 0, 'gemini-2.5-flash');
      expect(cost).toBe(0);
    });
  });

  describe('calculateTotalCost', () => {
    it('aggregates costs across multiple models', () => {
      const modelTokens = {
        'gemini-2.5-flash': { prompt: 100_000, candidates: 50_000 },
        'gemini-2.5-pro': { prompt: 10_000, candidates: 5_000 },
      };
      const cost = calculateTotalCost(modelTokens);
      // Flash: (100K * 0.15 + 50K * 0.6) / 1M = 0.015 + 0.03 = 0.045
      // Pro: (10K * 1.25 + 5K * 10) / 1M = 0.0125 + 0.05 = 0.0625
      // Total: 0.1075
      expect(cost).toBeCloseTo(0.1075, 3);
    });

    it('returns 0 for empty models', () => {
      const cost = calculateTotalCost({});
      expect(cost).toBe(0);
    });
  });

  describe('formatCost', () => {
    it('formats zero cost', () => {
      expect(formatCost(0)).toBe('$0');
    });

    it('formats very small costs', () => {
      expect(formatCost(0.001)).toBe('<$0.01');
      expect(formatCost(0.005)).toBe('<$0.01');
    });

    it('formats cents', () => {
      expect(formatCost(0.01)).toBe('$0.01');
      expect(formatCost(0.05)).toBe('$0.05');
      expect(formatCost(0.99)).toBe('$0.99');
    });

    it('formats dollars', () => {
      expect(formatCost(1.0)).toBe('$1.00');
      expect(formatCost(1.23)).toBe('$1.23');
      expect(formatCost(10.5)).toBe('$10.50');
    });
  });
});
