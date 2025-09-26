/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Config } from '../config/config.js';
import { initializeTelemetry, shutdownTelemetry } from './sdk.js';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-grpc';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { OTLPTraceExporter as OTLPTraceExporterHttp } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPLogExporter as OTLPLogExporterHttp } from '@opentelemetry/exporter-logs-otlp-http';
import { OTLPMetricExporter as OTLPMetricExporterHttp } from '@opentelemetry/exporter-metrics-otlp-http';
import { NodeSDK } from '@opentelemetry/sdk-node';
import {
  GcpTraceExporter,
  GcpLogExporter,
  GcpMetricExporter,
} from './gcp-exporters.js';
import { TelemetryTarget } from './index.js';

import * as os from 'node:os';
import * as path from 'node:path';

vi.mock('@opentelemetry/exporter-trace-otlp-grpc');
vi.mock('@opentelemetry/exporter-logs-otlp-grpc');
vi.mock('@opentelemetry/exporter-metrics-otlp-grpc');
vi.mock('@opentelemetry/exporter-trace-otlp-http');
vi.mock('@opentelemetry/exporter-logs-otlp-http');
vi.mock('@opentelemetry/exporter-metrics-otlp-http');
vi.mock('@opentelemetry/sdk-node');
vi.mock('./gcp-exporters.js');

