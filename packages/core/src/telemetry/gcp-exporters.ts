/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { JWTInput } from 'google-auth-library';
import type { TraceExporter as CloudTraceExporter } from '@google-cloud/opentelemetry-cloud-trace-exporter';
import type { MetricExporter as CloudMetricExporter } from '@google-cloud/opentelemetry-cloud-monitoring-exporter';
import type {
  Logging as CloudLogging,
  Log as CloudLog,
} from '@google-cloud/logging';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base';
import type {
  PushMetricExporter,
  ResourceMetrics,
} from '@opentelemetry/sdk-metrics';
import {
  hrTimeToMilliseconds,
  ExportResultCode,
  type ExportResult,
} from '@opentelemetry/core';
import type {
  ReadableLogRecord,
  LogRecordExporter,
} from '@opentelemetry/sdk-logs';

const DIRECT_GCP_TELEMETRY_INSTALL_HINT =
  'Direct GCP telemetry export requires optional peer dependencies. ' +
  'Install @google-cloud/opentelemetry-cloud-trace-exporter, ' +
  '@google-cloud/opentelemetry-cloud-monitoring-exporter, and ' +
  '@google-cloud/logging, or configure telemetry to use an OTLP collector.';

let traceExporterClassPromise: Promise<typeof CloudTraceExporter> | undefined;
let metricExporterClassPromise: Promise<typeof CloudMetricExporter> | undefined;
let loggingClassPromise: Promise<typeof CloudLogging> | undefined;

function createOptionalDependencyError(error: unknown): Error {
  const errorMessage = error instanceof Error ? error.message : String(error);
  return new Error(`${DIRECT_GCP_TELEMETRY_INSTALL_HINT} ${errorMessage}`);
}

async function loadTraceExporterClass(): Promise<typeof CloudTraceExporter> {
  traceExporterClassPromise ??= import(
    '@google-cloud/opentelemetry-cloud-trace-exporter'
  )
    .then((module) => module.TraceExporter)
    .catch((error: unknown) => {
      traceExporterClassPromise = undefined;
      throw createOptionalDependencyError(error);
    });
  return traceExporterClassPromise;
}

async function loadMetricExporterClass(): Promise<typeof CloudMetricExporter> {
  metricExporterClassPromise ??= import(
    '@google-cloud/opentelemetry-cloud-monitoring-exporter'
  )
    .then((module) => module.MetricExporter)
    .catch((error: unknown) => {
      metricExporterClassPromise = undefined;
      throw createOptionalDependencyError(error);
    });
  return metricExporterClassPromise;
}

async function loadLoggingClass(): Promise<typeof CloudLogging> {
  loggingClassPromise ??= import('@google-cloud/logging')
    .then((module) => module.Logging)
    .catch((error: unknown) => {
      loggingClassPromise = undefined;
      throw createOptionalDependencyError(error);
    });
  return loggingClassPromise;
}

export async function ensureGcpExporterDependenciesAvailable(): Promise<void> {
  await Promise.all([
    loadTraceExporterClass(),
    loadMetricExporterClass(),
    loadLoggingClass(),
  ]);
}

/**
 * Google Cloud Trace exporter that delegates to the optional Cloud Trace exporter.
 */
export class GcpTraceExporter implements SpanExporter {
  private exporterPromise: Promise<CloudTraceExporter> | undefined;

  constructor(projectId?: string, credentials?: JWTInput) {
    this.projectId = projectId;
    this.credentials = credentials;
  }

  private readonly projectId?: string;
  private readonly credentials?: JWTInput;

  private getExporter(): Promise<CloudTraceExporter> {
    this.exporterPromise ??= loadTraceExporterClass().then(
      (TraceExporter) =>
        new TraceExporter({
          projectId: this.projectId,
          credentials: this.credentials,
          resourceFilter: /^gcp\./,
        }),
    );
    return this.exporterPromise;
  }

