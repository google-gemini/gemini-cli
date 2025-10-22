/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { DiagConsoleLogger, DiagLogLevel, diag } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-grpc';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { OTLPTraceExporter as OTLPTraceExporterHttp } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPLogExporter as OTLPLogExporterHttp } from '@opentelemetry/exporter-logs-otlp-http';
import { OTLPMetricExporter as OTLPMetricExporterHttp } from '@opentelemetry/exporter-metrics-otlp-http';
import { CompressionAlgorithm } from '@opentelemetry/otlp-exporter-base';
import { Metadata } from '@grpc/grpc-js';
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

// For troubleshooting, set the log level to DiagLogLevel.DEBUG
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);

let sdk: NodeSDK | undefined;
let telemetryInitialized = false;

export function isTelemetrySdkInitialized(): boolean {
  return telemetryInitialized;
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

export function initializeTelemetry(config: Config): void {
  if (telemetryInitialized || !config.getTelemetryEnabled()) {
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
    telemetryTarget === TelemetryTarget.GCP && !!gcpProjectId && !useCollector;

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
    spanExporter = new GcpTraceExporter(gcpProjectId);
    logExporter = new GcpLogExporter(gcpProjectId);
    metricReader = new PeriodicExportingMetricReader({
      exporter: new GcpMetricExporter(gcpProjectId),
      exportIntervalMillis: 30000,
    });
  } else if (useOtlp) {
    const otlpHeaders = config.getTelemetryOtlpHeaders() ?? {};
    const hasHeaders = Object.keys(otlpHeaders).length > 0;

    if (hasHeaders) {
      const headerCount = Object.keys(otlpHeaders).length;
      diag.debug(`Applying ${headerCount} OTLP header(s)`);
    }

    if (otlpProtocol === 'http') {
      spanExporter = new OTLPTraceExporterHttp({
        url: parsedEndpoint,
        headers: hasHeaders ? otlpHeaders : undefined,
      });
      logExporter = new OTLPLogExporterHttp({
        url: parsedEndpoint,
        headers: hasHeaders ? otlpHeaders : undefined,
      });
      metricReader = new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporterHttp({
          url: parsedEndpoint,
          headers: hasHeaders ? otlpHeaders : undefined,
        }),
        exportIntervalMillis: 10000,
      });
    } else {
      // grpc - convert headers to Metadata
      let metadata: Metadata | undefined;
      if (hasHeaders) {
        metadata = new Metadata();
        for (const [key, value] of Object.entries(otlpHeaders)) {
          metadata.set(key, value);
        }
      }
      spanExporter = new OTLPTraceExporter({
        url: parsedEndpoint,
        compression: CompressionAlgorithm.GZIP,
        metadata,
      });
      logExporter = new OTLPLogExporter({
        url: parsedEndpoint,
        compression: CompressionAlgorithm.GZIP,
        metadata,
      });
      metricReader = new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({
          url: parsedEndpoint,
          compression: CompressionAlgorithm.GZIP,
          metadata,
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

  sdk = new NodeSDK({
    resource,
    spanProcessors: [new BatchSpanProcessor(spanExporter)],
    logRecordProcessors: [new BatchLogRecordProcessor(logExporter)],
    metricReader,
    instrumentations: [new HttpInstrumentation()],
  });

  try {
    sdk.start();
    if (config.getDebugMode()) {
      debugLogger.log('OpenTelemetry SDK started successfully.');
    }
    telemetryInitialized = true;
    initializeMetrics(config);
  } catch (error) {
    console.error('Error starting OpenTelemetry SDK:', error);
  }

  process.on('SIGTERM', () => {
    shutdownTelemetry(config);
  });
  process.on('SIGINT', () => {
    shutdownTelemetry(config);
  });
  process.on('exit', () => {
    shutdownTelemetry(config);
  });
}

export async function shutdownTelemetry(config: Config): Promise<void> {
  if (!telemetryInitialized || !sdk) {
    return;
  }
  try {
    ClearcutLogger.getInstance()?.shutdown();
    await sdk.shutdown();
    if (config.getDebugMode()) {
      debugLogger.log('OpenTelemetry SDK shut down successfully.');
    }
  } catch (error) {
    console.error('Error shutting down SDK:', error);
  } finally {
    telemetryInitialized = false;
  }
}
