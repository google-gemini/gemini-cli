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
import {
  FileOperation,
  MemoryMetricType,
  ToolExecutionPhase,
  ApiRequestPhase,
} from './metrics.js';
import { makeFakeConfig } from '../test-utils/config.js';
import { ModelRoutingEvent } from './types.js';

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
      DOUBLE: 2,
    },
    diag: {
      setLogger: vi.fn(),
      warn: vi.fn(),
    },
    DiagConsoleLogger: vi.fn(),
    DiagLogLevel: {
      NONE: 0,
      INFO: 1,
    },
  } as const;
}

vi.mock('@opentelemetry/api');

describe('Telemetry Metrics', () => {
  let initializeMetricsModule: typeof import('./metrics.js').initializeMetrics;
  let recordTokenUsageMetricsModule: typeof import('./metrics.js').recordTokenUsageMetrics;
  let recordFileOperationMetricModule: typeof import('./metrics.js').recordFileOperationMetric;
  let recordChatCompressionMetricsModule: typeof import('./metrics.js').recordChatCompressionMetrics;
  let recordModelRoutingMetricsModule: typeof import('./metrics.js').recordModelRoutingMetrics;
  let recordStartupPerformanceModule: typeof import('./metrics.js').recordStartupPerformance;
  let recordMemoryUsageModule: typeof import('./metrics.js').recordMemoryUsage;
  let recordCpuUsageModule: typeof import('./metrics.js').recordCpuUsage;
  let recordToolQueueDepthModule: typeof import('./metrics.js').recordToolQueueDepth;
  let recordToolExecutionBreakdownModule: typeof import('./metrics.js').recordToolExecutionBreakdown;
  let recordTokenEfficiencyModule: typeof import('./metrics.js').recordTokenEfficiency;
  let recordApiRequestBreakdownModule: typeof import('./metrics.js').recordApiRequestBreakdown;
  let recordPerformanceScoreModule: typeof import('./metrics.js').recordPerformanceScore;
  let recordPerformanceRegressionModule: typeof import('./metrics.js').recordPerformanceRegression;
  let recordBaselineComparisonModule: typeof import('./metrics.js').recordBaselineComparison;
  let recordGenAiClientTokenUsageModule: typeof import('./metrics.js').recordGenAiClientTokenUsage;
  let recordGenAiClientOperationDurationModule: typeof import('./metrics.js').recordGenAiClientOperationDuration;

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
    recordModelRoutingMetricsModule = metricsJsModule.recordModelRoutingMetrics;
    recordStartupPerformanceModule = metricsJsModule.recordStartupPerformance;
    recordMemoryUsageModule = metricsJsModule.recordMemoryUsage;
    recordCpuUsageModule = metricsJsModule.recordCpuUsage;
    recordToolQueueDepthModule = metricsJsModule.recordToolQueueDepth;
    recordToolExecutionBreakdownModule =
      metricsJsModule.recordToolExecutionBreakdown;
    recordTokenEfficiencyModule = metricsJsModule.recordTokenEfficiency;
    recordApiRequestBreakdownModule = metricsJsModule.recordApiRequestBreakdown;
    recordPerformanceScoreModule = metricsJsModule.recordPerformanceScore;
    recordPerformanceRegressionModule =
      metricsJsModule.recordPerformanceRegression;
    recordBaselineComparisonModule = metricsJsModule.recordBaselineComparison;
    recordGenAiClientTokenUsageModule =
      metricsJsModule.recordGenAiClientTokenUsage;
    recordGenAiClientOperationDurationModule =
      metricsJsModule.recordGenAiClientOperationDuration;

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
      getTelemetryEnabled: () => true,
    } as unknown as Config;

    it('should not record metrics if not initialized', () => {
      recordTokenUsageMetricsModule(mockConfig, 100, {
        model: 'gemini-pro',
        type: 'input',
      });
      expect(mockCounterAddFn).not.toHaveBeenCalled();
    });

    it('should record token usage with the correct attributes', () => {
      initializeMetricsModule(mockConfig);
      recordTokenUsageMetricsModule(mockConfig, 100, {
        model: 'gemini-pro',
        type: 'input',
      });
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

      recordTokenUsageMetricsModule(mockConfig, 50, {
        model: 'gemini-pro',
        type: 'output',
      });
      expect(mockCounterAddFn).toHaveBeenCalledWith(50, {
        'session.id': 'test-session-id',
        model: 'gemini-pro',
        type: 'output',
      });

      recordTokenUsageMetricsModule(mockConfig, 25, {
        model: 'gemini-pro',
        type: 'thought',
      });
      expect(mockCounterAddFn).toHaveBeenCalledWith(25, {
        'session.id': 'test-session-id',
        model: 'gemini-pro',
        type: 'thought',
      });

      recordTokenUsageMetricsModule(mockConfig, 75, {
        model: 'gemini-pro',
        type: 'cache',
      });
      expect(mockCounterAddFn).toHaveBeenCalledWith(75, {
        'session.id': 'test-session-id',
        model: 'gemini-pro',
        type: 'cache',
      });

      recordTokenUsageMetricsModule(mockConfig, 125, {
        model: 'gemini-pro',
        type: 'tool',
      });
      expect(mockCounterAddFn).toHaveBeenCalledWith(125, {
        'session.id': 'test-session-id',
        model: 'gemini-pro',
        type: 'tool',
      });
    });

    it('should handle different models', () => {
      initializeMetricsModule(mockConfig);
      mockCounterAddFn.mockClear();

      recordTokenUsageMetricsModule(mockConfig, 200, {
        model: 'gemini-ultra',
        type: 'input',
      });
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
      getTelemetryEnabled: () => true,
    } as unknown as Config;

    it('should not record metrics if not initialized', () => {
      recordFileOperationMetricModule(mockConfig, {
        operation: FileOperation.CREATE,
        lines: 10,
        mimetype: 'text/plain',
        extension: 'txt',
      });
      expect(mockCounterAddFn).not.toHaveBeenCalled();
    });

    it('should record file creation with all attributes', () => {
      initializeMetricsModule(mockConfig);
      recordFileOperationMetricModule(mockConfig, {
        operation: FileOperation.CREATE,
        lines: 10,
        mimetype: 'text/plain',
        extension: 'txt',
      });

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

      recordFileOperationMetricModule(mockConfig, {
        operation: FileOperation.READ,
      });
      expect(mockCounterAddFn).toHaveBeenCalledWith(1, {
        'session.id': 'test-session-id',
        operation: FileOperation.READ,
      });
    });

    it('should record file update with some attributes', () => {
      initializeMetricsModule(mockConfig);
      mockCounterAddFn.mockClear();

      recordFileOperationMetricModule(mockConfig, {
        operation: FileOperation.UPDATE,
        mimetype: 'application/javascript',
      });
      expect(mockCounterAddFn).toHaveBeenCalledWith(1, {
        'session.id': 'test-session-id',
        operation: FileOperation.UPDATE,
        mimetype: 'application/javascript',
      });
    });

    it('should record file operation without diffStat', () => {
      initializeMetricsModule(mockConfig);
      mockCounterAddFn.mockClear();

      recordFileOperationMetricModule(mockConfig, {
        operation: FileOperation.UPDATE,
      });

      expect(mockCounterAddFn).toHaveBeenCalledWith(1, {
        'session.id': 'test-session-id',
        operation: FileOperation.UPDATE,
      });
    });

    it('should record minimal file operation when optional parameters are undefined', () => {
      initializeMetricsModule(mockConfig);
      mockCounterAddFn.mockClear();

      recordFileOperationMetricModule(mockConfig, {
        operation: FileOperation.UPDATE,
        lines: 10,
        mimetype: 'text/plain',
        extension: 'txt',
      });

      expect(mockCounterAddFn).toHaveBeenCalledWith(1, {
        'session.id': 'test-session-id',
        operation: FileOperation.UPDATE,
        lines: 10,
        mimetype: 'text/plain',
        extension: 'txt',
      });
    });

    it('should not include diffStat attributes when diffStat is not provided', () => {
      initializeMetricsModule(mockConfig);
      mockCounterAddFn.mockClear();

      recordFileOperationMetricModule(mockConfig, {
        operation: FileOperation.UPDATE,
      });

      expect(mockCounterAddFn).toHaveBeenCalledWith(1, {
        'session.id': 'test-session-id',
        operation: FileOperation.UPDATE,
      });
    });
  });

  describe('recordModelRoutingMetrics', () => {
    const mockConfig = {
      getSessionId: () => 'test-session-id',
      getTelemetryEnabled: () => true,
    } as unknown as Config;

    it('should not record metrics if not initialized', () => {
      const event = new ModelRoutingEvent(
        'gemini-pro',
        'default',
        100,
        'test-reason',
        false,
        undefined,
      );
      recordModelRoutingMetricsModule(mockConfig, event);
      expect(mockHistogramRecordFn).not.toHaveBeenCalled();
      expect(mockCounterAddFn).not.toHaveBeenCalled();
    });

    it('should record latency for a successful routing decision', () => {
      initializeMetricsModule(mockConfig);
      const event = new ModelRoutingEvent(
        'gemini-pro',
        'default',
        150,
        'test-reason',
        false,
        undefined,
      );
      recordModelRoutingMetricsModule(mockConfig, event);

      expect(mockHistogramRecordFn).toHaveBeenCalledWith(150, {
        'session.id': 'test-session-id',
        'routing.decision_model': 'gemini-pro',
        'routing.decision_source': 'default',
      });
      // The session counter is called once on init
      expect(mockCounterAddFn).toHaveBeenCalledTimes(1);
    });

    it('should record latency and failure for a failed routing decision', () => {
      initializeMetricsModule(mockConfig);
      const event = new ModelRoutingEvent(
        'gemini-pro',
        'classifier',
        200,
        'test-reason',
        true,
        'test-error',
      );
      recordModelRoutingMetricsModule(mockConfig, event);

      expect(mockHistogramRecordFn).toHaveBeenCalledWith(200, {
        'session.id': 'test-session-id',
        'routing.decision_model': 'gemini-pro',
        'routing.decision_source': 'classifier',
      });

      expect(mockCounterAddFn).toHaveBeenCalledTimes(2);
      expect(mockCounterAddFn).toHaveBeenNthCalledWith(2, 1, {
        'session.id': 'test-session-id',
        'routing.decision_source': 'classifier',
        'routing.error_message': 'test-error',
      });
    });
  });

  describe('OpenTelemetry GenAI Semantic Convention Metrics', () => {
    const mockConfig = {
      getSessionId: () => 'test-session-id',
      getTelemetryEnabled: () => true,
    } as unknown as Config;

    describe('recordGenAiClientTokenUsage', () => {
      it('should not record metrics when not initialized', () => {
        recordGenAiClientTokenUsageModule(mockConfig, 100, {
          'gen_ai.operation.name': 'generate_content',
          'gen_ai.provider.name': 'gcp.gen_ai',
          'gen_ai.token.type': 'input',
        });

        expect(mockHistogramRecordFn).not.toHaveBeenCalled();
      });

      it('should record input token usage with correct attributes', () => {
        initializeMetricsModule(mockConfig);
        mockHistogramRecordFn.mockClear();

        recordGenAiClientTokenUsageModule(mockConfig, 150, {
          'gen_ai.operation.name': 'generate_content',
          'gen_ai.provider.name': 'gcp.gen_ai',
          'gen_ai.token.type': 'input',
          'gen_ai.request.model': 'gemini-2.0-flash',
          'gen_ai.response.model': 'gemini-2.0-flash',
        });

        expect(mockHistogramRecordFn).toHaveBeenCalledWith(150, {
          'session.id': 'test-session-id',
          'gen_ai.operation.name': 'generate_content',
          'gen_ai.provider.name': 'gcp.gen_ai',
          'gen_ai.token.type': 'input',
          'gen_ai.request.model': 'gemini-2.0-flash',
          'gen_ai.response.model': 'gemini-2.0-flash',
        });
      });

      it('should record output token usage with correct attributes', () => {
        initializeMetricsModule(mockConfig);
        mockHistogramRecordFn.mockClear();

        recordGenAiClientTokenUsageModule(mockConfig, 75, {
          'gen_ai.operation.name': 'generate_content',
          'gen_ai.provider.name': 'gcp.vertex_ai',
          'gen_ai.token.type': 'output',
          'gen_ai.request.model': 'gemini-pro',
        });

        expect(mockHistogramRecordFn).toHaveBeenCalledWith(75, {
          'session.id': 'test-session-id',
          'gen_ai.operation.name': 'generate_content',
          'gen_ai.provider.name': 'gcp.vertex_ai',
          'gen_ai.token.type': 'output',
          'gen_ai.request.model': 'gemini-pro',
        });
      });

      it('should record token usage with optional attributes', () => {
        initializeMetricsModule(mockConfig);
        mockHistogramRecordFn.mockClear();

        recordGenAiClientTokenUsageModule(mockConfig, 200, {
          'gen_ai.operation.name': 'generate_content',
          'gen_ai.provider.name': 'gcp.vertex_ai',
          'gen_ai.token.type': 'input',
          'gen_ai.request.model': 'text-embedding-004',
          'server.address': 'aiplatform.googleapis.com',
          'server.port': 443,
        });

        expect(mockHistogramRecordFn).toHaveBeenCalledWith(200, {
          'session.id': 'test-session-id',
          'gen_ai.operation.name': 'generate_content',
          'gen_ai.provider.name': 'gcp.vertex_ai',
          'gen_ai.token.type': 'input',
          'gen_ai.request.model': 'text-embedding-004',
          'server.address': 'aiplatform.googleapis.com',
          'server.port': 443,
        });
      });
    });

    describe('recordGenAiClientOperationDuration', () => {
      it('should not record metrics when not initialized', () => {
        recordGenAiClientOperationDurationModule(mockConfig, 2.5, {
          'gen_ai.operation.name': 'generate_content',
          'gen_ai.provider.name': 'gcp.gen_ai',
        });

        expect(mockHistogramRecordFn).not.toHaveBeenCalled();
      });

      it('should record successful operation duration with correct attributes', () => {
        initializeMetricsModule(mockConfig);
        mockHistogramRecordFn.mockClear();

        recordGenAiClientOperationDurationModule(mockConfig, 1.25, {
          'gen_ai.operation.name': 'generate_content',
          'gen_ai.provider.name': 'gcp.gen_ai',
          'gen_ai.request.model': 'gemini-2.0-flash',
          'gen_ai.response.model': 'gemini-2.0-flash',
        });

        expect(mockHistogramRecordFn).toHaveBeenCalledWith(1.25, {
          'session.id': 'test-session-id',
          'gen_ai.operation.name': 'generate_content',
          'gen_ai.provider.name': 'gcp.gen_ai',
          'gen_ai.request.model': 'gemini-2.0-flash',
          'gen_ai.response.model': 'gemini-2.0-flash',
        });
      });

      it('should record failed operation duration with error type', () => {
        initializeMetricsModule(mockConfig);
        mockHistogramRecordFn.mockClear();

        recordGenAiClientOperationDurationModule(mockConfig, 3.75, {
          'gen_ai.operation.name': 'generate_content',
          'gen_ai.provider.name': 'gcp.vertex_ai',
          'gen_ai.request.model': 'gemini-pro',
          'error.type': 'quota_exceeded',
        });

        expect(mockHistogramRecordFn).toHaveBeenCalledWith(3.75, {
          'session.id': 'test-session-id',
          'gen_ai.operation.name': 'generate_content',
          'gen_ai.provider.name': 'gcp.vertex_ai',
          'gen_ai.request.model': 'gemini-pro',
          'error.type': 'quota_exceeded',
        });
      });

      it('should record operation duration with server details', () => {
        initializeMetricsModule(mockConfig);
        mockHistogramRecordFn.mockClear();

        recordGenAiClientOperationDurationModule(mockConfig, 0.95, {
          'gen_ai.operation.name': 'generate_content',
          'gen_ai.provider.name': 'gcp.vertex_ai',
          'gen_ai.request.model': 'gemini-1.5-pro',
          'gen_ai.response.model': 'gemini-1.5-pro-001',
          'server.address': 'us-central1-aiplatform.googleapis.com',
          'server.port': 443,
        });

        expect(mockHistogramRecordFn).toHaveBeenCalledWith(0.95, {
          'session.id': 'test-session-id',
          'gen_ai.operation.name': 'generate_content',
          'gen_ai.provider.name': 'gcp.vertex_ai',
          'gen_ai.request.model': 'gemini-1.5-pro',
          'gen_ai.response.model': 'gemini-1.5-pro-001',
          'server.address': 'us-central1-aiplatform.googleapis.com',
          'server.port': 443,
        });
      });

      it('should handle minimal required attributes', () => {
        initializeMetricsModule(mockConfig);
        mockHistogramRecordFn.mockClear();

        recordGenAiClientOperationDurationModule(mockConfig, 2.1, {
          'gen_ai.operation.name': 'generate_content',
          'gen_ai.provider.name': 'gcp.gen_ai',
        });

        expect(mockHistogramRecordFn).toHaveBeenCalledWith(2.1, {
          'session.id': 'test-session-id',
          'gen_ai.operation.name': 'generate_content',
          'gen_ai.provider.name': 'gcp.gen_ai',
        });
      });
    });
  });

  describe('Performance Monitoring Metrics', () => {
    const mockConfig = {
      getSessionId: () => 'test-session-id',
      getTelemetryEnabled: () => true,
    } as unknown as Config;

    describe('recordStartupPerformance', () => {
      it('should not record metrics when performance monitoring is disabled', async () => {
        // Re-import with performance monitoring disabled by mocking the config
        const mockConfigDisabled = {
          getSessionId: () => 'test-session-id',
          getTelemetryEnabled: () => false, // Disable telemetry to disable performance monitoring
        } as unknown as Config;

        initializeMetricsModule(mockConfigDisabled);
        mockHistogramRecordFn.mockClear();

        recordStartupPerformanceModule(mockConfigDisabled, 100, {
          phase: 'settings_loading',
          details: {
            auth_type: 'gemini',
          },
        });

        expect(mockHistogramRecordFn).not.toHaveBeenCalled();
      });

      it('should record startup performance with phase and details', () => {
        initializeMetricsModule(mockConfig);
        mockHistogramRecordFn.mockClear();

        recordStartupPerformanceModule(mockConfig, 150, {
          phase: 'settings_loading',
          details: {
            auth_type: 'gemini',
            telemetry_enabled: true,
            settings_sources: 2,
          },
        });

        expect(mockHistogramRecordFn).toHaveBeenCalledWith(150, {
          'session.id': 'test-session-id',
          phase: 'settings_loading',
          auth_type: 'gemini',
          telemetry_enabled: true,
          settings_sources: 2,
        });
      });

      it('should record startup performance without details', () => {
        initializeMetricsModule(mockConfig);
        mockHistogramRecordFn.mockClear();

        recordStartupPerformanceModule(mockConfig, 50, { phase: 'cleanup' });

        expect(mockHistogramRecordFn).toHaveBeenCalledWith(50, {
          'session.id': 'test-session-id',
          phase: 'cleanup',
        });
      });

      it('should handle floating-point duration values from performance.now()', () => {
        initializeMetricsModule(mockConfig);
        mockHistogramRecordFn.mockClear();

        // Test with realistic floating-point values that performance.now() would return
        const floatingPointDuration = 123.45678;
        recordStartupPerformanceModule(mockConfig, floatingPointDuration, {
          phase: 'total_startup',
          details: {
            is_tty: true,
            has_question: false,
          },
        });

        expect(mockHistogramRecordFn).toHaveBeenCalledWith(
          floatingPointDuration,
          {
            'session.id': 'test-session-id',
            phase: 'total_startup',
            is_tty: true,
            has_question: false,
          },
        );
      });
    });

    describe('recordMemoryUsage', () => {
      it('should record memory usage for different memory types', () => {
        initializeMetricsModule(mockConfig);
        mockHistogramRecordFn.mockClear();

        recordMemoryUsageModule(mockConfig, 15728640, {
          memory_type: MemoryMetricType.HEAP_USED,
          component: 'startup',
        });

        expect(mockHistogramRecordFn).toHaveBeenCalledWith(15728640, {
          'session.id': 'test-session-id',
          memory_type: 'heap_used',
          component: 'startup',
        });
      });

      it('should record memory usage for all memory metric types', () => {
        initializeMetricsModule(mockConfig);
        mockHistogramRecordFn.mockClear();

        recordMemoryUsageModule(mockConfig, 31457280, {
          memory_type: MemoryMetricType.HEAP_TOTAL,
          component: 'api_call',
        });
        recordMemoryUsageModule(mockConfig, 2097152, {
          memory_type: MemoryMetricType.EXTERNAL,
          component: 'tool_execution',
        });
        recordMemoryUsageModule(mockConfig, 41943040, {
          memory_type: MemoryMetricType.RSS,
          component: 'memory_monitor',
        });

        expect(mockHistogramRecordFn).toHaveBeenCalledTimes(3); // One for each call
        expect(mockHistogramRecordFn).toHaveBeenNthCalledWith(1, 31457280, {
          'session.id': 'test-session-id',
          memory_type: 'heap_total',
          component: 'api_call',
        });
        expect(mockHistogramRecordFn).toHaveBeenNthCalledWith(2, 2097152, {
          'session.id': 'test-session-id',
          memory_type: 'external',
          component: 'tool_execution',
        });
        expect(mockHistogramRecordFn).toHaveBeenNthCalledWith(3, 41943040, {
          'session.id': 'test-session-id',
          memory_type: 'rss',
          component: 'memory_monitor',
        });
      });

      it('should record memory usage without component', () => {
        initializeMetricsModule(mockConfig);
        mockHistogramRecordFn.mockClear();

        recordMemoryUsageModule(mockConfig, 15728640, {
          memory_type: MemoryMetricType.HEAP_USED,
        });

        expect(mockHistogramRecordFn).toHaveBeenCalledWith(15728640, {
          'session.id': 'test-session-id',
          memory_type: 'heap_used',
        });
      });
    });

    describe('recordCpuUsage', () => {
      it('should record CPU usage percentage', () => {
        initializeMetricsModule(mockConfig);
        mockHistogramRecordFn.mockClear();

        recordCpuUsageModule(mockConfig, 85.5, {
          component: 'tool_execution',
        });

        expect(mockHistogramRecordFn).toHaveBeenCalledWith(85.5, {
          'session.id': 'test-session-id',
          component: 'tool_execution',
        });
      });

      it('should record CPU usage without component', () => {
        initializeMetricsModule(mockConfig);
        mockHistogramRecordFn.mockClear();

        recordCpuUsageModule(mockConfig, 42.3, {});

        expect(mockHistogramRecordFn).toHaveBeenCalledWith(42.3, {
          'session.id': 'test-session-id',
        });
      });
    });

    describe('recordToolQueueDepth', () => {
      it('should record tool queue depth', () => {
        initializeMetricsModule(mockConfig);
        mockHistogramRecordFn.mockClear();

        recordToolQueueDepthModule(mockConfig, 3);

        expect(mockHistogramRecordFn).toHaveBeenCalledWith(3, {
          'session.id': 'test-session-id',
        });
      });

      it('should record zero queue depth', () => {
        initializeMetricsModule(mockConfig);
        mockHistogramRecordFn.mockClear();

        recordToolQueueDepthModule(mockConfig, 0);

        expect(mockHistogramRecordFn).toHaveBeenCalledWith(0, {
          'session.id': 'test-session-id',
        });
      });
    });

    describe('recordToolExecutionBreakdown', () => {
      it('should record tool execution breakdown for all phases', () => {
        initializeMetricsModule(mockConfig);
        mockHistogramRecordFn.mockClear();

        recordToolExecutionBreakdownModule(mockConfig, 25, {
          function_name: 'Read',
          phase: ToolExecutionPhase.VALIDATION,
        });

        expect(mockHistogramRecordFn).toHaveBeenCalledWith(25, {
          'session.id': 'test-session-id',
          function_name: 'Read',
          phase: 'validation',
        });
      });

      it('should record execution breakdown for different phases', () => {
        initializeMetricsModule(mockConfig);
        mockHistogramRecordFn.mockClear();

        recordToolExecutionBreakdownModule(mockConfig, 50, {
          function_name: 'Bash',
          phase: ToolExecutionPhase.PREPARATION,
        });
        recordToolExecutionBreakdownModule(mockConfig, 1500, {
          function_name: 'Bash',
          phase: ToolExecutionPhase.EXECUTION,
        });
        recordToolExecutionBreakdownModule(mockConfig, 75, {
          function_name: 'Bash',
          phase: ToolExecutionPhase.RESULT_PROCESSING,
        });

        expect(mockHistogramRecordFn).toHaveBeenCalledTimes(3); // One for each call
        expect(mockHistogramRecordFn).toHaveBeenNthCalledWith(1, 50, {
          'session.id': 'test-session-id',
          function_name: 'Bash',
          phase: 'preparation',
        });
        expect(mockHistogramRecordFn).toHaveBeenNthCalledWith(2, 1500, {
          'session.id': 'test-session-id',
          function_name: 'Bash',
          phase: 'execution',
        });
        expect(mockHistogramRecordFn).toHaveBeenNthCalledWith(3, 75, {
          'session.id': 'test-session-id',
          function_name: 'Bash',
          phase: 'result_processing',
        });
      });
    });

    describe('recordTokenEfficiency', () => {
      it('should record token efficiency metrics', () => {
        initializeMetricsModule(mockConfig);
        mockHistogramRecordFn.mockClear();

        recordTokenEfficiencyModule(mockConfig, 0.85, {
          model: 'gemini-pro',
          metric: 'cache_hit_rate',
          context: 'api_request',
        });

        expect(mockHistogramRecordFn).toHaveBeenCalledWith(0.85, {
          'session.id': 'test-session-id',
          model: 'gemini-pro',
          metric: 'cache_hit_rate',
          context: 'api_request',
        });
      });

      it('should record token efficiency without context', () => {
        initializeMetricsModule(mockConfig);
        mockHistogramRecordFn.mockClear();

        recordTokenEfficiencyModule(mockConfig, 125.5, {
          model: 'gemini-pro',
          metric: 'tokens_per_operation',
        });

        expect(mockHistogramRecordFn).toHaveBeenCalledWith(125.5, {
          'session.id': 'test-session-id',
          model: 'gemini-pro',
          metric: 'tokens_per_operation',
        });
      });
    });

    describe('recordApiRequestBreakdown', () => {
      it('should record API request breakdown for all phases', () => {
        initializeMetricsModule(mockConfig);
        mockHistogramRecordFn.mockClear();

        recordApiRequestBreakdownModule(mockConfig, 15, {
          model: 'gemini-pro',
          phase: ApiRequestPhase.REQUEST_PREPARATION,
        });

        expect(mockHistogramRecordFn).toHaveBeenCalledWith(15, {
          'session.id': 'test-session-id',
          model: 'gemini-pro',
          phase: 'request_preparation',
        });
      });

      it('should record API request breakdown for different phases', () => {
        initializeMetricsModule(mockConfig);
        mockHistogramRecordFn.mockClear();

        recordApiRequestBreakdownModule(mockConfig, 250, {
          model: 'gemini-pro',
          phase: ApiRequestPhase.NETWORK_LATENCY,
        });
        recordApiRequestBreakdownModule(mockConfig, 100, {
          model: 'gemini-pro',
          phase: ApiRequestPhase.RESPONSE_PROCESSING,
        });
        recordApiRequestBreakdownModule(mockConfig, 50, {
          model: 'gemini-pro',
          phase: ApiRequestPhase.TOKEN_PROCESSING,
        });

        expect(mockHistogramRecordFn).toHaveBeenCalledTimes(3); // One for each call
        expect(mockHistogramRecordFn).toHaveBeenNthCalledWith(1, 250, {
          'session.id': 'test-session-id',
          model: 'gemini-pro',
          phase: 'network_latency',
        });
        expect(mockHistogramRecordFn).toHaveBeenNthCalledWith(2, 100, {
          'session.id': 'test-session-id',
          model: 'gemini-pro',
          phase: 'response_processing',
        });
        expect(mockHistogramRecordFn).toHaveBeenNthCalledWith(3, 50, {
          'session.id': 'test-session-id',
          model: 'gemini-pro',
          phase: 'token_processing',
        });
      });
    });

    describe('recordPerformanceScore', () => {
      it('should record performance score with category and baseline', () => {
        initializeMetricsModule(mockConfig);
        mockHistogramRecordFn.mockClear();

        recordPerformanceScoreModule(mockConfig, 85.5, {
          category: 'memory_efficiency',
          baseline: 80.0,
        });

        expect(mockHistogramRecordFn).toHaveBeenCalledWith(85.5, {
          'session.id': 'test-session-id',
          category: 'memory_efficiency',
          baseline: 80.0,
        });
      });

      it('should record performance score without baseline', () => {
        initializeMetricsModule(mockConfig);
        mockHistogramRecordFn.mockClear();

        recordPerformanceScoreModule(mockConfig, 92.3, {
          category: 'overall_performance',
        });

        expect(mockHistogramRecordFn).toHaveBeenCalledWith(92.3, {
          'session.id': 'test-session-id',
          category: 'overall_performance',
        });
      });
    });

    describe('recordPerformanceRegression', () => {
      it('should record performance regression with baseline comparison', () => {
        initializeMetricsModule(mockConfig);
        mockCounterAddFn.mockClear();
        mockHistogramRecordFn.mockClear();

        recordPerformanceRegressionModule(mockConfig, {
          metric: 'startup_time',
          current_value: 1200,
          baseline_value: 1000,
          severity: 'medium',
        });

        // Verify regression counter
        expect(mockCounterAddFn).toHaveBeenCalledWith(1, {
          'session.id': 'test-session-id',
          metric: 'startup_time',
          severity: 'medium',
          current_value: 1200,
          baseline_value: 1000,
        });

        // Verify baseline comparison histogram (20% increase)
        expect(mockHistogramRecordFn).toHaveBeenCalledWith(20, {
          'session.id': 'test-session-id',
          metric: 'startup_time',
          severity: 'medium',
          current_value: 1200,
          baseline_value: 1000,
        });
      });

      it('should handle zero baseline value gracefully', () => {
        initializeMetricsModule(mockConfig);
        mockCounterAddFn.mockClear();
        mockHistogramRecordFn.mockClear();

        recordPerformanceRegressionModule(mockConfig, {
          metric: 'memory_usage',
          current_value: 100,
          baseline_value: 0,
          severity: 'high',
        });

        // Verify regression counter still recorded
        expect(mockCounterAddFn).toHaveBeenCalledWith(1, {
          'session.id': 'test-session-id',
          metric: 'memory_usage',
          severity: 'high',
          current_value: 100,
          baseline_value: 0,
        });

        // Verify no baseline comparison due to zero baseline
        expect(mockHistogramRecordFn).not.toHaveBeenCalled();
      });

      it('should record different severity levels', () => {
        initializeMetricsModule(mockConfig);
        mockCounterAddFn.mockClear();

        recordPerformanceRegressionModule(mockConfig, {
          metric: 'api_latency',
          current_value: 500,
          baseline_value: 400,
          severity: 'low',
        });
        recordPerformanceRegressionModule(mockConfig, {
          metric: 'cpu_usage',
          current_value: 90,
          baseline_value: 70,
          severity: 'high',
        });

        expect(mockCounterAddFn).toHaveBeenNthCalledWith(1, 1, {
          'session.id': 'test-session-id',
          metric: 'api_latency',
          severity: 'low',
          current_value: 500,
          baseline_value: 400,
        });
        expect(mockCounterAddFn).toHaveBeenNthCalledWith(2, 1, {
          'session.id': 'test-session-id',
          metric: 'cpu_usage',
          severity: 'high',
          current_value: 90,
          baseline_value: 70,
        });
      });
    });

    describe('recordBaselineComparison', () => {
      it('should record baseline comparison with percentage change', () => {
        initializeMetricsModule(mockConfig);
        mockHistogramRecordFn.mockClear();

        recordBaselineComparisonModule(mockConfig, {
          metric: 'memory_usage',
          current_value: 120,
          baseline_value: 100,
          category: 'performance_tracking',
        });

        // 20% increase: (120 - 100) / 100 * 100 = 20%
        expect(mockHistogramRecordFn).toHaveBeenCalledWith(20, {
          'session.id': 'test-session-id',
          metric: 'memory_usage',
          category: 'performance_tracking',
          current_value: 120,
          baseline_value: 100,
        });
      });

      it('should handle negative percentage change (improvement)', () => {
        initializeMetricsModule(mockConfig);
        mockHistogramRecordFn.mockClear();

        recordBaselineComparisonModule(mockConfig, {
          metric: 'startup_time',
          current_value: 800,
          baseline_value: 1000,
          category: 'optimization',
        });

        // 20% decrease: (800 - 1000) / 1000 * 100 = -20%
        expect(mockHistogramRecordFn).toHaveBeenCalledWith(-20, {
          'session.id': 'test-session-id',
          metric: 'startup_time',
          category: 'optimization',
          current_value: 800,
          baseline_value: 1000,
        });
      });

      it('should skip recording when baseline is zero', async () => {
        // Access the actual mocked module
        const mockedModule = (await vi.importMock('@opentelemetry/api')) as {
          diag: { warn: ReturnType<typeof vi.fn> };
        };
        const diagSpy = vi.spyOn(mockedModule.diag, 'warn');

        initializeMetricsModule(mockConfig);
        mockHistogramRecordFn.mockClear();

        recordBaselineComparisonModule(mockConfig, {
          metric: 'new_metric',
          current_value: 50,
          baseline_value: 0,
          category: 'testing',
        });

        expect(diagSpy).toHaveBeenCalledWith(
          'Baseline value is zero, skipping comparison.',
        );
        expect(mockHistogramRecordFn).not.toHaveBeenCalled();
      });
    });
  });
});
