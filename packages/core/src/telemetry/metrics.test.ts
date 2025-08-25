/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type {
  Counter,
  Meter,
  Attributes,
  Context,
  Histogram,
} from '@opentelemetry/api';
import type { Config } from '../config/config.js';
import { FileOperation } from './metrics.js';
import { makeFakeConfig } from '../test-utils/config.js';

const mockCounterAddFn: Mock<
  (value: number, attributes?: Attributes, context?: Context) => void
> = vi.fn();
const mockHistogramRecordFn: Mock<
  (value: number, attributes?: Attributes, context?: Context) => void
> = vi.fn();

const mockCreateCounterFn: Mock<(name: string, options?: unknown) => Counter> =
  vi.fn();
const mockCreateHistogramFn: Mock<
  (name: string, options?: unknown) => Histogram
> = vi.fn();

const mockCounterInstance: Counter = {
  add: mockCounterAddFn,
} as Partial<Counter> as Counter;

const mockHistogramInstance: Histogram = {
  record: mockHistogramRecordFn,
} as Partial<Histogram> as Histogram;

const mockMeterInstance: Meter = {
  createCounter: mockCreateCounterFn.mockReturnValue(mockCounterInstance),
  createHistogram: mockCreateHistogramFn.mockReturnValue(mockHistogramInstance),
} as Partial<Meter> as Meter;

function originalOtelMockFactory() {
  return {
    metrics: {
      getMeter: vi.fn(),
    },
    ValueType: {
      INT: 1,
    },
    diag: {
      setLogger: vi.fn(),
    },
  };
}

vi.mock('@opentelemetry/api');

