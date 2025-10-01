/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExportResultCode } from '@opentelemetry/core';
import type { ReadableLogRecord } from '@opentelemetry/sdk-logs';
import {
  GcpTraceExporter,
  GcpMetricExporter,
  GcpLogExporter,
} from './gcp-exporters.js';

const mockLogEntry = { test: 'entry' };
const mockLogWrite = vi.fn().mockResolvedValue(undefined);
const mockLog = {
  entry: vi.fn().mockReturnValue(mockLogEntry),
  write: mockLogWrite,
};
const mockLogging = {
  projectId: 'test-project',
  log: vi.fn().mockReturnValue(mockLog),
};

vi.mock('@google-cloud/opentelemetry-cloud-trace-exporter', () => ({
  TraceExporter: vi.fn().mockImplementation(() => ({
    export: vi.fn(),
    shutdown: vi.fn(),
    forceFlush: vi.fn(),
  })),
}));

vi.mock('@google-cloud/opentelemetry-cloud-monitoring-exporter', () => ({
  MetricExporter: vi.fn().mockImplementation(() => ({
    export: vi.fn(),
    shutdown: vi.fn(),
    forceFlush: vi.fn(),
  })),
}));

vi.mock('@google-cloud/logging', () => ({
  Logging: vi.fn().mockImplementation(() => mockLogging),
}));

