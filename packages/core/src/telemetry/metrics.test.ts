/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { Counter, Meter, metrics } from '@opentelemetry/api';
import { initializeMetrics, recordTokenUsageMetrics } from './metrics.js';

const mockCounter = {
  add: vi.fn(),
} as unknown as Counter;

const mockMeter = {
  createCounter: vi.fn().mockReturnValue(mockCounter),
  createHistogram: vi.fn().mockReturnValue({ record: vi.fn() }),
} as unknown as Meter;

vi.mock('@opentelemetry/api', () => ({
  metrics: {
    getMeter: vi.fn(),
  },
  ValueType: {
    INT: 1,
  },
}));

describe('Telemetry Metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (metrics.getMeter as Mock).mockReturnValue(mockMeter);
  });

  describe('recordTokenUsageMetrics', () => {
    it('should not record metrics if not initialized', () => {
      recordTokenUsageMetrics('gemini-pro', 100, 'input');
      expect(mockCounter.add).not.toHaveBeenCalled();
    });

    it('should record token usage with the correct attributes', () => {
      initializeMetrics();
      recordTokenUsageMetrics('gemini-pro', 100, 'input');
      expect(mockCounter.add).toHaveBeenCalledWith(100, {
        model: 'gemini-pro',
        type: 'input',
      });
    });

    it('should record token usage for different types', () => {
      initializeMetrics();
      recordTokenUsageMetrics('gemini-pro', 50, 'output');
      expect(mockCounter.add).toHaveBeenCalledWith(50, {
        model: 'gemini-pro',
        type: 'output',
      });

      recordTokenUsageMetrics('gemini-pro', 25, 'thought');
      expect(mockCounter.add).toHaveBeenCalledWith(25, {
        model: 'gemini-pro',
        type: 'thought',
      });

      recordTokenUsageMetrics('gemini-pro', 75, 'cache');
      expect(mockCounter.add).toHaveBeenCalledWith(75, {
        model: 'gemini-pro',
        type: 'cache',
      });

      recordTokenUsageMetrics('gemini-pro', 125, 'tool');
      expect(mockCounter.add).toHaveBeenCalledWith(125, {
        model: 'gemini-pro',
        type: 'tool',
      });
    });

    it('should handle different models', () => {
      initializeMetrics();
      recordTokenUsageMetrics('gemini-ultra', 200, 'input');
      expect(mockCounter.add).toHaveBeenCalledWith(200, {
        model: 'gemini-ultra',
        type: 'input',
      });
    });
  });
});
