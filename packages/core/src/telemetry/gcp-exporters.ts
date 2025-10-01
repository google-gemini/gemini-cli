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
 * Google Cloud Logging has a hard 256KB (262,144 bytes) limit per log entry.
 * We use a 200KB threshold to leave room for metadata overhead.
 * @see https://cloud.google.com/logging/quotas#log-limits
 */
const GCP_LOG_ENTRY_SIZE_LIMIT = 262144; // 256KB in bytes
const GCP_LOG_ENTRY_SIZE_THRESHOLD = 204800; // 200KB in bytes (safe threshold)

/**
 * Fields that should be preserved even when truncating (critical metadata)
 */
const CRITICAL_FIELDS = new Set([
  'session.id',
  'user.email',
  'event.name',
  'event.timestamp',
  'model',
  'error.message',
  'error.type',
  'prompt_id',
  'function_name',
  'tool_name',
  'status_code',
  'duration_ms',
]);

/**
 * Fields that are typically large and can be truncated aggressively
 */
const TRUNCATABLE_FIELDS = [
  'response_text',
  'function_args',
  'prompt',
  'request_text',
  'message',
];

/**
 * Calculate the approximate size of a log entry in bytes
 */
function calculateLogEntrySize(attributes: Record<string, unknown>): number {
  try {
    return new TextEncoder().encode(JSON.stringify(attributes)).length;
  } catch (_error) {
    return GCP_LOG_ENTRY_SIZE_LIMIT;
  }
}

/**
 * Truncate large fields in log attributes to fit within size limits
 */
function truncateLargeAttributes(
  attributes: Record<string, unknown>,
  targetSize: number,
): {
  truncatedAttributes: Record<string, unknown>;
  wasTruncated: boolean;
  truncatedFields: string[];
  originalSize: number;
} {
  const originalSize = calculateLogEntrySize(attributes);

  if (originalSize <= targetSize) {
    return {
      truncatedAttributes: attributes,
      wasTruncated: false,
      truncatedFields: [],
      originalSize,
    };
  }

  const truncatedAttributes = { ...attributes };
  const truncatedFields: string[] = [];

  for (const field of TRUNCATABLE_FIELDS) {
    if (field in truncatedAttributes) {
      const value = truncatedAttributes[field];
      if (typeof value === 'string' && value.length > 1000) {
        truncatedAttributes[field] =
          value.substring(0, 500) + '... [TRUNCATED - see original logs]';
        truncatedFields.push(field);

        // Check limit
        const newSize = calculateLogEntrySize(truncatedAttributes);
        if (newSize <= targetSize) {
          return {
            truncatedAttributes,
            wasTruncated: true,
            truncatedFields,
            originalSize,
          };
        }
      } else if (typeof value === 'object' && value !== null) {
        // Truncate JSON objects
        try {
          const jsonString = JSON.stringify(value);
          if (jsonString.length > 1000) {
            truncatedAttributes[field] =
              jsonString.substring(0, 500) + '... [TRUNCATED]';
            truncatedFields.push(field);

            const newSize = calculateLogEntrySize(truncatedAttributes);
            if (newSize <= targetSize) {
              return {
                truncatedAttributes,
                wasTruncated: true,
                truncatedFields,
                originalSize,
              };
            }
          }
        } catch {
          // If JSON stringify fails, remove the field
          delete truncatedAttributes[field];
          truncatedFields.push(field);
        }
      }
    }
  }

  // If still too large, remove all non-critical fields
  const criticalOnly: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(truncatedAttributes)) {
    if (CRITICAL_FIELDS.has(key)) {
      criticalOnly[key] = value;
    } else if (!truncatedFields.includes(key)) {
      truncatedFields.push(key);
    }
  }

  return {
    truncatedAttributes: criticalOnly,
    wasTruncated: true,
    truncatedFields,
    originalSize,
  };
}

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
        const logData: Record<string, unknown> = {
          session_id: log.attributes?.['session.id'],
          ...log.attributes,
          ...log.resource?.attributes,
          message: log.body,
        };

        const {
          truncatedAttributes,
          wasTruncated,
          truncatedFields,
          originalSize,
        } = truncateLargeAttributes(logData, GCP_LOG_ENTRY_SIZE_THRESHOLD);

        if (wasTruncated) {
          truncatedAttributes['_log_entry_truncated'] = true;
          truncatedAttributes['_original_size_bytes'] = originalSize;
          truncatedAttributes['_truncated_fields'] = truncatedFields.join(', ');
          truncatedAttributes['_truncated_size_bytes'] =
            calculateLogEntrySize(truncatedAttributes);

          if (process.env['DEBUG_MODE'] === 'true') {
            console.warn(
              `GCP log entry truncated: ${originalSize} bytes -> ${truncatedAttributes['_truncated_size_bytes']} bytes. Fields: ${truncatedFields.join(', ')}`,
            );
          }
        }

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
          truncatedAttributes,
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