describe('Telemetry Metrics', () => {
  let initializeMetricsModule: typeof import('./metrics.js').initializeMetrics;
  let recordTokenUsageMetricsModule: typeof import('./metrics.js').recordTokenUsageMetrics;
  let recordFileOperationMetricModule: typeof import('./metrics.js').recordFileOperationMetric;
  let recordChatCompressionMetricsModule: typeof import('./metrics.js').recordChatCompressionMetrics;

  beforeEach(async () => {
    vi.resetModules();
    vi.doMock('@opentelemetry/api', () => {
      const actualApi = originalOtelMockFactory();
      (actualApi.metrics.getMeter as Mock).mockReturnValue(mockMeterInstance);
      return actualApi;
    });

    const metricsJsModule = await import('./metrics.js');
    initializeMetricsModule = metricsJsModule.initializeMetrics;
    recordTokenUsageMetricsModule = metricsJsModule.recordTokenUsageMetrics;
    recordFileOperationMetricModule = metricsJsModule.recordFileOperationMetric;
    recordChatCompressionMetricsModule =
      metricsJsModule.recordChatCompressionMetrics;

    const otelApiModule = await import('@opentelemetry/api');

    mockCounterAddFn.mockClear();
    mockCreateCounterFn.mockClear();
    mockCreateHistogramFn.mockClear();
    mockHistogramRecordFn.mockClear();
    (otelApiModule.metrics.getMeter as Mock).mockClear();

    (otelApiModule.metrics.getMeter as Mock).mockReturnValue(mockMeterInstance);
    mockCreateCounterFn.mockReturnValue(mockCounterInstance);
    mockCreateHistogramFn.mockReturnValue(mockHistogramInstance);
  });

  describe('recordChatCompressionMetrics', () => {
    it('does not record metrics if not initialized', () => {
      const lol = makeFakeConfig({});

      recordChatCompressionMetricsModule(lol, {
        tokens_after: 100,
        tokens_before: 200,
      });

      expect(mockCounterAddFn).not.toHaveBeenCalled();
    });

    it('records token compression with the correct attributes', () => {
      const config = makeFakeConfig({});
      initializeMetricsModule(config);

      recordChatCompressionMetricsModule(config, {
        tokens_after: 100,
        tokens_before: 200,
      });

      expect(mockCounterAddFn).toHaveBeenCalledWith(1, {
        'session.id': 'test-session-id',
        tokens_after: 100,
        tokens_before: 200,
      });
    });
  });

  describe('recordTokenUsageMetrics', () => {
    const mockConfig = {
      getSessionId: () => 'test-session-id',
    } as unknown as Config;

    it('should not record metrics if not initialized', () => {
      recordTokenUsageMetricsModule(mockConfig, 'gemini-pro', 100, 'input');
      expect(mockCounterAddFn).not.toHaveBeenCalled();
    });

    it('should record token usage with the correct attributes', () => {
      initializeMetricsModule(mockConfig);
      recordTokenUsageMetricsModule(mockConfig, 'gemini-pro', 100, 'input');
      expect(mockCounterAddFn).toHaveBeenCalledTimes(2);
      expect(mockCounterAddFn).toHaveBeenNthCalledWith(1, 1, {
        'session.id': 'test-session-id',
      });
      expect(mockCounterAddFn).toHaveBeenNthCalledWith(2, 100, {
        'session.id': 'test-session-id',
        model: 'gemini-pro',
        type: 'input',
      });
    });

    it('should record token usage for different types', () => {
      initializeMetricsModule(mockConfig);
      mockCounterAddFn.mockClear();

      recordTokenUsageMetricsModule(mockConfig, 'gemini-pro', 50, 'output');
      expect(mockCounterAddFn).toHaveBeenCalledWith(50, {
        'session.id': 'test-session-id',
        model: 'gemini-pro',
        type: 'output',
      });

      recordTokenUsageMetricsModule(mockConfig, 'gemini-pro', 25, 'thought');
      expect(mockCounterAddFn).toHaveBeenCalledWith(25, {
        'session.id': 'test-session-id',
        model: 'gemini-pro',
        type: 'thought',
      });

      recordTokenUsageMetricsModule(mockConfig, 'gemini-pro', 75, 'cache');
      expect(mockCounterAddFn).toHaveBeenCalledWith(75, {
        'session.id': 'test-session-id',
        model: 'gemini-pro',
        type: 'cache',
      });

      recordTokenUsageMetricsModule(mockConfig, 'gemini-pro', 125, 'tool');
      expect(mockCounterAddFn).toHaveBeenCalledWith(125, {
        'session.id': 'test-session-id',
        model: 'gemini-pro',
        type: 'tool',
      });
    });

    it('should handle different models', () => {
      initializeMetricsModule(mockConfig);
      mockCounterAddFn.mockClear();

      recordTokenUsageMetricsModule(mockConfig, 'gemini-ultra', 200, 'input');
      expect(mockCounterAddFn).toHaveBeenCalledWith(200, {
        'session.id': 'test-session-id',
        model: 'gemini-ultra',
        type: 'input',
      });
    });
  });

  describe('recordFileOperationMetric', () => {
    const mockConfig = {
      getSessionId: () => 'test-session-id',
    } as unknown as Config;

    it('should not record metrics if not initialized', () => {
      recordFileOperationMetricModule(
        mockConfig,
        FileOperation.CREATE,
        10,
        'text/plain',
        'txt',
      );
      expect(mockCounterAddFn).not.toHaveBeenCalled();
    });

    it('should record file creation with all attributes', () => {
      initializeMetricsModule(mockConfig);
      recordFileOperationMetricModule(
        mockConfig,
        FileOperation.CREATE,
        10,
        'text/plain',
        'txt',
      );

      expect(mockCounterAddFn).toHaveBeenCalledTimes(2);
      expect(mockCounterAddFn).toHaveBeenNthCalledWith(1, 1, {
        'session.id': 'test-session-id',
      });
      expect(mockCounterAddFn).toHaveBeenNthCalledWith(2, 1, {
        'session.id': 'test-session-id',
        operation: FileOperation.CREATE,
        lines: 10,
        mimetype: 'text/plain',
        extension: 'txt',
      });
    });

    it('should record file read with minimal attributes', () => {
      initializeMetricsModule(mockConfig);
      mockCounterAddFn.mockClear();

      recordFileOperationMetricModule(mockConfig, FileOperation.READ);
      expect(mockCounterAddFn).toHaveBeenCalledWith(1, {
        'session.id': 'test-session-id',
        operation: FileOperation.READ,
      });
    });

    it('should record file update with some attributes', () => {
      initializeMetricsModule(mockConfig);
      mockCounterAddFn.mockClear();

      recordFileOperationMetricModule(
        mockConfig,
        FileOperation.UPDATE,
        undefined,
        'application/javascript',
      );
      expect(mockCounterAddFn).toHaveBeenCalledWith(1, {
        'session.id': 'test-session-id',
        operation: FileOperation.UPDATE,
        mimetype: 'application/javascript',
      });
    });

    it('should include diffStat when provided', () => {
      initializeMetricsModule(mockConfig);
      mockCounterAddFn.mockClear();

      const diffStat = {
        ai_added_lines: 5,
        ai_removed_lines: 2,
        user_added_lines: 3,
        user_removed_lines: 1,
      };

      recordFileOperationMetricModule(
        mockConfig,
        FileOperation.UPDATE,
        undefined,
        undefined,
        undefined,
        diffStat,
      );

      expect(mockCounterAddFn).toHaveBeenCalledWith(1, {
        'session.id': 'test-session-id',
        operation: FileOperation.UPDATE,
        ai_added_lines: 5,
        ai_removed_lines: 2,
        user_added_lines: 3,
        user_removed_lines: 1,
      });
    });

    it('should not include diffStat attributes when diffStat is not provided', () => {
      initializeMetricsModule(mockConfig);
      mockCounterAddFn.mockClear();

      recordFileOperationMetricModule(
        mockConfig,
        FileOperation.UPDATE,
        10,
        'text/plain',
        'txt',
        undefined,
      );

      expect(mockCounterAddFn).toHaveBeenCalledWith(1, {
        'session.id': 'test-session-id',
        operation: FileOperation.UPDATE,
        lines: 10,
        mimetype: 'text/plain',
        extension: 'txt',
      });
    });

    it('should handle diffStat with all zero values', () => {
      initializeMetricsModule(mockConfig);
      mockCounterAddFn.mockClear();

      const diffStat = {
        ai_added_lines: 0,
        ai_removed_lines: 0,
        user_added_lines: 0,
        user_removed_lines: 0,
      };

      recordFileOperationMetricModule(
        mockConfig,
        FileOperation.UPDATE,
        undefined,
        undefined,
        undefined,
        diffStat,
      );

      expect(mockCounterAddFn).toHaveBeenCalledWith(1, {
        'session.id': 'test-session-id',
        operation: FileOperation.UPDATE,
        ai_added_lines: 0,
        ai_removed_lines: 0,
        user_added_lines: 0,
        user_removed_lines: 0,
      });
    });
  });
});