  export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void,
  ): void {
    void this.getExporter()
      .then((exporter) => exporter.export(spans, resultCallback))
      .catch((error: Error) => {
        resultCallback({ code: ExportResultCode.FAILED, error });
      });
  }

  async forceFlush(): Promise<void> {
    return Promise.resolve();
  }

  async shutdown(): Promise<void> {
    await this.getExporter().then((exporter) => exporter.shutdown());
  }
}

/**
 * Google Cloud Monitoring exporter that delegates to the optional Monitoring exporter.
 */
export class GcpMetricExporter implements PushMetricExporter {
  private exporterPromise: Promise<CloudMetricExporter> | undefined;

  constructor(projectId?: string, credentials?: JWTInput) {
    this.projectId = projectId;
    this.credentials = credentials;
  }

  private readonly projectId?: string;
  private readonly credentials?: JWTInput;

  private getExporter(): Promise<CloudMetricExporter> {
    this.exporterPromise ??= loadMetricExporterClass().then(
      (MetricExporter) =>
        new MetricExporter({
          projectId: this.projectId,
          credentials: this.credentials,
          prefix: 'custom.googleapis.com/gemini_cli',
        }),
    );
    return this.exporterPromise;
  }

  private handleExportResult(
    result: ExportResult,
    resultCallback: (result: ExportResult) => void,
  ): void {
    if (result.code === ExportResultCode.FAILED && result.error) {
      // Suppress errors related to writing too frequently, as they are
      // expected when the CLI shuts down quickly after a periodic export.
      const errorMessage = result.error.message || String(result.error);
      if (
        process.env['GEMINI_STRICT_TELEMETRY_LIMITS'] === 'true' &&
        errorMessage.includes(
          'written more frequently than the maximum sampling period',
        )
      ) {
        resultCallback({ code: ExportResultCode.SUCCESS });
        return;
      }
    }
    resultCallback(result);
  }

  export(
    metrics: ResourceMetrics,
    resultCallback: (result: ExportResult) => void,
  ): void {
    void this.getExporter()
      .then((exporter) => {
        exporter.export(metrics, (result: ExportResult) => {
          this.handleExportResult(result, resultCallback);
        });
      })
      .catch((error: Error) => {
        resultCallback({ code: ExportResultCode.FAILED, error });
      });
  }

  async forceFlush(): Promise<void> {
    await this.getExporter().then((exporter) => exporter.forceFlush());
  }

  async shutdown(): Promise<void> {
    await this.getExporter().then((exporter) => exporter.shutdown());
  }
}

/**
 * Deeply truncates strings in an object to prevent GCP log size limit errors.
 */
function truncateLogPayload(payload: unknown, limit = 200000): unknown {
  if (typeof payload === 'string') {
    return payload.length > limit
      ? payload.substring(0, limit) + '... (truncated due to size)'
      : payload;
  }
  if (Array.isArray(payload)) {
    return payload.map((item) => truncateLogPayload(item, limit));
  }
  if (payload !== null && typeof payload === 'object') {
    const truncatedObj: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload)) {
      // Keys are also strings, but usually small. Truncate values.
      truncatedObj[key] = truncateLogPayload(value, limit);
    }
    return truncatedObj;
  }
  return payload;
}

/**
 * Google Cloud Logging exporter that delegates to the optional Cloud Logging client.
 */
export class GcpLogExporter implements LogRecordExporter {
  private loggingPromise:
    | Promise<{ logging: CloudLogging; log: CloudLog }>
    | undefined;
  private pendingWrites: Array<Promise<void>> = [];

  constructor(projectId?: string, credentials?: JWTInput) {
    this.projectId = projectId;
    this.credentials = credentials;
  }

  private readonly projectId?: string;
  private readonly credentials?: JWTInput;

  private getLogging(): Promise<{ logging: CloudLogging; log: CloudLog }> {
    this.loggingPromise ??= loadLoggingClass().then((Logging) => {
      const logging = new Logging({
        projectId: this.projectId,
        credentials: this.credentials,
      });
      return { logging, log: logging.log('gemini_cli') };
    });
    return this.loggingPromise;
  }

