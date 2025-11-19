/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import * as telemetryIndex from './index.js';

describe('telemetry index', () => {
  describe('TelemetryTarget enum', () => {
    it('should export TelemetryTarget', () => {
      expect(telemetryIndex.TelemetryTarget).toBeDefined();
    });

    it('should have GCP target', () => {
      expect(telemetryIndex.TelemetryTarget.GCP).toBe('gcp');
    });

    it('should have LOCAL target', () => {
      expect(telemetryIndex.TelemetryTarget.LOCAL).toBe('local');
    });

    it('should have exactly 2 targets', () => {
      const keys = Object.keys(telemetryIndex.TelemetryTarget);
      expect(keys).toHaveLength(2);
    });
  });

  describe('constants', () => {
    it('should export DEFAULT_TELEMETRY_TARGET', () => {
      expect(telemetryIndex.DEFAULT_TELEMETRY_TARGET).toBeDefined();
    });

    it('should have LOCAL as default target', () => {
      expect(telemetryIndex.DEFAULT_TELEMETRY_TARGET).toBe(
        telemetryIndex.TelemetryTarget.LOCAL,
      );
    });

    it('should export DEFAULT_OTLP_ENDPOINT', () => {
      expect(telemetryIndex.DEFAULT_OTLP_ENDPOINT).toBeDefined();
    });

    it('should have localhost endpoint', () => {
      expect(telemetryIndex.DEFAULT_OTLP_ENDPOINT).toBe(
        'http://localhost:4317',
      );
    });

    it('should use port 4317', () => {
      expect(telemetryIndex.DEFAULT_OTLP_ENDPOINT).toContain('4317');
    });

    it('should use http protocol', () => {
      expect(telemetryIndex.DEFAULT_OTLP_ENDPOINT).toMatch(/^http:/);
    });
  });

  describe('SDK functions', () => {
    it('should export initializeTelemetry', () => {
      expect(telemetryIndex.initializeTelemetry).toBeDefined();
      expect(typeof telemetryIndex.initializeTelemetry).toBe('function');
    });

    it('should export shutdownTelemetry', () => {
      expect(telemetryIndex.shutdownTelemetry).toBeDefined();
      expect(typeof telemetryIndex.shutdownTelemetry).toBe('function');
    });

    it('should export isTelemetrySdkInitialized', () => {
      expect(telemetryIndex.isTelemetrySdkInitialized).toBeDefined();
      expect(typeof telemetryIndex.isTelemetrySdkInitialized).toBe('function');
    });
  });

  describe('config functions', () => {
    it('should export resolveTelemetrySettings', () => {
      expect(telemetryIndex.resolveTelemetrySettings).toBeDefined();
      expect(typeof telemetryIndex.resolveTelemetrySettings).toBe('function');
    });

    it('should export parseBooleanEnvFlag', () => {
      expect(telemetryIndex.parseBooleanEnvFlag).toBeDefined();
      expect(typeof telemetryIndex.parseBooleanEnvFlag).toBe('function');
    });

    it('should export parseTelemetryTargetValue', () => {
      expect(telemetryIndex.parseTelemetryTargetValue).toBeDefined();
      expect(typeof telemetryIndex.parseTelemetryTargetValue).toBe('function');
    });
  });

  describe('GCP exporters', () => {
    it('should export GcpTraceExporter', () => {
      expect(telemetryIndex.GcpTraceExporter).toBeDefined();
    });

    it('should export GcpMetricExporter', () => {
      expect(telemetryIndex.GcpMetricExporter).toBeDefined();
    });

    it('should export GcpLogExporter', () => {
      expect(telemetryIndex.GcpLogExporter).toBeDefined();
    });
  });

  describe('logger functions', () => {
    it('should export logCliConfiguration', () => {
      expect(telemetryIndex.logCliConfiguration).toBeDefined();
      expect(typeof telemetryIndex.logCliConfiguration).toBe('function');
    });

    it('should export logUserPrompt', () => {
      expect(telemetryIndex.logUserPrompt).toBeDefined();
      expect(typeof telemetryIndex.logUserPrompt).toBe('function');
    });

    it('should export logToolCall', () => {
      expect(telemetryIndex.logToolCall).toBeDefined();
      expect(typeof telemetryIndex.logToolCall).toBe('function');
    });

    it('should export logApiRequest', () => {
      expect(telemetryIndex.logApiRequest).toBeDefined();
      expect(typeof telemetryIndex.logApiRequest).toBe('function');
    });

    it('should export logApiError', () => {
      expect(telemetryIndex.logApiError).toBeDefined();
      expect(typeof telemetryIndex.logApiError).toBe('function');
    });

    it('should export logApiResponse', () => {
      expect(telemetryIndex.logApiResponse).toBeDefined();
      expect(typeof telemetryIndex.logApiResponse).toBe('function');
    });

    it('should export logFlashFallback', () => {
      expect(telemetryIndex.logFlashFallback).toBeDefined();
      expect(typeof telemetryIndex.logFlashFallback).toBe('function');
    });

    it('should export logSlashCommand', () => {
      expect(telemetryIndex.logSlashCommand).toBeDefined();
      expect(typeof telemetryIndex.logSlashCommand).toBe('function');
    });

    it('should export logConversationFinishedEvent', () => {
      expect(telemetryIndex.logConversationFinishedEvent).toBeDefined();
      expect(typeof telemetryIndex.logConversationFinishedEvent).toBe(
        'function',
      );
    });

    it('should export logKittySequenceOverflow', () => {
      expect(telemetryIndex.logKittySequenceOverflow).toBeDefined();
      expect(typeof telemetryIndex.logKittySequenceOverflow).toBe('function');
    });

    it('should export logChatCompression', () => {
      expect(telemetryIndex.logChatCompression).toBeDefined();
      expect(typeof telemetryIndex.logChatCompression).toBe('function');
    });

    it('should export logToolOutputTruncated', () => {
      expect(telemetryIndex.logToolOutputTruncated).toBeDefined();
      expect(typeof telemetryIndex.logToolOutputTruncated).toBe('function');
    });

    it('should export logExtensionEnable', () => {
      expect(telemetryIndex.logExtensionEnable).toBeDefined();
      expect(typeof telemetryIndex.logExtensionEnable).toBe('function');
    });

    it('should export logExtensionInstallEvent', () => {
      expect(telemetryIndex.logExtensionInstallEvent).toBeDefined();
      expect(typeof telemetryIndex.logExtensionInstallEvent).toBe('function');
    });

    it('should export logExtensionUninstall', () => {
      expect(telemetryIndex.logExtensionUninstall).toBeDefined();
      expect(typeof telemetryIndex.logExtensionUninstall).toBe('function');
    });
  });

  describe('event classes', () => {
    it('should export SlashCommandStatus', () => {
      expect(telemetryIndex.SlashCommandStatus).toBeDefined();
    });

    it('should export EndSessionEvent', () => {
      expect(telemetryIndex.EndSessionEvent).toBeDefined();
    });

    it('should export UserPromptEvent', () => {
      expect(telemetryIndex.UserPromptEvent).toBeDefined();
    });

    it('should export ApiRequestEvent', () => {
      expect(telemetryIndex.ApiRequestEvent).toBeDefined();
    });

    it('should export ApiErrorEvent', () => {
      expect(telemetryIndex.ApiErrorEvent).toBeDefined();
    });

    it('should export ApiResponseEvent', () => {
      expect(telemetryIndex.ApiResponseEvent).toBeDefined();
    });

    it('should export FlashFallbackEvent', () => {
      expect(telemetryIndex.FlashFallbackEvent).toBeDefined();
    });

    it('should export StartSessionEvent', () => {
      expect(telemetryIndex.StartSessionEvent).toBeDefined();
    });

    it('should export ToolCallEvent', () => {
      expect(telemetryIndex.ToolCallEvent).toBeDefined();
    });

    it('should export ConversationFinishedEvent', () => {
      expect(telemetryIndex.ConversationFinishedEvent).toBeDefined();
    });

    it('should export KittySequenceOverflowEvent', () => {
      expect(telemetryIndex.KittySequenceOverflowEvent).toBeDefined();
    });

    it('should export ToolOutputTruncatedEvent', () => {
      expect(telemetryIndex.ToolOutputTruncatedEvent).toBeDefined();
    });
  });

  describe('event factory functions', () => {
    it('should export makeSlashCommandEvent', () => {
      expect(telemetryIndex.makeSlashCommandEvent).toBeDefined();
      expect(typeof telemetryIndex.makeSlashCommandEvent).toBe('function');
    });

    it('should export makeChatCompressionEvent', () => {
      expect(telemetryIndex.makeChatCompressionEvent).toBeDefined();
      expect(typeof telemetryIndex.makeChatCompressionEvent).toBe('function');
    });
  });

  describe('OpenTelemetry exports', () => {
    it('should export SpanStatusCode', () => {
      expect(telemetryIndex.SpanStatusCode).toBeDefined();
    });

    it('should have SpanStatusCode.OK', () => {
      expect(telemetryIndex.SpanStatusCode.OK).toBeDefined();
    });

    it('should have SpanStatusCode.ERROR', () => {
      expect(telemetryIndex.SpanStatusCode.ERROR).toBeDefined();
    });

    it('should export ValueType', () => {
      expect(telemetryIndex.ValueType).toBeDefined();
    });

    it('should export SemanticAttributes', () => {
      expect(telemetryIndex.SemanticAttributes).toBeDefined();
    });
  });

  describe('high water mark tracker', () => {
    it('should export HighWaterMarkTracker', () => {
      expect(telemetryIndex.HighWaterMarkTracker).toBeDefined();
    });
  });

  describe('rate limiter', () => {
    it('should export RateLimiter', () => {
      expect(telemetryIndex.RateLimiter).toBeDefined();
    });
  });

  describe('activity tracking', () => {
    it('should export ActivityType', () => {
      expect(telemetryIndex.ActivityType).toBeDefined();
    });

    it('should export ActivityDetector', () => {
      expect(telemetryIndex.ActivityDetector).toBeDefined();
    });

    it('should export getActivityDetector', () => {
      expect(telemetryIndex.getActivityDetector).toBeDefined();
      expect(typeof telemetryIndex.getActivityDetector).toBe('function');
    });

    it('should export recordUserActivity', () => {
      expect(telemetryIndex.recordUserActivity).toBeDefined();
      expect(typeof telemetryIndex.recordUserActivity).toBe('function');
    });

    it('should export isUserActive', () => {
      expect(telemetryIndex.isUserActive).toBeDefined();
      expect(typeof telemetryIndex.isUserActive).toBe('function');
    });
  });

  describe('metrics functions', () => {
    it('should export recordToolCallMetrics', () => {
      expect(telemetryIndex.recordToolCallMetrics).toBeDefined();
      expect(typeof telemetryIndex.recordToolCallMetrics).toBe('function');
    });

    it('should export recordTokenUsageMetrics', () => {
      expect(telemetryIndex.recordTokenUsageMetrics).toBeDefined();
      expect(typeof telemetryIndex.recordTokenUsageMetrics).toBe('function');
    });

    it('should export recordApiResponseMetrics', () => {
      expect(telemetryIndex.recordApiResponseMetrics).toBeDefined();
      expect(typeof telemetryIndex.recordApiResponseMetrics).toBe('function');
    });

    it('should export recordApiErrorMetrics', () => {
      expect(telemetryIndex.recordApiErrorMetrics).toBeDefined();
      expect(typeof telemetryIndex.recordApiErrorMetrics).toBe('function');
    });

    it('should export recordFileOperationMetric', () => {
      expect(telemetryIndex.recordFileOperationMetric).toBeDefined();
      expect(typeof telemetryIndex.recordFileOperationMetric).toBe('function');
    });

    it('should export recordInvalidChunk', () => {
      expect(telemetryIndex.recordInvalidChunk).toBeDefined();
      expect(typeof telemetryIndex.recordInvalidChunk).toBe('function');
    });

    it('should export recordContentRetry', () => {
      expect(telemetryIndex.recordContentRetry).toBeDefined();
      expect(typeof telemetryIndex.recordContentRetry).toBe('function');
    });

    it('should export recordContentRetryFailure', () => {
      expect(telemetryIndex.recordContentRetryFailure).toBeDefined();
      expect(typeof telemetryIndex.recordContentRetryFailure).toBe('function');
    });

    it('should export recordModelRoutingMetrics', () => {
      expect(telemetryIndex.recordModelRoutingMetrics).toBeDefined();
      expect(typeof telemetryIndex.recordModelRoutingMetrics).toBe('function');
    });
  });

  describe('performance monitoring functions', () => {
    it('should export recordStartupPerformance', () => {
      expect(telemetryIndex.recordStartupPerformance).toBeDefined();
      expect(typeof telemetryIndex.recordStartupPerformance).toBe('function');
    });

    it('should export recordMemoryUsage', () => {
      expect(telemetryIndex.recordMemoryUsage).toBeDefined();
      expect(typeof telemetryIndex.recordMemoryUsage).toBe('function');
    });

    it('should export recordCpuUsage', () => {
      expect(telemetryIndex.recordCpuUsage).toBeDefined();
      expect(typeof telemetryIndex.recordCpuUsage).toBe('function');
    });

    it('should export recordToolQueueDepth', () => {
      expect(telemetryIndex.recordToolQueueDepth).toBeDefined();
      expect(typeof telemetryIndex.recordToolQueueDepth).toBe('function');
    });

    it('should export recordToolExecutionBreakdown', () => {
      expect(telemetryIndex.recordToolExecutionBreakdown).toBeDefined();
      expect(typeof telemetryIndex.recordToolExecutionBreakdown).toBe(
        'function',
      );
    });

    it('should export recordTokenEfficiency', () => {
      expect(telemetryIndex.recordTokenEfficiency).toBeDefined();
      expect(typeof telemetryIndex.recordTokenEfficiency).toBe('function');
    });

    it('should export recordApiRequestBreakdown', () => {
      expect(telemetryIndex.recordApiRequestBreakdown).toBeDefined();
      expect(typeof telemetryIndex.recordApiRequestBreakdown).toBe('function');
    });

    it('should export recordPerformanceScore', () => {
      expect(telemetryIndex.recordPerformanceScore).toBeDefined();
      expect(typeof telemetryIndex.recordPerformanceScore).toBe('function');
    });

    it('should export recordPerformanceRegression', () => {
      expect(telemetryIndex.recordPerformanceRegression).toBeDefined();
      expect(typeof telemetryIndex.recordPerformanceRegression).toBe(
        'function',
      );
    });

    it('should export recordBaselineComparison', () => {
      expect(telemetryIndex.recordBaselineComparison).toBeDefined();
      expect(typeof telemetryIndex.recordBaselineComparison).toBe('function');
    });

    it('should export isPerformanceMonitoringActive', () => {
      expect(telemetryIndex.isPerformanceMonitoringActive).toBeDefined();
      expect(typeof telemetryIndex.isPerformanceMonitoringActive).toBe(
        'function',
      );
    });
  });

  describe('performance monitoring types', () => {
    it('should export PerformanceMetricType', () => {
      expect(telemetryIndex.PerformanceMetricType).toBeDefined();
    });

    it('should export MemoryMetricType', () => {
      expect(telemetryIndex.MemoryMetricType).toBeDefined();
    });

    it('should export ToolExecutionPhase', () => {
      expect(telemetryIndex.ToolExecutionPhase).toBeDefined();
    });

    it('should export ApiRequestPhase', () => {
      expect(telemetryIndex.ApiRequestPhase).toBeDefined();
    });

    it('should export FileOperation', () => {
      expect(telemetryIndex.FileOperation).toBeDefined();
    });
  });

  describe('complete export coverage', () => {
    it('should have all expected exports', () => {
      const expectedExports = [
        'TelemetryTarget',
        'DEFAULT_TELEMETRY_TARGET',
        'DEFAULT_OTLP_ENDPOINT',
        'initializeTelemetry',
        'shutdownTelemetry',
        'isTelemetrySdkInitialized',
        'resolveTelemetrySettings',
        'parseBooleanEnvFlag',
        'parseTelemetryTargetValue',
        'GcpTraceExporter',
        'GcpMetricExporter',
        'GcpLogExporter',
        'logCliConfiguration',
        'logUserPrompt',
        'logToolCall',
        'logApiRequest',
        'logApiError',
        'logApiResponse',
        'logFlashFallback',
        'logSlashCommand',
        'logConversationFinishedEvent',
        'logKittySequenceOverflow',
        'logChatCompression',
        'logToolOutputTruncated',
        'logExtensionEnable',
        'logExtensionInstallEvent',
        'logExtensionUninstall',
        'SlashCommandStatus',
        'EndSessionEvent',
        'UserPromptEvent',
        'ApiRequestEvent',
        'ApiErrorEvent',
        'ApiResponseEvent',
        'FlashFallbackEvent',
        'StartSessionEvent',
        'ToolCallEvent',
        'ConversationFinishedEvent',
        'KittySequenceOverflowEvent',
        'ToolOutputTruncatedEvent',
        'makeSlashCommandEvent',
        'makeChatCompressionEvent',
        'SpanStatusCode',
        'ValueType',
        'SemanticAttributes',
        'HighWaterMarkTracker',
        'RateLimiter',
        'ActivityType',
        'ActivityDetector',
        'getActivityDetector',
        'recordUserActivity',
        'isUserActive',
        'recordToolCallMetrics',
        'recordTokenUsageMetrics',
        'recordApiResponseMetrics',
        'recordApiErrorMetrics',
        'recordFileOperationMetric',
        'recordInvalidChunk',
        'recordContentRetry',
        'recordContentRetryFailure',
        'recordModelRoutingMetrics',
        'recordStartupPerformance',
        'recordMemoryUsage',
        'recordCpuUsage',
        'recordToolQueueDepth',
        'recordToolExecutionBreakdown',
        'recordTokenEfficiency',
        'recordApiRequestBreakdown',
        'recordPerformanceScore',
        'recordPerformanceRegression',
        'recordBaselineComparison',
        'isPerformanceMonitoringActive',
        'PerformanceMetricType',
        'MemoryMetricType',
        'ToolExecutionPhase',
        'ApiRequestPhase',
        'FileOperation',
      ];

      for (const exportName of expectedExports) {
        expect(telemetryIndex).toHaveProperty(exportName);
      }
    });
  });
});
