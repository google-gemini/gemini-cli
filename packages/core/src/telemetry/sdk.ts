/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  DiagLogLevel,
  diag,
  trace,
  context,
  metrics,
  propagation,
} from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-grpc';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { OTLPTraceExporter as OTLPTraceExporterHttp } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPLogExporter as OTLPLogExporterHttp } from '@opentelemetry/exporter-logs-otlp-http';
import { OTLPMetricExporter as OTLPMetricExporterHttp } from '@opentelemetry/exporter-metrics-otlp-http';
import { CompressionAlgorithm } from '@opentelemetry/otlp-exporter-base';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  BatchSpanProcessor,
  ConsoleSpanExporter,
} from '@opentelemetry/sdk-trace-node';
import {
  BatchLogRecordProcessor,
  ConsoleLogRecordExporter,
} from '@opentelemetry/sdk-logs';
import {
  ConsoleMetricExporter,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import type { JWTInput } from 'google-auth-library';
import type { Config } from '../config/config.js';
import { SERVICE_NAME } from './constants.js';
import { initializeMetrics } from './metrics.js';
import { ClearcutLogger } from './clearcut-logger/clearcut-logger.js';
import {
  FileLogExporter,
  FileMetricExporter,
  FileSpanExporter,
} from './file-exporters.js';
import {
  GcpTraceExporter,
  GcpMetricExporter,
  GcpLogExporter,
} from './gcp-exporters.js';
import { TelemetryTarget } from './index.js';
import { debugLogger } from '../utils/debugLogger.js';
import { authEvents } from '../code_assist/oauth2.js';

// For troubleshooting, set the log level to DiagLogLevel.DEBUG
class DiagLoggerAdapter {
  error(message: string, ...args: unknown[]): void {
    debugLogger.error(message, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    debugLogger.warn(message, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    debugLogger.log(message, ...args);
  }

  debug(message: string, ...args: unknown[]): void {
    debugLogger.debug(message, ...args);
  }

  verbose(message: string, ...args: unknown[]): void {
    debugLogger.debug(message, ...args);
  }
}

diag.setLogger(new DiagLoggerAdapter(), DiagLogLevel.INFO);

let sdk: NodeSDK | undefined;
let spanProcessor: BatchSpanProcessor | undefined;
let logRecordProcessor: BatchLogRecordProcessor | undefined;
let telemetryInitialized = false;
let callbackRegistered = false;
let authListener: ((newCredentials: JWTInput) => Promise<void>) | undefined =
  undefined;
const telemetryBuffer: Array<() => void | Promise<void>> = [];
let activeTelemetryEmail: string | undefined;

export function isTelemetrySdkInitialized(): boolean {
  return telemetryInitialized;
}

export function bufferTelemetryEvent(fn: () => void | Promise<void>): void {
  if (telemetryInitialized) {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    fn();
  } else {
    telemetryBuffer.push(fn);
  }
}

async function flushTelemetryBuffer(): Promise<void> {
  if (!telemetryInitialized) return;
  while (telemetryBuffer.length > 0) {
    const fn = telemetryBuffer.shift();
    if (fn) {
      try {
        await fn();
      } catch (e) {
        debugLogger.error('Error executing buffered telemetry event', e);
      }
    }
  }
}

function parseOtlpEndpoint(
  otlpEndpointSetting: string | undefined,
  protocol: 'grpc' | 'http',
): string | undefined {
  if (!otlpEndpointSetting) {
    return undefined;
  }
  // Trim leading/trailing quotes that might come from env variables
  const trimmedEndpoint = otlpEndpointSetting.replace(/^["']|["']$/g, '');

  try {
    const url = new URL(trimmedEndpoint);
    if (protocol === 'grpc') {
      // OTLP gRPC exporters expect an endpoint in the format scheme://host:port
      // The `origin` property provides this, stripping any path, query, or hash.
      return url.origin;
    }
    // For http, use the full href.
    return url.href;
  } catch (error) {
    diag.error('Invalid OTLP endpoint URL provided:', trimmedEndpoint, error);
    return undefined;
  }
}

export async function initializeTelemetry(
  config: Config,
  credentials?: JWTInput,
): Promise<void> {
  if (!config.getTelemetryEnabled()) {
    return;
  }

  if (telemetryInitialized) {
    if (
      credentials?.client_email &&
      activeTelemetryEmail &&
      credentials.client_email !== activeTelemetryEmail
    ) {
      const message = `Telemetry credentials have changed (from ${activeTelemetryEmail} to ${credentials.client_email}), but telemetry cannot be re-initialized in this process. Please restart the CLI to use the new account for telemetry.`;
      debugLogger.error(message);
    }
    return;
  }

  if (config.getTelemetryUseCollector() && config.getTelemetryUseCliAuth()) {
    debugLogger.error(
      'Telemetry configuration error: "useCollector" and "useCliAuth" cannot both be true. ' +
        'CLI authentication is only supported with in-process exporters. ' +
        'Disabling telemetry.',
    );
    return;
  }

  // If using CLI auth and no credentials provided, defer initialization
  if (config.getTelemetryUseCliAuth() && !credentials) {
    // Register a callback to initialize telemetry when the user logs in.
    // This is done only once.
    if (!callbackRegistered) {
      callbackRegistered = true;
      authListener = async (newCredentials: JWTInput) => {
        if (config.getTelemetryEnabled() && config.getTelemetryUseCliAuth()) {
          debugLogger.log('Telemetry reinit with credentials.');
          await initializeTelemetry(config, newCredentials);
        }
      };
      authEvents.on('post_auth', authListener);
    }
    debugLogger.log(
      'CLI auth is requested but no credentials, deferring telemetry initialization.',
    );
    return;
  }

  const resource = resourceFromAttributes({
    [SemanticResourceAttributes.SERVICE_NAME]: SERVICE_NAME,
    [SemanticResourceAttributes.SERVICE_VERSION]: process.version,
    'session.id': config.getSessionId(),
  });

  const otlpEndpoint = config.getTelemetryOtlpEndpoint();
  const otlpProtocol = config.getTelemetryOtlpProtocol();
  const telemetryTarget = config.getTelemetryTarget();
  const useCollector = config.getTelemetryUseCollector();

  const parsedEndpoint = parseOtlpEndpoint(otlpEndpoint, otlpProtocol);
  const telemetryOutfile = config.getTelemetryOutfile();
  const useOtlp = !!parsedEndpoint && !telemetryOutfile;

  const gcpProjectId =
    process.env['OTLP_GOOGLE_CLOUD_PROJECT'] ||
    process.env['GOOGLE_CLOUD_PROJECT'];
  const useDirectGcpExport =
    telemetryTarget === TelemetryTarget.GCP && !useCollector;

  let spanExporter:
    | OTLPTraceExporter
    | OTLPTraceExporterHttp
    | GcpTraceExporter
    | FileSpanExporter
    | ConsoleSpanExporter;
  let logExporter:
    | OTLPLogExporter
    | OTLPLogExporterHttp
    | GcpLogExporter
    | FileLogExporter
    | ConsoleLogRecordExporter;
  let metricReader: PeriodicExportingMetricReader;

  if (useDirectGcpExport) {
    debugLogger.log(
      'Creating GCP exporters with projectId:',
      gcpProjectId,
      'using',
      credentials ? 'provided credentials' : 'ADC',
    );
    spanExporter = new GcpTraceExporter(gcpProjectId, credentials);
    logExporter = new GcpLogExporter(gcpProjectId, credentials);
    metricReader = new PeriodicExportingMetricReader({
      exporter: new GcpMetricExporter(gcpProjectId, credentials),
      exportIntervalMillis: 30000,
    });
  } else if (useOtlp) {
    if (otlpProtocol === 'http') {
      spanExporter = new OTLPTraceExporterHttp({
        url: parsedEndpoint,
      });
      logExporter = new OTLPLogExporterHttp({
        url: parsedEndpoint,
      });
      metricReader = new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporterHttp({
          url: parsedEndpoint,
        }),
        exportIntervalMillis: 10000,
      });
    } else {
      // grpc
      spanExporter = new OTLPTraceExporter({
        url: parsedEndpoint,
        compression: CompressionAlgorithm.GZIP,
      });
      logExporter = new OTLPLogExporter({
        url: parsedEndpoint,
        compression: CompressionAlgorithm.GZIP,
      });
      metricReader = new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({
          url: parsedEndpoint,
          compression: CompressionAlgorithm.GZIP,
        }),
        exportIntervalMillis: 10000,
      });
    }
  } else if (telemetryOutfile) {
    spanExporter = new FileSpanExporter(telemetryOutfile);
    logExporter = new FileLogExporter(telemetryOutfile);
    metricReader = new PeriodicExportingMetricReader({
      exporter: new FileMetricExporter(telemetryOutfile),
      exportIntervalMillis: 10000,
    });
  } else {
    spanExporter = new ConsoleSpanExporter();
    logExporter = new ConsoleLogRecordExporter();
    metricReader = new PeriodicExportingMetricReader({
      exporter: new ConsoleMetricExporter(),
      exportIntervalMillis: 10000,
    });
  }

  // Store processor references for manual flushing
  spanProcessor = new BatchSpanProcessor(spanExporter);
  logRecordProcessor = new BatchLogRecordProcessor(logExporter);

  sdk = new NodeSDK({
    resource,
    spanProcessors: [spanProcessor],
    logRecordProcessors: [logRecordProcessor],
    metricReader,
    instrumentations: [new HttpInstrumentation()],
  });

  try {
    sdk.start();
    if (config.getDebugMode()) {
      debugLogger.log('OpenTelemetry SDK started successfully.');
    }
    telemetryInitialized = true;
    activeTelemetryEmail = credentials?.client_email;
    initializeMetrics(config);
    void flushTelemetryBuffer();
  } catch (error) {
    debugLogger.error('Error starting OpenTelemetry SDK:', error);
  }

  // Note: We don't use process.on('exit') here because that callback is synchronous
  // and won't wait for the async shutdownTelemetry() to complete.
  // Instead, telemetry shutdown is handled in runExitCleanup() in cleanup.ts
  process.on('SIGTERM', () => {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    shutdownTelemetry(config);
  });
  process.on('SIGINT', () => {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    shutdownTelemetry(config);
  });
}

/**
 * Force flush all pending telemetry data to disk.
 * This is useful for ensuring telemetry is written before critical operations like /clear.
 */
export async function flushTelemetry(config: Config): Promise<void> {
  if (!telemetryInitialized || !spanProcessor || !logRecordProcessor) {
    return;
  }
  try {
    // Force flush all pending telemetry to disk
    await Promise.all([
      spanProcessor.forceFlush(),
      logRecordProcessor.forceFlush(),
    ]);
    if (config.getDebugMode()) {
      debugLogger.log('OpenTelemetry SDK flushed successfully.');
    }
  } catch (error) {
    debugLogger.error('Error flushing SDK:', error);
  }
}

export async function shutdownTelemetry(
  config: Config,
  fromProcessExit = true,
): Promise<void> {
  if (!telemetryInitialized || !sdk) {
    return;
  }
  try {
    ClearcutLogger.getInstance()?.shutdown();
    await sdk.shutdown();
    if (config.getDebugMode() && fromProcessExit) {
      debugLogger.log('OpenTelemetry SDK shut down successfully.');
    }
  } catch (error) {
    debugLogger.error('Error shutting down SDK:', error);
  } finally {
    telemetryInitialized = false;
    sdk = undefined;
    // Fully reset the global APIs to allow for re-initialization.
    // This is primarily for testing environments where the SDK is started
    // and stopped multiple times in the same process.
    trace.disable();
    context.disable();
    metrics.disable();
    propagation.disable();
    diag.disable();
    if (authListener) {
      authEvents.off('post_auth', authListener);
      authListener = undefined;
    }
    callbackRegistered = false;
    activeTelemetryEmail = undefined;
  }
}
