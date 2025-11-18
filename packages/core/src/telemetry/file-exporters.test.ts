/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import { ExportResultCode } from '@opentelemetry/core';
import { AggregationTemporality } from '@opentelemetry/sdk-metrics';
import {
  FileSpanExporter,
  FileLogExporter,
  FileMetricExporter,
} from './file-exporters.js';

vi.mock('node:fs');

describe('file-exporters', () => {
  let mockWriteStream: {
    write: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockWriteStream = {
      write: vi.fn((data, callback) => callback?.(null)),
      end: vi.fn((callback) => callback?.()),
    };

    vi.mocked(fs.createWriteStream).mockReturnValue(mockWriteStream as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('FileSpanExporter', () => {
    it('should create write stream on construction', () => {
      new FileSpanExporter('/path/to/spans.json');

      expect(fs.createWriteStream).toHaveBeenCalledWith('/path/to/spans.json', {
        flags: 'a',
      });
    });

    it('should export spans to file', (done) => {
      const exporter = new FileSpanExporter('/spans.json');
      const mockSpans = [
        { name: 'span1', spanId: '1' },
        { name: 'span2', spanId: '2' },
      ];

      exporter.export(mockSpans as never, (result) => {
        expect(result.code).toBe(ExportResultCode.SUCCESS);
        done();
      });
    });

    it('should serialize spans as JSON', (done) => {
      const exporter = new FileSpanExporter('/spans.json');
      const mockSpans = [{ name: 'test-span', spanId: 'abc123' }];

      exporter.export(mockSpans as never, () => {
        expect(mockWriteStream.write).toHaveBeenCalled();
        const writtenData = mockWriteStream.write.mock.calls[0][0] as string;
        expect(writtenData).toContain('"name"');
        expect(writtenData).toContain('test-span');
        done();
      });
    });

    it('should handle write errors', (done) => {
      mockWriteStream.write.mockImplementation((data, callback) => {
        callback(new Error('Write failed'));
      });

      const exporter = new FileSpanExporter('/spans.json');

      exporter.export([{ name: 'span' }] as never, (result) => {
        expect(result.code).toBe(ExportResultCode.FAILED);
        expect(result.error).toBeDefined();
        done();
      });
    });

    it('should export multiple spans', (done) => {
      const exporter = new FileSpanExporter('/spans.json');
      const mockSpans = [
        { name: 'span1' },
        { name: 'span2' },
        { name: 'span3' },
      ];

      exporter.export(mockSpans as never, (result) => {
        expect(result.code).toBe(ExportResultCode.SUCCESS);
        expect(mockWriteStream.write).toHaveBeenCalledTimes(1);
        done();
      });
    });

    it('should shutdown write stream', async () => {
      const exporter = new FileSpanExporter('/spans.json');

      await exporter.shutdown();

      expect(mockWriteStream.end).toHaveBeenCalled();
    });

    it('should handle empty spans array', (done) => {
      const exporter = new FileSpanExporter('/spans.json');

      exporter.export([], (result) => {
        expect(result.code).toBe(ExportResultCode.SUCCESS);
        done();
      });
    });
  });

  describe('FileLogExporter', () => {
    it('should create write stream on construction', () => {
      new FileLogExporter('/path/to/logs.json');

      expect(fs.createWriteStream).toHaveBeenCalledWith('/path/to/logs.json', {
        flags: 'a',
      });
    });

    it('should export logs to file', (done) => {
      const exporter = new FileLogExporter('/logs.json');
      const mockLogs = [
        { body: 'log1', timestamp: 123 },
        { body: 'log2', timestamp: 456 },
      ];

      exporter.export(mockLogs as never, (result) => {
        expect(result.code).toBe(ExportResultCode.SUCCESS);
        done();
      });
    });

    it('should serialize logs as JSON', (done) => {
      const exporter = new FileLogExporter('/logs.json');
      const mockLogs = [{ body: 'test log message', level: 'info' }];

      exporter.export(mockLogs as never, () => {
        expect(mockWriteStream.write).toHaveBeenCalled();
        const writtenData = mockWriteStream.write.mock.calls[0][0] as string;
        expect(writtenData).toContain('"body"');
        expect(writtenData).toContain('test log message');
        done();
      });
    });

    it('should handle write errors', (done) => {
      mockWriteStream.write.mockImplementation((data, callback) => {
        callback(new Error('Disk full'));
      });

      const exporter = new FileLogExporter('/logs.json');

      exporter.export([{ body: 'log' }] as never, (result) => {
        expect(result.code).toBe(ExportResultCode.FAILED);
        expect(result.error).toBeDefined();
        expect(result.error?.message).toBe('Disk full');
        done();
      });
    });

    it('should export multiple logs', (done) => {
      const exporter = new FileLogExporter('/logs.json');
      const mockLogs = [{ body: 'log1' }, { body: 'log2' }, { body: 'log3' }];

      exporter.export(mockLogs as never, (result) => {
        expect(result.code).toBe(ExportResultCode.SUCCESS);
        done();
      });
    });

    it('should shutdown write stream', async () => {
      const exporter = new FileLogExporter('/logs.json');

      await exporter.shutdown();

      expect(mockWriteStream.end).toHaveBeenCalled();
    });

    it('should handle empty logs array', (done) => {
      const exporter = new FileLogExporter('/logs.json');

      exporter.export([], (result) => {
        expect(result.code).toBe(ExportResultCode.SUCCESS);
        done();
      });
    });
  });

  describe('FileMetricExporter', () => {
    it('should create write stream on construction', () => {
      new FileMetricExporter('/path/to/metrics.json');

      expect(fs.createWriteStream).toHaveBeenCalledWith(
        '/path/to/metrics.json',
        { flags: 'a' },
      );
    });

    it('should export metrics to file', (done) => {
      const exporter = new FileMetricExporter('/metrics.json');
      const mockMetrics = {
        resource: { attributes: {} },
        scopeMetrics: [],
      };

      exporter.export(mockMetrics as never, (result) => {
        expect(result.code).toBe(ExportResultCode.SUCCESS);
        done();
      });
    });

    it('should serialize metrics as JSON', (done) => {
      const exporter = new FileMetricExporter('/metrics.json');
      const mockMetrics = {
        resource: { attributes: { service: 'test' } },
        scopeMetrics: [{ scope: 'test-scope' }],
      };

      exporter.export(mockMetrics as never, () => {
        expect(mockWriteStream.write).toHaveBeenCalled();
        const writtenData = mockWriteStream.write.mock.calls[0][0] as string;
        expect(writtenData).toContain('"resource"');
        expect(writtenData).toContain('scopeMetrics');
        done();
      });
    });

    it('should handle write errors', (done) => {
      mockWriteStream.write.mockImplementation((data, callback) => {
        callback(new Error('Permission denied'));
      });

      const exporter = new FileMetricExporter('/metrics.json');
      const mockMetrics = { resource: {}, scopeMetrics: [] };

      exporter.export(mockMetrics as never, (result) => {
        expect(result.code).toBe(ExportResultCode.FAILED);
        expect(result.error).toBeDefined();
        done();
      });
    });

    it('should return CUMULATIVE aggregation temporality', () => {
      const exporter = new FileMetricExporter('/metrics.json');

      const temporality = exporter.getPreferredAggregationTemporality();

      expect(temporality).toBe(AggregationTemporality.CUMULATIVE);
    });

    it('should implement forceFlush', async () => {
      const exporter = new FileMetricExporter('/metrics.json');

      const result = exporter.forceFlush();

      expect(result).toBeInstanceOf(Promise);
      await expect(result).resolves.toBeUndefined();
    });

    it('should shutdown write stream', async () => {
      const exporter = new FileMetricExporter('/metrics.json');

      await exporter.shutdown();

      expect(mockWriteStream.end).toHaveBeenCalled();
    });
  });

  describe('common behavior', () => {
    it('should use append mode for all exporters', () => {
      new FileSpanExporter('/spans.json');
      new FileLogExporter('/logs.json');
      new FileMetricExporter('/metrics.json');

      expect(fs.createWriteStream).toHaveBeenCalledTimes(3);
      fs.createWriteStream.mock.calls.forEach((call) => {
        expect(call[1]).toEqual({ flags: 'a' });
      });
    });

    it('should accept different file paths', () => {
      const paths = ['/path1.json', '/path2.json', '/custom/path3.json'];

      paths.forEach((path) => {
        new FileSpanExporter(path);
      });

      paths.forEach((path, index) => {
        expect(fs.createWriteStream.mock.calls[index][0]).toBe(path);
      });
    });

    it('should format JSON with indentation', (done) => {
      const exporter = new FileSpanExporter('/spans.json');
      const mockSpan = { name: 'test', data: { nested: true } };

      exporter.export([mockSpan] as never, () => {
        const writtenData = mockWriteStream.write.mock.calls[0][0] as string;
        expect(writtenData).toContain('\n');
        expect(writtenData).toMatch(/\s{2,}/); // Contains indentation
        done();
      });
    });

    it('should end with newline', (done) => {
      const exporter = new FileSpanExporter('/spans.json');

      exporter.export([{ name: 'test' }] as never, () => {
        const writtenData = mockWriteStream.write.mock.calls[0][0] as string;
        expect(writtenData.endsWith('\n')).toBe(true);
        done();
      });
    });
  });

  describe('shutdown behavior', () => {
    it('should return promise from shutdown', () => {
      const exporter = new FileSpanExporter('/spans.json');

      const result = exporter.shutdown();

      expect(result).toBeInstanceOf(Promise);
    });

    it('should resolve shutdown promise', async () => {
      const exporter = new FileSpanExporter('/spans.json');

      await expect(exporter.shutdown()).resolves.toBeUndefined();
    });

    it('should call end on write stream', async () => {
      const exporter = new FileLogExporter('/logs.json');

      await exporter.shutdown();

      expect(mockWriteStream.end).toHaveBeenCalled();
    });

    it('should wait for stream to close', async () => {
      let endCalled = false;
      mockWriteStream.end.mockImplementation((callback) => {
        setTimeout(() => {
          endCalled = true;
          callback();
        }, 10);
      });

      const exporter = new FileMetricExporter('/metrics.json');

      await exporter.shutdown();

      expect(endCalled).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should provide error in callback', (done) => {
      const testError = new Error('Test error');
      mockWriteStream.write.mockImplementation((data, callback) => {
        callback(testError);
      });

      const exporter = new FileSpanExporter('/spans.json');

      exporter.export([{ name: 'span' }] as never, (result) => {
        expect(result.error).toBe(testError);
        done();
      });
    });

    it('should handle undefined error', (done) => {
      mockWriteStream.write.mockImplementation((data, callback) => {
        callback(null);
      });

      const exporter = new FileSpanExporter('/spans.json');

      exporter.export([{ name: 'span' }] as never, (result) => {
        expect(result.error).toBeUndefined();
        done();
      });
    });

    it('should set failed code on error', (done) => {
      mockWriteStream.write.mockImplementation((data, callback) => {
        callback(new Error('Failed'));
      });

      const exporter = new FileLogExporter('/logs.json');

      exporter.export([{ body: 'log' }] as never, (result) => {
        expect(result.code).toBe(ExportResultCode.FAILED);
        done();
      });
    });

    it('should set success code when no error', (done) => {
      const exporter = new FileMetricExporter('/metrics.json');

      exporter.export({ resource: {}, scopeMetrics: [] } as never, (result) => {
        expect(result.code).toBe(ExportResultCode.SUCCESS);
        done();
      });
    });
  });

  describe('serialization', () => {
    it('should serialize complex objects', (done) => {
      const exporter = new FileSpanExporter('/spans.json');
      const complexSpan = {
        name: 'complex',
        attributes: { key1: 'value1', key2: 123 },
        events: [{ name: 'event1' }],
      };

      exporter.export([complexSpan] as never, () => {
        const data = mockWriteStream.write.mock.calls[0][0] as string;
        const parsed = JSON.parse(data.trim());
        expect(parsed.attributes).toEqual({ key1: 'value1', key2: 123 });
        done();
      });
    });

    it('should handle nested objects', (done) => {
      const exporter = new FileLogExporter('/logs.json');
      const nestedLog = {
        body: 'message',
        context: { nested: { deeply: { value: 42 } } },
      };

      exporter.export([nestedLog] as never, () => {
        const data = mockWriteStream.write.mock.calls[0][0] as string;
        expect(data).toContain('deeply');
        expect(data).toContain('42');
        done();
      });
    });

    it('should handle arrays', (done) => {
      const exporter = new FileSpanExporter('/spans.json');
      const spanWithArray = {
        name: 'span',
        tags: ['tag1', 'tag2', 'tag3'],
      };

      exporter.export([spanWithArray] as never, () => {
        const data = mockWriteStream.write.mock.calls[0][0] as string;
        expect(data).toContain('"tags"');
        expect(data).toContain('tag1');
        done();
      });
    });
  });

  describe('file path handling', () => {
    it('should handle absolute paths', () => {
      new FileSpanExporter('/absolute/path/to/file.json');

      expect(fs.createWriteStream).toHaveBeenCalledWith(
        '/absolute/path/to/file.json',
        expect.any(Object),
      );
    });

    it('should handle relative paths', () => {
      new FileLogExporter('relative/path.json');

      expect(fs.createWriteStream).toHaveBeenCalledWith(
        'relative/path.json',
        expect.any(Object),
      );
    });

    it('should handle paths with extensions', () => {
      new FileMetricExporter('/data/metrics.json');

      expect(fs.createWriteStream).toHaveBeenCalledWith(
        '/data/metrics.json',
        expect.any(Object),
      );
    });
  });

  describe('aggregation temporality', () => {
    it('should always return CUMULATIVE', () => {
      const exporter = new FileMetricExporter('/metrics.json');

      const temp1 = exporter.getPreferredAggregationTemporality();
      const temp2 = exporter.getPreferredAggregationTemporality();

      expect(temp1).toBe(AggregationTemporality.CUMULATIVE);
      expect(temp2).toBe(AggregationTemporality.CUMULATIVE);
    });

    it('should return consistent value', () => {
      const exporter1 = new FileMetricExporter('/metrics1.json');
      const exporter2 = new FileMetricExporter('/metrics2.json');

      expect(exporter1.getPreferredAggregationTemporality()).toBe(
        exporter2.getPreferredAggregationTemporality(),
      );
    });
  });

  describe('forceFlush', () => {
    it('should return resolved promise', async () => {
      const exporter = new FileMetricExporter('/metrics.json');

      const result = await exporter.forceFlush();

      expect(result).toBeUndefined();
    });

    it('should complete quickly', async () => {
      const exporter = new FileMetricExporter('/metrics.json');

      const start = Date.now();
      await exporter.forceFlush();
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100);
    });

    it('should be callable multiple times', async () => {
      const exporter = new FileMetricExporter('/metrics.json');

      await exporter.forceFlush();
      await exporter.forceFlush();
      await exporter.forceFlush();

      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('concurrent exports', () => {
    it('should handle multiple exports', (done) => {
      const exporter = new FileSpanExporter('/spans.json');
      let completed = 0;

      const callback = () => {
        completed++;
        if (completed === 3) done();
      };

      exporter.export([{ name: 'span1' }] as never, callback);
      exporter.export([{ name: 'span2' }] as never, callback);
      exporter.export([{ name: 'span3' }] as never, callback);
    });

    it('should write all data', (done) => {
      const exporter = new FileLogExporter('/logs.json');
      let callbackCount = 0;

      const callback = () => {
        callbackCount++;
        if (callbackCount === 2) {
          expect(mockWriteStream.write).toHaveBeenCalledTimes(2);
          done();
        }
      };

      exporter.export([{ body: 'log1' }] as never, callback);
      exporter.export([{ body: 'log2' }] as never, callback);
    });
  });
});