describe('Telemetry SDK', () => {
  let mockConfig: Config;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig = {
      getTelemetryEnabled: () => true,
      getTelemetryOtlpEndpoint: () => 'http://localhost:4317',
      getTelemetryOtlpProtocol: () => 'grpc',
      getTelemetryTarget: () => 'local',
      getTelemetryUseCollector: () => false,
      getTelemetryOutfile: () => undefined,
      getDebugMode: () => false,
      getSessionId: () => 'test-session',
    } as unknown as Config;
  });

  afterEach(async () => {
    await shutdownTelemetry(mockConfig);
  });

  it('should use gRPC exporters when protocol is grpc', () => {
    initializeTelemetry(mockConfig);

    expect(OTLPTraceExporter).toHaveBeenCalledWith({
      url: 'http://localhost:4317',
      compression: 'gzip',
    });
    expect(OTLPLogExporter).toHaveBeenCalledWith({
      url: 'http://localhost:4317',
      compression: 'gzip',
    });
    expect(OTLPMetricExporter).toHaveBeenCalledWith({
      url: 'http://localhost:4317',
      compression: 'gzip',
    });
    expect(NodeSDK.prototype.start).toHaveBeenCalled();
  });

  it('should use HTTP exporters when protocol is http', () => {
    vi.spyOn(mockConfig, 'getTelemetryEnabled').mockReturnValue(true);
    vi.spyOn(mockConfig, 'getTelemetryOtlpProtocol').mockReturnValue('http');
    vi.spyOn(mockConfig, 'getTelemetryOtlpEndpoint').mockReturnValue(
      'http://localhost:4318',
    );

    initializeTelemetry(mockConfig);

    expect(OTLPTraceExporterHttp).toHaveBeenCalledWith({
      url: 'http://localhost:4318/',
    });
    expect(OTLPLogExporterHttp).toHaveBeenCalledWith({
      url: 'http://localhost:4318/',
    });
    expect(OTLPMetricExporterHttp).toHaveBeenCalledWith({
      url: 'http://localhost:4318/',
    });
    expect(NodeSDK.prototype.start).toHaveBeenCalled();
  });

  it('should parse gRPC endpoint correctly', () => {
    vi.spyOn(mockConfig, 'getTelemetryOtlpEndpoint').mockReturnValue(
      'https://my-collector.com',
    );
    initializeTelemetry(mockConfig);
    expect(OTLPTraceExporter).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://my-collector.com' }),
    );
  });

  it('should parse HTTP endpoint correctly', () => {
    vi.spyOn(mockConfig, 'getTelemetryOtlpProtocol').mockReturnValue('http');
    vi.spyOn(mockConfig, 'getTelemetryOtlpEndpoint').mockReturnValue(
      'https://my-collector.com',
    );
    initializeTelemetry(mockConfig);
    expect(OTLPTraceExporterHttp).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://my-collector.com/' }),
    );
  });

  it('should use direct GCP exporters when target is gcp, project ID is set, and useCollector is false', () => {
    vi.spyOn(mockConfig, 'getTelemetryTarget').mockReturnValue(
      TelemetryTarget.GCP,
    );
    vi.spyOn(mockConfig, 'getTelemetryUseCollector').mockReturnValue(false);
    vi.spyOn(mockConfig, 'getTelemetryOtlpEndpoint').mockReturnValue('');

    const originalEnv = process.env['OTLP_GOOGLE_CLOUD_PROJECT'];
    process.env['OTLP_GOOGLE_CLOUD_PROJECT'] = 'test-project';

    try {
      initializeTelemetry(mockConfig);

      expect(GcpTraceExporter).toHaveBeenCalledWith('test-project');
      expect(GcpLogExporter).toHaveBeenCalledWith('test-project');
      expect(GcpMetricExporter).toHaveBeenCalledWith('test-project');
      expect(NodeSDK.prototype.start).toHaveBeenCalled();
    } finally {
      if (originalEnv) {
        process.env['OTLP_GOOGLE_CLOUD_PROJECT'] = originalEnv;
      } else {
        delete process.env['OTLP_GOOGLE_CLOUD_PROJECT'];
      }
    }
  });

  it('should use OTLP exporters when target is gcp but useCollector is true', () => {
    vi.spyOn(mockConfig, 'getTelemetryTarget').mockReturnValue(
      TelemetryTarget.GCP,
    );
    vi.spyOn(mockConfig, 'getTelemetryUseCollector').mockReturnValue(true);

    initializeTelemetry(mockConfig);

    expect(OTLPTraceExporter).toHaveBeenCalledWith({
      url: 'http://localhost:4317',
      compression: 'gzip',
    });
    expect(OTLPLogExporter).toHaveBeenCalledWith({
      url: 'http://localhost:4317',
      compression: 'gzip',
    });
    expect(OTLPMetricExporter).toHaveBeenCalledWith({
      url: 'http://localhost:4317',
      compression: 'gzip',
    });
  });

  it('should not use GCP exporters when project ID environment variable is not set', () => {
    vi.spyOn(mockConfig, 'getTelemetryTarget').mockReturnValue(
      TelemetryTarget.GCP,
    );
    vi.spyOn(mockConfig, 'getTelemetryUseCollector').mockReturnValue(false);
    vi.spyOn(mockConfig, 'getTelemetryOtlpEndpoint').mockReturnValue('');

    const originalOtlpEnv = process.env['OTLP_GOOGLE_CLOUD_PROJECT'];
    const originalGoogleEnv = process.env['GOOGLE_CLOUD_PROJECT'];
    delete process.env['OTLP_GOOGLE_CLOUD_PROJECT'];
    delete process.env['GOOGLE_CLOUD_PROJECT'];

    try {
      initializeTelemetry(mockConfig);

      expect(GcpTraceExporter).not.toHaveBeenCalled();
      expect(GcpLogExporter).not.toHaveBeenCalled();
      expect(GcpMetricExporter).not.toHaveBeenCalled();
      expect(NodeSDK.prototype.start).toHaveBeenCalled();
    } finally {
      if (originalOtlpEnv) {
        process.env['OTLP_GOOGLE_CLOUD_PROJECT'] = originalOtlpEnv;
      }
      if (originalGoogleEnv) {
        process.env['GOOGLE_CLOUD_PROJECT'] = originalGoogleEnv;
      }
    }
  });

  it('should use GOOGLE_CLOUD_PROJECT as fallback when OTLP_GOOGLE_CLOUD_PROJECT is not set', () => {
    vi.spyOn(mockConfig, 'getTelemetryTarget').mockReturnValue(
      TelemetryTarget.GCP,
    );
    vi.spyOn(mockConfig, 'getTelemetryUseCollector').mockReturnValue(false);
    vi.spyOn(mockConfig, 'getTelemetryOtlpEndpoint').mockReturnValue('');

    const originalOtlpEnv = process.env['OTLP_GOOGLE_CLOUD_PROJECT'];
    const originalGoogleEnv = process.env['GOOGLE_CLOUD_PROJECT'];
    delete process.env['OTLP_GOOGLE_CLOUD_PROJECT'];
    process.env['GOOGLE_CLOUD_PROJECT'] = 'fallback-project';

    try {
      initializeTelemetry(mockConfig);

      expect(GcpTraceExporter).toHaveBeenCalledWith('fallback-project');
      expect(GcpLogExporter).toHaveBeenCalledWith('fallback-project');
      expect(GcpMetricExporter).toHaveBeenCalledWith('fallback-project');
      expect(NodeSDK.prototype.start).toHaveBeenCalled();
    } finally {
      if (originalOtlpEnv) {
        process.env['OTLP_GOOGLE_CLOUD_PROJECT'] = originalOtlpEnv;
      }
      if (originalGoogleEnv) {
        process.env['GOOGLE_CLOUD_PROJECT'] = originalGoogleEnv;
      } else {
        delete process.env['GOOGLE_CLOUD_PROJECT'];
      }
    }
  });

  it('should not use OTLP exporters when telemetryOutfile is set', () => {
    vi.spyOn(mockConfig, 'getTelemetryOutfile').mockReturnValue(
      path.join(os.tmpdir(), 'test.log'),
    );
    initializeTelemetry(mockConfig);

    expect(OTLPTraceExporter).not.toHaveBeenCalled();
    expect(OTLPLogExporter).not.toHaveBeenCalled();
    expect(OTLPMetricExporter).not.toHaveBeenCalled();
    expect(OTLPTraceExporterHttp).not.toHaveBeenCalled();
    expect(OTLPLogExporterHttp).not.toHaveBeenCalled();
    expect(OTLPMetricExporterHttp).not.toHaveBeenCalled();
    expect(NodeSDK.prototype.start).toHaveBeenCalled();
  });
});
