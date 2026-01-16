/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Config } from '../config/config.js';
import {
  initializeTelemetry,
  shutdownTelemetry,
  bufferTelemetryEvent,
} from './sdk.js';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-grpc';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { OTLPTraceExporter as OTLPTraceExporterHttp } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPLogExporter as OTLPLogExporterHttp } from '@opentelemetry/exporter-logs-otlp-http';
import { OTLPMetricExporter as OTLPMetricExporterHttp } from '@opentelemetry/exporter-metrics-otlp-http';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { GoogleAuth, type JWTInput } from 'google-auth-library';
import {
  GcpTraceExporter,
  GcpLogExporter,
  GcpMetricExporter,
} from './gcp-exporters.js';
import { TelemetryTarget } from './index.js';

import * as os from 'node:os';
import * as path from 'node:path';

import { authEvents } from '../code_assist/oauth2.js';
import { debugLogger } from '../utils/debugLogger.js';

vi.mock('@opentelemetry/exporter-trace-otlp-grpc');
vi.mock('@opentelemetry/exporter-logs-otlp-grpc');
vi.mock('@opentelemetry/exporter-metrics-otlp-grpc');
vi.mock('@opentelemetry/exporter-trace-otlp-http');
vi.mock('@opentelemetry/exporter-logs-otlp-http');
vi.mock('@opentelemetry/exporter-metrics-otlp-http');
vi.mock('@opentelemetry/sdk-trace-node');
vi.mock('@opentelemetry/sdk-node');
vi.mock('./gcp-exporters.js');
vi.mock('google-auth-library');
vi.mock('../utils/debugLogger.js', () => ({
  debugLogger: {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Telemetry SDK', () => {
  let mockConfig: Config;
  const mockGetApplicationDefault = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(GoogleAuth).mockImplementation(
      () =>
        ({
          getApplicationDefault: mockGetApplicationDefault,
        }) as unknown as GoogleAuth,
    );
    mockConfig = {
      getTelemetryEnabled: () => true,
      getTelemetryOtlpEndpoint: () => 'http://localhost:4317',
      getTelemetryOtlpProtocol: () => 'grpc',
      getTelemetryTarget: () => 'local',
      getTelemetryUseCollector: () => false,
      getTelemetryOutfile: () => undefined,
      getDebugMode: () => false,
      getSessionId: () => 'test-session',
      getTelemetryUseCliAuth: () => false,
      isInteractive: () => false,
    } as unknown as Config;
  });

  afterEach(async () => {
    await shutdownTelemetry(mockConfig);
  });

  it('should use gRPC exporters when protocol is grpc', async () => {
    await initializeTelemetry(mockConfig);

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

  it('should use HTTP exporters when protocol is http', async () => {
    vi.spyOn(mockConfig, 'getTelemetryEnabled').mockReturnValue(true);
    vi.spyOn(mockConfig, 'getTelemetryOtlpProtocol').mockReturnValue('http');
    vi.spyOn(mockConfig, 'getTelemetryOtlpEndpoint').mockReturnValue(
      'http://localhost:4318',
    );

    await initializeTelemetry(mockConfig);

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

  it('should parse gRPC endpoint correctly', async () => {
    vi.spyOn(mockConfig, 'getTelemetryOtlpEndpoint').mockReturnValue(
      'https://my-collector.com',
    );
    await initializeTelemetry(mockConfig);
    expect(OTLPTraceExporter).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://my-collector.com' }),
    );
  });

  it('should parse HTTP endpoint correctly', async () => {
    vi.spyOn(mockConfig, 'getTelemetryOtlpProtocol').mockReturnValue('http');
    vi.spyOn(mockConfig, 'getTelemetryOtlpEndpoint').mockReturnValue(
      'https://my-collector.com',
    );
    await initializeTelemetry(mockConfig);
    expect(OTLPTraceExporterHttp).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://my-collector.com/' }),
    );
  });

  it('should use direct GCP exporters when target is gcp, project ID is set, and useCollector is false', async () => {
    mockGetApplicationDefault.mockResolvedValue(undefined); // Simulate ADC available
    vi.spyOn(mockConfig, 'getTelemetryTarget').mockReturnValue(
      TelemetryTarget.GCP,
    );
    vi.spyOn(mockConfig, 'getTelemetryUseCollector').mockReturnValue(false);
    vi.spyOn(mockConfig, 'getTelemetryOtlpEndpoint').mockReturnValue('');

    const originalEnv = process.env['OTLP_GOOGLE_CLOUD_PROJECT'];
    process.env['OTLP_GOOGLE_CLOUD_PROJECT'] = 'test-project';

    try {
      await initializeTelemetry(mockConfig);

      expect(GcpTraceExporter).toHaveBeenCalledWith('test-project', undefined);
      expect(GcpLogExporter).toHaveBeenCalledWith('test-project', undefined);
      expect(GcpMetricExporter).toHaveBeenCalledWith('test-project', undefined);
      expect(NodeSDK.prototype.start).toHaveBeenCalled();
    } finally {
      if (originalEnv) {
        process.env['OTLP_GOOGLE_CLOUD_PROJECT'] = originalEnv;
      } else {
        delete process.env['OTLP_GOOGLE_CLOUD_PROJECT'];
      }
    }
  });

  it('should use OTLP exporters when target is gcp but useCollector is true', async () => {
    vi.spyOn(mockConfig, 'getTelemetryTarget').mockReturnValue(
      TelemetryTarget.GCP,
    );
    vi.spyOn(mockConfig, 'getTelemetryUseCollector').mockReturnValue(true);

    await initializeTelemetry(mockConfig);

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

  it('should use GCP exporters even when project ID environment variable is not set', async () => {
    mockGetApplicationDefault.mockResolvedValue(undefined); // Simulate ADC available
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
      await initializeTelemetry(mockConfig);

      expect(GcpTraceExporter).toHaveBeenCalledWith(undefined, undefined);
      expect(GcpLogExporter).toHaveBeenCalledWith(undefined, undefined);
      expect(GcpMetricExporter).toHaveBeenCalledWith(undefined, undefined);
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

  it('should use GOOGLE_CLOUD_PROJECT as fallback when OTLP_GOOGLE_CLOUD_PROJECT is not set', async () => {
    mockGetApplicationDefault.mockResolvedValue(undefined); // Simulate ADC available
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
      await initializeTelemetry(mockConfig);

      expect(GcpTraceExporter).toHaveBeenCalledWith(
        'fallback-project',
        undefined,
      );
      expect(GcpLogExporter).toHaveBeenCalledWith(
        'fallback-project',
        undefined,
      );
      expect(GcpMetricExporter).toHaveBeenCalledWith(
        'fallback-project',
        undefined,
      );
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

  it('should not use OTLP exporters when telemetryOutfile is set', async () => {
    vi.spyOn(mockConfig, 'getTelemetryOutfile').mockReturnValue(
      path.join(os.tmpdir(), 'test.log'),
    );
    await initializeTelemetry(mockConfig);

    expect(OTLPTraceExporter).not.toHaveBeenCalled();
    expect(OTLPLogExporter).not.toHaveBeenCalled();
    expect(OTLPMetricExporter).not.toHaveBeenCalled();
    expect(OTLPTraceExporterHttp).not.toHaveBeenCalled();
    expect(OTLPLogExporterHttp).not.toHaveBeenCalled();
    expect(OTLPMetricExporterHttp).not.toHaveBeenCalled();
    expect(NodeSDK.prototype.start).toHaveBeenCalled();
  });

  it('should defer initialization when useCliAuth is true and no credentials are provided', async () => {
    vi.spyOn(mockConfig, 'getTelemetryUseCliAuth').mockReturnValue(true);
    vi.spyOn(mockConfig, 'getTelemetryTarget').mockReturnValue(
      TelemetryTarget.GCP,
    );
    vi.spyOn(mockConfig, 'getTelemetryOtlpEndpoint').mockReturnValue('');

    // 1. Initial state: No credentials.
    // Should NOT initialize any exporters.
    await initializeTelemetry(mockConfig);

    // Verify nothing was initialized
    expect(ConsoleSpanExporter).not.toHaveBeenCalled();
    expect(GcpTraceExporter).not.toHaveBeenCalled();

    // Verify deferral log
    expect(debugLogger.log).toHaveBeenCalledWith(
      expect.stringContaining('deferring telemetry initialization'),
    );
  });

  it('should initialize with GCP exporters when credentials are provided via post_auth', async () => {
    vi.spyOn(mockConfig, 'getTelemetryUseCliAuth').mockReturnValue(true);
    vi.spyOn(mockConfig, 'getTelemetryTarget').mockReturnValue(
      TelemetryTarget.GCP,
    );
    vi.spyOn(mockConfig, 'getTelemetryOtlpEndpoint').mockReturnValue('');

    // 1. Initial state: No credentials.
    await initializeTelemetry(mockConfig);

    // Verify nothing happened yet
    expect(GcpTraceExporter).not.toHaveBeenCalled();

    // 2. Set project ID and emit post_auth event
    vi.stubEnv('GOOGLE_CLOUD_PROJECT', 'test-project');
    vi.stubEnv('OTLP_GOOGLE_CLOUD_PROJECT', 'test-project');

    const mockCredentials = {
      client_email: 'test@example.com',
      private_key: '-----BEGIN PRIVATE KEY-----\n...',
      type: 'authorized_user',
    };

    // Emit the event directly
    authEvents.emit('post_auth', mockCredentials);

    // Wait for the event handler to process.
    await vi.waitFor(() => {
      // Check if debugLogger was called, which indicates the listener ran
      expect(debugLogger.log).toHaveBeenCalledWith(
        'Telemetry reinit with credentials.',
      );

      // Should use GCP exporters now with the project ID
      expect(GcpTraceExporter).toHaveBeenCalledWith(
        'test-project',
        mockCredentials,
      );
    });
  });

  describe('bufferTelemetryEvent', () => {
    it('should execute immediately if SDK is initialized', async () => {
      await initializeTelemetry(mockConfig);
      const callback = vi.fn();
      bufferTelemetryEvent(callback);
      expect(callback).toHaveBeenCalled();
    });

    it('should buffer if SDK is not initialized, and flush on initialization', async () => {
      const callback = vi.fn();
      bufferTelemetryEvent(callback);
      expect(callback).not.toHaveBeenCalled();

      await initializeTelemetry(mockConfig);
      expect(callback).toHaveBeenCalled();
    });
  });

  it('should disable telemetry and log error if useCollector and useCliAuth are both true', async () => {
    vi.spyOn(mockConfig, 'getTelemetryUseCollector').mockReturnValue(true);
    vi.spyOn(mockConfig, 'getTelemetryUseCliAuth').mockReturnValue(true);

    await initializeTelemetry(mockConfig);

    expect(debugLogger.error).toHaveBeenCalledWith(
      expect.stringContaining(
        'Telemetry configuration error: "useCollector" and "useCliAuth" cannot both be true',
      ),
    );
    expect(NodeSDK.prototype.start).not.toHaveBeenCalled();
  });
  it('should log error when re-initializing with different credentials', async () => {
    const creds1 = { client_email: 'user1@example.com' };
    const creds2 = { client_email: 'user2@example.com' };

    // 1. Initialize with first account
    await initializeTelemetry(mockConfig, creds1 as JWTInput);

    // 2. Attempt to initialize with second account
    await initializeTelemetry(mockConfig, creds2 as JWTInput);

    // 3. Verify error log
    expect(debugLogger.error).toHaveBeenCalledWith(
      expect.stringContaining(
        'Telemetry credentials have changed (from user1@example.com to user2@example.com)',
      ),
    );
  });

  it('should NOT log error when re-initializing with SAME credentials', async () => {
    const creds1 = { client_email: 'user1@example.com' };

    // 1. Initialize with first account
    await initializeTelemetry(mockConfig, creds1 as JWTInput);

    // 2. Attempt to initialize with same account
    await initializeTelemetry(mockConfig, creds1 as JWTInput);

    // 3. Verify NO error log
    expect(debugLogger.error).not.toHaveBeenCalledWith(
      expect.stringContaining('Telemetry credentials have changed'),
    );
  });
});
