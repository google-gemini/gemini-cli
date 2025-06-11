/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { Counter, Meter, metrics } from '@opentelemetry/api';
import { initializeMetrics, recordTokenUsageMetrics } from './metrics.js';
import { Config } from '../config/config.js';

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
    const mockConfig = {
      getSessionId: () => 'test-session-id',
    } as unknown as Config;

    it('should not record metrics if not initialized', () => {
      recordTokenUsageMetrics(mockConfig, 'gemini-pro', 100, 'input');
      expect(mockCounter.add).not.toHaveBeenCalled();
    });

    it('should record token usage with the correct attributes', () => {
      initializeMetrics(mockConfig);
      recordTokenUsageMetrics(mockConfig, 'gemini-pro', 100, 'input');
      expect(mockCounter.add).toHaveBeenCalledWith(100, {
        'session.id': 'test-session-id',
        model: 'gemini-pro',
        type: 'input',
      });
    });

    it('should record token usage for different types', () => {
      initializeMetrics(mockConfig);
      recordTokenUsageMetrics(mockConfig, 'gemini-pro', 50, 'output');
      expect(mockCounter.add).toHaveBeenCalledWith(50, {
        'session.id': 'test-session-id',
        model: 'gemini-pro',
        type: 'output',
      });

      recordTokenUsageMetrics(mockConfig, 'gemini-pro', 25, 'thought');
      expect(mockCounter.add).toHaveBeenCalledWith(25, {
        'session.id': 'test-session-id',
        model: 'gemini-pro',
        type: 'thought',
      });

      recordTokenUsageMetrics(mockConfig, 'gemini-pro', 75, 'cache');
      expect(mockCounter.add).toHaveBeenCalledWith(75, {
        'session.id': 'test-session-id',
        model: 'gemini-pro',
        type: 'cache',
      });

      recordTokenUsageMetrics(mockConfig, 'gemini-pro', 125, 'tool');
      expect(mockCounter.add).toHaveBeenCalledWith(125, {
        'session.id': 'test-session-id',
        model: 'gemini-pro',
        type: 'tool',
      });
    });

    it('should handle different models', () => {
      initializeMetrics(mockConfig);
      recordTokenUsageMetrics(mockConfig, 'gemini-ultra', 200, 'input');
      expect(mockCounter.add).toHaveBeenCalledWith(200, {
        'session.id': 'test-session-id',
        model: 'gemini-ultra',
        type: 'input',
      });
    });
  });
});