  export(
    logs: ReadableLogRecord[],
    resultCallback: (result: ExportResult) => void,
  ): void {
    try {
      const writePromise = this.getLogging()
        .then(({ logging, log }) => {
          try {
            const entries = logs.map((logRecord) => {
              const rawPayload = {
                ...logRecord.attributes,
                ...logRecord.resource?.attributes,
                message: logRecord.body,
              };

              const isStrictTelemetry =
                process.env['GEMINI_STRICT_TELEMETRY_LIMITS'] === 'true';

              let finalPayload: unknown = rawPayload;

              if (isStrictTelemetry) {
                // Enforce a strict cap on the entire payload to avoid 256KB limit crashes in CI.
                let safePayload = truncateLogPayload(rawPayload, 10000);
                let payloadString = JSON.stringify(safePayload);

                if (payloadString && payloadString.length > 100000) {
                  // If still too large, apply a stricter limit
                  safePayload = truncateLogPayload(rawPayload, 2000);
                  payloadString = JSON.stringify(safePayload);

                  if (payloadString && payloadString.length > 100000) {
                    safePayload = truncateLogPayload(rawPayload, 5000);
                    payloadString = JSON.stringify(safePayload);

                    if (payloadString && payloadString.length > 100000) {
                      // Fallback: strip structure and send a truncated raw string
                      safePayload = {
                        _warning:
                          'Payload heavily truncated due to strict limits',
                        data:
                          payloadString.substring(0, 50000) + '... (truncated)',
                      };
                    }
                  }
                }
                finalPayload = safePayload;
              }

              const entry = log.entry(
                {
                  severity: this.mapSeverityToCloudLogging(
                    logRecord.severityNumber,
                  ),
                  timestamp: new Date(hrTimeToMilliseconds(logRecord.hrTime)),
                  resource: {
                    type: 'global',
                    labels: {
                      project_id: logging.projectId,
                    },
                  },
                },
                // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
                finalPayload as Record<string, unknown>,
              );
              return entry;
            });

            return log
              .write(entries)
              .then(() => {
                resultCallback({ code: ExportResultCode.SUCCESS });
              })
              .catch((error: Error) => {
                resultCallback({
                  code: ExportResultCode.FAILED,
                  error,
                });
              });
          } catch (error) {
            resultCallback({
              code: ExportResultCode.FAILED,
              // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
              error: error as Error,
            });
            return undefined;
          }
        })
        .catch((error: Error) => {
          resultCallback({
            code: ExportResultCode.FAILED,
            error,
          });
        })
        .finally(() => {
          const index = this.pendingWrites.indexOf(writePromise);
          if (index > -1) {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            this.pendingWrites.splice(index, 1);
          }
        });
      this.pendingWrites.push(writePromise);
    } catch (error) {
      resultCallback({
        code: ExportResultCode.FAILED,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        error: error as Error,
      });
    }
  }

  async forceFlush(): Promise<void> {
    if (this.pendingWrites.length > 0) {
      await Promise.all(this.pendingWrites);
    }
  }

  async shutdown(): Promise<void> {
    await this.forceFlush();
    this.pendingWrites = [];
  }

  private mapSeverityToCloudLogging(severityNumber?: number): string {
    if (!severityNumber) return 'DEFAULT';

    // Map OpenTelemetry severity numbers to Cloud Logging severity levels
    // https://opentelemetry.io/docs/specs/otel/logs/data-model/#field-severitynumber
    if (severityNumber >= 21) return 'CRITICAL';
    if (severityNumber >= 17) return 'ERROR';
    if (severityNumber >= 13) return 'WARNING';
    if (severityNumber >= 9) return 'INFO';
    if (severityNumber >= 5) return 'DEBUG';
    return 'DEFAULT';
  }
}
