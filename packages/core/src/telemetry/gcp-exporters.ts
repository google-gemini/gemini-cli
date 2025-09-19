/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { TraceExporter } from '@google-cloud/opentelemetry-cloud-trace-exporter';
import { MetricExporter } from '@google-cloud/opentelemetry-cloud-monitoring-exporter';
import { Logging } from '@google-cloud/logging';
import type { Log } from '@google-cloud/logging';
import { hrTimeToMilliseconds } from '@opentelemetry/core';
import type { ExportResult } from '@opentelemetry/core';
import { ExportResultCode } from '@opentelemetry/core';
import type {
  ReadableLogRecord,
  LogRecordExporter,
} from '@opentelemetry/sdk-logs';

/**
 * Google Cloud Trace exporter that extends the official trace exporter
 */
export class GcpTraceExporter extends TraceExporter {
  constructor(projectId?: string) {
    super({
      projectId,
      resourceFilter: /^gcp\./,
    });
  }
}

/**
 * Google Cloud Monitoring exporter that extends the official metrics exporter
 */
export class GcpMetricExporter extends MetricExporter {
  constructor(projectId?: string) {
    super({
      projectId,
      prefix: 'custom.googleapis.com/gemini_cli',
    });
  }
}

/**
 * Google Cloud Logging exporter that uses the Cloud Logging client
 */
export class GcpLogExporter implements LogRecordExporter {
  private logging: Logging;
  private log: Log;
  private pendingWrites: Array<Promise<void>> = [];

  constructor(projectId?: string) {
    this.logging = new Logging({ projectId });
    this.log = this.logging.log('gemini_cli');
  }

  export(
    logs: ReadableLogRecord[],
    resultCallback: (result: ExportResult) => void,
  ): void {
    try {
      const entries = logs.map((log) => {
        const entry = this.log.entry(
          {
            severity: this.mapSeverityToCloudLogging(log.severityNumber),
            timestamp: new Date(hrTimeToMilliseconds(log.hrTime)),
            resource: {
              type: 'global',
              labels: {
                project_id: this.logging.projectId,
              },
            },
          },
          {
            session_id: log.attributes?.['session.id'],
            ...log.attributes,
            ...log.resource?.attributes,
            message: log.body,
          },
        );
        return entry;
      });

      const writePromise = this.log
        .write(entries)
        .then(() => {
          resultCallback({ code: ExportResultCode.SUCCESS });
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
            this.pendingWrites.splice(index, 1);
          }
        });
      this.pendingWrites.push(writePromise);
    } catch (error) {
      resultCallback({
        code: ExportResultCode.FAILED,
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