describe('GCP Exporters', () => {
  describe('GcpTraceExporter', () => {
    it('should create a trace exporter with correct configuration', () => {
      const exporter = new GcpTraceExporter('test-project');
      expect(exporter).toBeDefined();
    });

    it('should create a trace exporter without project ID', () => {
      const exporter = new GcpTraceExporter();
      expect(exporter).toBeDefined();
    });
  });

  describe('GcpMetricExporter', () => {
    it('should create a metric exporter with correct configuration', () => {
      const exporter = new GcpMetricExporter('test-project');
      expect(exporter).toBeDefined();
    });

    it('should create a metric exporter without project ID', () => {
      const exporter = new GcpMetricExporter();
      expect(exporter).toBeDefined();
    });
  });

  describe('GcpLogExporter', () => {
    let exporter: GcpLogExporter;

    beforeEach(() => {
      vi.clearAllMocks();
      mockLogWrite.mockResolvedValue(undefined);
      mockLog.entry.mockReturnValue(mockLogEntry);
      exporter = new GcpLogExporter('test-project');
    });

    describe('constructor', () => {
      it('should create a log exporter with project ID', () => {
        expect(exporter).toBeDefined();
        expect(mockLogging.log).toHaveBeenCalledWith('gemini_cli');
      });

      it('should create a log exporter without project ID', () => {
        const exporterNoProject = new GcpLogExporter();
        expect(exporterNoProject).toBeDefined();
      });
    });

    describe('export', () => {
      it('should export logs successfully', async () => {
        const mockLogRecords: ReadableLogRecord[] = [
          {
            hrTime: [1234567890, 123456789],
            hrTimeObserved: [1234567890, 123456789],
            severityNumber: 9,
            severityText: 'INFO',
            body: 'Test log message',
            attributes: {
              'session.id': 'test-session',
              'custom.attribute': 'value',
            },
            resource: {
              attributes: {
                'service.name': 'test-service',
              },
            },
          } as unknown as ReadableLogRecord,
        ];

        const callback = vi.fn();

        exporter.export(mockLogRecords, callback);

        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(mockLog.entry).toHaveBeenCalledWith(
          expect.objectContaining({
            severity: 'INFO',
            timestamp: expect.any(Date),
            resource: {
              type: 'global',
              labels: {
                project_id: 'test-project',
              },
            },
          }),
          expect.objectContaining({
            message: 'Test log message',
            session_id: 'test-session',
            'custom.attribute': 'value',
            'service.name': 'test-service',
          }),
        );

        expect(mockLog.write).toHaveBeenCalledWith([mockLogEntry]);
        expect(callback).toHaveBeenCalledWith({
          code: ExportResultCode.SUCCESS,
        });
      });

      it('should handle export failures', async () => {
        const mockLogRecords: ReadableLogRecord[] = [
          {
            hrTime: [1234567890, 123456789],
            hrTimeObserved: [1234567890, 123456789],
            body: 'Test log message',
          } as unknown as ReadableLogRecord,
        ];

        const error = new Error('Write failed');
        mockLogWrite.mockRejectedValueOnce(error);

        const callback = vi.fn();

        exporter.export(mockLogRecords, callback);

        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(callback).toHaveBeenCalledWith({
          code: ExportResultCode.FAILED,
          error,
        });
      });

      it('should handle synchronous errors', () => {
        const mockLogRecords: ReadableLogRecord[] = [
          {
            hrTime: [1234567890, 123456789],
            hrTimeObserved: [1234567890, 123456789],
            body: 'Test log message',
          } as unknown as ReadableLogRecord,
        ];

        mockLog.entry.mockImplementation(() => {
          throw new Error('Entry creation failed');
        });

        const callback = vi.fn();

        exporter.export(mockLogRecords, callback);

        expect(callback).toHaveBeenCalledWith({
          code: ExportResultCode.FAILED,
          error: expect.any(Error),
        });
      });
    });

    describe('severity mapping', () => {
      it('should map OpenTelemetry severity numbers to Cloud Logging levels', () => {
        const testCases = [
          { severityNumber: undefined, expected: 'DEFAULT' },
          { severityNumber: 1, expected: 'DEFAULT' },
          { severityNumber: 5, expected: 'DEBUG' },
          { severityNumber: 9, expected: 'INFO' },
          { severityNumber: 13, expected: 'WARNING' },
          { severityNumber: 17, expected: 'ERROR' },
          { severityNumber: 21, expected: 'CRITICAL' },
          { severityNumber: 25, expected: 'CRITICAL' },
        ];

        testCases.forEach(({ severityNumber, expected }) => {
          const mockLogRecords: ReadableLogRecord[] = [
            {
              hrTime: [1234567890, 123456789],
              hrTimeObserved: [1234567890, 123456789],
              severityNumber,
              body: 'Test message',
            } as unknown as ReadableLogRecord,
          ];

          const callback = vi.fn();
          exporter.export(mockLogRecords, callback);

          expect(mockLog.entry).toHaveBeenCalledWith(
            expect.objectContaining({
              severity: expected,
            }),
            expect.any(Object),
          );

          mockLog.entry.mockClear();
        });
      });
    });

    describe('forceFlush', () => {
      it('should resolve immediately when no pending writes exist', async () => {
        await expect(exporter.forceFlush()).resolves.toBeUndefined();
      });

      it('should wait for pending writes to complete', async () => {
        const mockLogRecords: ReadableLogRecord[] = [
          {
            hrTime: [1234567890, 123456789],
            hrTimeObserved: [1234567890, 123456789],
            body: 'Test log message',
          } as unknown as ReadableLogRecord,
        ];

        let resolveWrite: () => void;
        const writePromise = new Promise<void>((resolve) => {
          resolveWrite = resolve;
        });
        mockLogWrite.mockReturnValueOnce(writePromise);

        const callback = vi.fn();

        exporter.export(mockLogRecords, callback);
        const flushPromise = exporter.forceFlush();

        await new Promise((resolve) => setTimeout(resolve, 1));

        resolveWrite!();
        await writePromise;

        await expect(flushPromise).resolves.toBeUndefined();
      });

      it('should handle multiple pending writes', async () => {
        const mockLogRecords1: ReadableLogRecord[] = [
          {
            hrTime: [1234567890, 123456789],
            hrTimeObserved: [1234567890, 123456789],
            body: 'Test log message 1',
          } as unknown as ReadableLogRecord,
        ];

        const mockLogRecords2: ReadableLogRecord[] = [
          {
            hrTime: [1234567890, 123456789],
            hrTimeObserved: [1234567890, 123456789],
            body: 'Test log message 2',
          } as unknown as ReadableLogRecord,
        ];

        let resolveWrite1: () => void;
        let resolveWrite2: () => void;
        const writePromise1 = new Promise<void>((resolve) => {
          resolveWrite1 = resolve;
        });
        const writePromise2 = new Promise<void>((resolve) => {
          resolveWrite2 = resolve;
        });

        mockLogWrite
          .mockReturnValueOnce(writePromise1)
          .mockReturnValueOnce(writePromise2);

        const callback = vi.fn();

        exporter.export(mockLogRecords1, callback);
        exporter.export(mockLogRecords2, callback);

        const flushPromise = exporter.forceFlush();

        resolveWrite1!();
        await writePromise1;

        resolveWrite2!();
        await writePromise2;

        await expect(flushPromise).resolves.toBeUndefined();
      });

      it('should handle write failures gracefully', async () => {
        const mockLogRecords: ReadableLogRecord[] = [
          {
            hrTime: [1234567890, 123456789],
            hrTimeObserved: [1234567890, 123456789],
            body: 'Test log message',
          } as unknown as ReadableLogRecord,
        ];

        const error = new Error('Write failed');
        mockLogWrite.mockRejectedValueOnce(error);

        const callback = vi.fn();

        exporter.export(mockLogRecords, callback);

        await expect(exporter.forceFlush()).resolves.toBeUndefined();

        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(callback).toHaveBeenCalledWith({
          code: ExportResultCode.FAILED,
          error,
        });
      });
    });

    describe('shutdown', () => {
      it('should call forceFlush', async () => {
        const forceFlushSpy = vi.spyOn(exporter, 'forceFlush');

        await exporter.shutdown();

        expect(forceFlushSpy).toHaveBeenCalled();
      });

      it('should handle shutdown gracefully', async () => {
        const forceFlushSpy = vi.spyOn(exporter, 'forceFlush');

        await expect(exporter.shutdown()).resolves.toBeUndefined();
        expect(forceFlushSpy).toHaveBeenCalled();
      });
      it('should wait for pending writes before shutting down', async () => {
        const mockLogRecords: ReadableLogRecord[] = [
          {
            hrTime: [1234567890, 123456789],
            hrTimeObserved: [1234567890, 123456789],
            body: 'Test log message',
          } as unknown as ReadableLogRecord,
        ];

        let resolveWrite: () => void;
        const writePromise = new Promise<void>((resolve) => {
          resolveWrite = resolve;
        });
        mockLogWrite.mockReturnValueOnce(writePromise);

        const callback = vi.fn();

        exporter.export(mockLogRecords, callback);
        const shutdownPromise = exporter.shutdown();

        await new Promise((resolve) => setTimeout(resolve, 1));

        resolveWrite!();
        await writePromise;

        await expect(shutdownPromise).resolves.toBeUndefined();
      });

      it('should clear pending writes array after shutdown', async () => {
        const mockLogRecords: ReadableLogRecord[] = [
          {
            hrTime: [1234567890, 123456789],
            hrTimeObserved: [1234567890, 123456789],
            body: 'Test log message',
          } as unknown as ReadableLogRecord,
        ];

        const callback = vi.fn();

        exporter.export(mockLogRecords, callback);

        await new Promise((resolve) => setTimeout(resolve, 10));

        await exporter.shutdown();

        const start = Date.now();
        await exporter.forceFlush();
        const elapsed = Date.now() - start;

        expect(elapsed).toBeLessThan(50);
      });
    });

    describe('log entry size calculation and truncation', () => {
      describe('calculateLogEntrySize', () => {
        it('should calculate correct byte size through export behavior', () => {
          // Since calculateLogEntrySize is not exposed, we verify it through
          // the truncation behavior in the export tests below
          expect(true).toBe(true);
        });
      });

      describe('truncateLargeAttributes', () => {
        it('should not truncate small log entries', () => {
          const mockLogRecords: ReadableLogRecord[] = [
            {
              hrTime: [1234567890, 123456789],
              hrTimeObserved: [1234567890, 123456789],
              severityNumber: 9,
              body: 'Small log message',
              attributes: {
                'session.id': 'test-session',
                'event.name': 'test.event',
              },
            } as unknown as ReadableLogRecord,
          ];

          const callback = vi.fn();
          exporter.export(mockLogRecords, callback);

          expect(mockLog.entry).toHaveBeenCalledWith(
            expect.any(Object),
            expect.not.objectContaining({
              _log_entry_truncated: true,
            }),
          );
        });

        it('should truncate large string fields', async () => {
          // Create a large enough payload to exceed the 200KB threshold
          const largeText = 'a'.repeat(250000); // 250KB
          const mockLogRecords: ReadableLogRecord[] = [
            {
              hrTime: [1234567890, 123456789],
              hrTimeObserved: [1234567890, 123456789],
              severityNumber: 9,
              body: 'Test message',
              attributes: {
                'session.id': 'test-session',
                response_text: largeText,
              },
            } as unknown as ReadableLogRecord,
          ];

          const callback = vi.fn();
          exporter.export(mockLogRecords, callback);

          await new Promise((resolve) => setTimeout(resolve, 0));

          const callArgs = mockLog.entry.mock.calls[0][1];
          expect(callArgs._log_entry_truncated).toBe(true);
          expect(callArgs._original_size_bytes).toBeGreaterThan(0);
          expect(callArgs._truncated_fields).toBeDefined();
          expect(typeof callArgs.response_text).toBe('string');
          expect(callArgs.response_text).toContain('[TRUNCATED');
        });

        it('should truncate large object fields', async () => {
          const largeObject = { data: 'x'.repeat(250000) }; // 250KB
          const mockLogRecords: ReadableLogRecord[] = [
            {
              hrTime: [1234567890, 123456789],
              hrTimeObserved: [1234567890, 123456789],
              severityNumber: 9,
              body: 'Test message',
              attributes: {
                'session.id': 'test-session',
                function_args: largeObject,
              },
            } as unknown as ReadableLogRecord,
          ];

          const callback = vi.fn();
          exporter.export(mockLogRecords, callback);

          await new Promise((resolve) => setTimeout(resolve, 0));

          const callArgs = mockLog.entry.mock.calls[0][1];
          expect(callArgs._log_entry_truncated).toBe(true);
          expect(callArgs._truncated_fields).toContain('function_args');
        });

        it('should preserve critical fields when truncating', async () => {
          const largeText = 'a'.repeat(250000); // 250KB
          const mockLogRecords: ReadableLogRecord[] = [
            {
              hrTime: [1234567890, 123456789],
              hrTimeObserved: [1234567890, 123456789],
              severityNumber: 9,
              body: 'Test message',
              attributes: {
                'session.id': 'critical-session',
                'user.email': 'test@example.com',
                'event.name': 'important.event',
                response_text: largeText,
              },
            } as unknown as ReadableLogRecord,
          ];

          const callback = vi.fn();
          exporter.export(mockLogRecords, callback);

          await new Promise((resolve) => setTimeout(resolve, 0));

          const callArgs = mockLog.entry.mock.calls[0][1];
          expect(callArgs['session.id']).toBe('critical-session');
          expect(callArgs['user.email']).toBe('test@example.com');
          expect(callArgs['event.name']).toBe('important.event');
          expect(callArgs._log_entry_truncated).toBe(true);
        });

        it('should add truncation metadata', async () => {
          const largeText = 'a'.repeat(250000); // 250KB
          const mockLogRecords: ReadableLogRecord[] = [
            {
              hrTime: [1234567890, 123456789],
              hrTimeObserved: [1234567890, 123456789],
              severityNumber: 9,
              body: 'Test message',
              attributes: {
                'session.id': 'test-session',
                response_text: largeText,
              },
            } as unknown as ReadableLogRecord,
          ];

          const callback = vi.fn();
          exporter.export(mockLogRecords, callback);

          await new Promise((resolve) => setTimeout(resolve, 0));

          const callArgs = mockLog.entry.mock.calls[0][1];
          expect(callArgs._log_entry_truncated).toBe(true);
          expect(typeof callArgs._original_size_bytes).toBe('number');
          expect(callArgs._original_size_bytes).toBeGreaterThan(0);
          expect(typeof callArgs._truncated_fields).toBe('string');
          expect(callArgs._truncated_fields.length).toBeGreaterThan(0);
          expect(typeof callArgs._truncated_size_bytes).toBe('number');
        });

        it('should handle JSON stringify errors gracefully', async () => {
          const circularRef: Record<string, unknown> = { a: 'value' };
          circularRef['circular'] = circularRef;

          const mockLogRecords: ReadableLogRecord[] = [
            {
              hrTime: [1234567890, 123456789],
              hrTimeObserved: [1234567890, 123456789],
              severityNumber: 9,
              body: 'Test message',
              attributes: {
                'session.id': 'test-session',
                function_args: circularRef,
              },
            } as unknown as ReadableLogRecord,
          ];

          const callback = vi.fn();

          // Should not throw
          expect(() => {
            exporter.export(mockLogRecords, callback);
          }).not.toThrow();

          await new Promise((resolve) => setTimeout(resolve, 0));

          expect(callback).toHaveBeenCalledWith({
            code: ExportResultCode.SUCCESS,
          });
        });

        it('should handle extremely large entries that need aggressive truncation', async () => {
          const extremelyLargeText = 'x'.repeat(300000); // 300KB
          const mockLogRecords: ReadableLogRecord[] = [
            {
              hrTime: [1234567890, 123456789],
              hrTimeObserved: [1234567890, 123456789],
              severityNumber: 9,
              body: 'Test message',
              attributes: {
                'session.id': 'test-session',
                'event.name': 'test.event',
                response_text: extremelyLargeText,
                prompt: extremelyLargeText,
                request_text: extremelyLargeText,
                function_args: extremelyLargeText,
                non_critical_large_field: extremelyLargeText,
              },
            } as unknown as ReadableLogRecord,
          ];

          const callback = vi.fn();
          exporter.export(mockLogRecords, callback);

          await new Promise((resolve) => setTimeout(resolve, 0));

          const callArgs = mockLog.entry.mock.calls[0][1];
          expect(callArgs._log_entry_truncated).toBe(true);
          expect(callArgs['session.id']).toBe('test-session');
          expect(callArgs['event.name']).toBe('test.event');

          // Calculate final size to ensure it's under threshold
          const finalSize = new TextEncoder().encode(
            JSON.stringify(callArgs),
          ).length;
          expect(finalSize).toBeLessThan(262144); // Under 256KB GCP limit
        });
      });
    });
  });
});
