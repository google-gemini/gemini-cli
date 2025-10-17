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
import * as fs from 'node:fs';
import { Buffer } from 'node:buffer';
import { credentials, type ChannelCredentials } from '@grpc/grpc-js';

vi.mock('@opentelemetry/exporter-trace-otlp-grpc');
vi.mock('@opentelemetry/exporter-logs-otlp-grpc');
vi.mock('@opentelemetry/exporter-metrics-otlp-grpc');
vi.mock('@opentelemetry/exporter-trace-otlp-http');
vi.mock('@opentelemetry/exporter-logs-otlp-http');
vi.mock('@opentelemetry/exporter-metrics-otlp-http');
vi.mock('@opentelemetry/sdk-node');
vi.mock('./gcp-exporters.js');
vi.mock('@grpc/grpc-js');
vi.mock('node:fs');

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
      getTelemetrySslRootFilePath: () => undefined,
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

  it('should use HTTP exporters without SSL when protocol is http and no sslRootsFilePath is provided', () => {
    vi.spyOn(mockConfig, 'getTelemetryOtlpProtocol').mockReturnValue('http');
    vi.spyOn(mockConfig, 'getTelemetryOtlpEndpoint').mockReturnValue(
      'http://localhost:4318',
    );
    vi.spyOn(mockConfig, 'getTelemetrySslRootFilePath').mockReturnValue(
      undefined,
    );

    initializeTelemetry(mockConfig);

    expect(fs.readFileSync).not.toHaveBeenCalled();
    expect(OTLPTraceExporterHttp).toHaveBeenCalledWith({
      url: 'http://localhost:4318/',
      httpAgentOptions: undefined,
    });
    expect(OTLPLogExporterHttp).toHaveBeenCalledWith({
      url: 'http://localhost:4318/',
      httpAgentOptions: undefined,
    });
    expect(OTLPMetricExporterHttp).toHaveBeenCalledWith({
      url: 'http://localhost:4318/',
      httpAgentOptions: undefined,
    });
    expect(NodeSDK.prototype.start).toHaveBeenCalled();
  });

  it('should use SSL credentials for http when sslRootFilePath is provided', () => {
    const fakePath = '/fake/path/to/roots.pem';
    vi.spyOn(mockConfig, 'getTelemetryOtlpProtocol').mockReturnValue('http');
    vi.spyOn(mockConfig, 'getTelemetryOtlpEndpoint').mockReturnValue(
      'http://localhost:4318',
    );
    vi.spyOn(mockConfig, 'getTelemetrySslRootFilePath').mockReturnValue(
      fakePath,
    );
    vi.mocked(fs.readFileSync).mockReturnValue(
      Buffer.from('fake-cert-content'),
    );

    initializeTelemetry(mockConfig);

    expect(fs.readFileSync).toHaveBeenCalledWith(fakePath);
    const expectedHttpAgentOptions = { ca: Buffer.from('fake-cert-content') };
    expect(OTLPTraceExporterHttp).toHaveBeenCalledWith({
      url: 'http://localhost:4318/',
      httpAgentOptions: expectedHttpAgentOptions,
    });
    expect(OTLPLogExporterHttp).toHaveBeenCalledWith({
      url: 'http://localhost:4318/',
      httpAgentOptions: expectedHttpAgentOptions,
    });
    expect(OTLPMetricExporterHttp).toHaveBeenCalledWith({
      url: 'http://localhost:4318/',
      httpAgentOptions: expectedHttpAgentOptions,
    });
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

  it('should use SSL credentials for grpc when sslRootFilePath is provided', () => {
    const fakePath = '/fake/path/to/roots.pem';
    const mockSslCreds = {} as ChannelCredentials;
    vi.mocked(credentials.createSsl).mockReturnValue(mockSslCreds);

    vi.spyOn(mockConfig, 'getTelemetrySslRootFilePath').mockReturnValue(
      fakePath,
    );

    vi.mocked(fs.readFileSync).mockReturnValue('fake-cert-content');

    initializeTelemetry(mockConfig);

    expect(fs.readFileSync).toHaveBeenCalledWith(fakePath);
    expect(credentials.createSsl).toHaveBeenCalledWith('fake-cert-content');
    expect(OTLPTraceExporter).toHaveBeenCalledWith(
      expect.objectContaining({
        credentials: mockSslCreds,
      }),
    );
    expect(OTLPLogExporter).toHaveBeenCalledWith(
      expect.objectContaining({
        credentials: mockSslCreds,
      }),
    );
    expect(OTLPMetricExporter).toHaveBeenCalledWith(
      expect.objectContaining({
        credentials: mockSslCreds,
      }),
    );
  });

  it('should not use SSL credentials for grpc when sslRootFilePath is not provided', () => {
    initializeTelemetry(mockConfig);

    expect(fs.readFileSync).not.toHaveBeenCalled();
    expect(credentials.createSsl).not.toHaveBeenCalled();

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
});
