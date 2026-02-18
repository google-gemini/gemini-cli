/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  FileSpanExporter,
  FileLogExporter,
  FileMetricExporter,
} from './file-exporters.js';
import { ExportResultCode } from '@opentelemetry/core';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import type { ReadableLogRecord } from '@opentelemetry/sdk-logs';
import type { ResourceMetrics } from '@opentelemetry/sdk-metrics';
import { AggregationTemporality } from '@opentelemetry/sdk-metrics';
import * as fs from 'node:fs';

function createMockWriteStream(): {
  write: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
} {
  return {
    write: vi.fn((_data: string, cb: (err?: Error | null) => void) => cb()),
    end: vi.fn((cb: () => void) => cb()),
  };
}

let mockWriteStream: ReturnType<typeof createMockWriteStream>;

vi.mock('node:fs', () => ({
  createWriteStream: vi.fn(),
}));

describe('FileSpanExporter', () => {
  let exporter: FileSpanExporter;

  beforeEach(() => {
    mockWriteStream = createMockWriteStream();
    vi.mocked(fs.createWriteStream).mockReturnValue(
      mockWriteStream as unknown as fs.WriteStream,
    );
    exporter = new FileSpanExporter('/tmp/test-spans.log');
  });

  it('should export spans successfully', () => {
    const span = {
      name: 'test-span',
      kind: 0,
      spanContext: () => ({
        traceId: 'abc123',
        spanId: 'def456',
        traceFlags: 1,
      }),
      status: { code: 0 },
      attributes: { key: 'value' },
      startTime: [0, 0],
      endTime: [1, 0],
      duration: [1, 0],
      events: [],
      links: [],
    } as unknown as ReadableSpan;

    const resultCallback = vi.fn();
    exporter.export([span], resultCallback);

    expect(resultCallback).toHaveBeenCalledWith({
      code: ExportResultCode.SUCCESS,
      error: undefined,
    });
    expect(mockWriteStream.write).toHaveBeenCalledTimes(1);
    const writtenData = mockWriteStream.write.mock.calls[0][0] as string;
    expect(writtenData).toContain('test-span');
  });

  it('should handle circular references without crashing', () => {
    // Simulate the circular reference structure found in OTel spans
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const span: any = {
      name: 'circular-span',
      kind: 0,
      status: { code: 0 },
      attributes: {},
    };
    // Create circular reference similar to BatchSpanProcessor2 -> BindOnceFuture -> _that
    span._processor = { _shutdownOnce: { _that: span._processor } };
    span._processor._shutdownOnce._that = span._processor;

    const resultCallback = vi.fn();
    exporter.export([span as ReadableSpan], resultCallback);

    expect(resultCallback).toHaveBeenCalledWith({
      code: ExportResultCode.SUCCESS,
      error: undefined,
    });

    const writtenData = mockWriteStream.write.mock.calls[0][0] as string;
    expect(writtenData).toContain('[Circular]');
    expect(writtenData).toContain('circular-span');
  });

  it('should report failure on write error', () => {
    const writeError = new Error('disk full');
    mockWriteStream.write.mockImplementation(
      (_data: string, cb: (err?: Error | null) => void) => cb(writeError),
    );

    const span = { name: 'test' } as unknown as ReadableSpan;
    const resultCallback = vi.fn();
    exporter.export([span], resultCallback);

    expect(resultCallback).toHaveBeenCalledWith({
      code: ExportResultCode.FAILED,
      error: writeError,
    });
  });
});

describe('FileLogExporter', () => {
  beforeEach(() => {
    mockWriteStream = createMockWriteStream();
    vi.mocked(fs.createWriteStream).mockReturnValue(
      mockWriteStream as unknown as fs.WriteStream,
    );
  });

  it('should export logs with circular references', () => {
    const exporter = new FileLogExporter('/tmp/test-logs.log');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const log: any = { body: 'test-log', severityNumber: 9 };
    log.self = log;

    const resultCallback = vi.fn();
    exporter.export([log as ReadableLogRecord], resultCallback);

    expect(resultCallback).toHaveBeenCalledWith({
      code: ExportResultCode.SUCCESS,
      error: undefined,
    });

    const writtenData = mockWriteStream.write.mock.calls[0][0] as string;
    expect(writtenData).toContain('[Circular]');
    expect(writtenData).toContain('test-log');
  });
});

describe('FileMetricExporter', () => {
  beforeEach(() => {
    mockWriteStream = createMockWriteStream();
    vi.mocked(fs.createWriteStream).mockReturnValue(
      mockWriteStream as unknown as fs.WriteStream,
    );
  });

  it('should export metrics with circular references', () => {
    const exporter = new FileMetricExporter('/tmp/test-metrics.log');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const metrics: any = {
      resource: { attributes: { service: 'test' } },
      scopeMetrics: [],
    };
    metrics.self = metrics;

    const resultCallback = vi.fn();
    exporter.export(metrics as ResourceMetrics, resultCallback);

    expect(resultCallback).toHaveBeenCalledWith({
      code: ExportResultCode.SUCCESS,
      error: undefined,
    });

    const writtenData = mockWriteStream.write.mock.calls[0][0] as string;
    expect(writtenData).toContain('[Circular]');
    expect(writtenData).toContain('test');
  });

  it('should return CUMULATIVE aggregation temporality', () => {
    const exporter = new FileMetricExporter('/tmp/test-metrics.log');
    expect(exporter.getPreferredAggregationTemporality()).toBe(
      AggregationTemporality.CUMULATIVE,
    );
  });

  it('should resolve forceFlush', async () => {
    const exporter = new FileMetricExporter('/tmp/test-metrics.log');
    await expect(exporter.forceFlush()).resolves.toBeUndefined();
  });
});
