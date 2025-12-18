/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  diag,
  SpanStatusCode,
  trace,
  type AttributeValue,
  type SpanOptions,
} from '@opentelemetry/api';
import { safeJsonStringify } from '../utils/safeJsonStringify.js';

const TRACER_NAME = 'gemini-cli';
const TRACER_VERSION = 'v1';

/**
 * Metadata for a span.
 */
export interface SpanMetadata {
  /** The name of the span. */
  name: string;
  /** The input to the span. */
  input?: unknown;
  /** The output of the span. */
  output?: unknown;
  error?: unknown;
  /** Additional attributes for the span. */
  attributes: Record<string, AttributeValue>;
}

/**
 * Runs a function in a new OpenTelemetry span.
 *
 * The `meta` object will be automatically used to set the span's status and attributes upon completion.
 *
 * @example
 * ```typescript
 * runInDevTraceSpan({ name: 'my-operation' }, ({ metadata }) => {
 *   metadata.input = { foo: 'bar' };
 *   // ... do work ...
 *   metadata.output = { result: 'baz' };
 *   metadata.attributes['my.custom.attribute'] = 'some-value';
 * });
 * ```
 *
 * @param opts The options for the span.
 * @param fn The function to run in the span.
 * @returns The result of the function.
 */
export async function runInDevTraceSpan<R>(
  opts: SpanOptions & { name: string; noAutoEnd?: boolean },
  fn: ({
    metadata,
  }: {
    metadata: SpanMetadata;
    endSpan: () => void;
  }) => Promise<R>,
): Promise<R> {
  const { name: spanName, noAutoEnd, ...restOfSpanOpts } = opts;
  if (process.env['GEMINI_DEV_TRACING'] !== 'true') {
    // If GEMINI_DEV_TRACING env var not set, we do not trace.
    return fn({
      metadata: {
        name: spanName,
        attributes: {},
      },
      endSpan: () => {
        // noop
      },
    });
  }

  const tracer = trace.getTracer(TRACER_NAME, TRACER_VERSION);
  return tracer.startActiveSpan(opts.name, restOfSpanOpts, async (span) => {
    const meta: SpanMetadata = {
      name: spanName,
      attributes: {},
    };
    const endSpan = () => {
      try {
        if (meta.input !== undefined) {
          span.setAttribute('input-json', safeJsonStringify(meta.input));
        }
        if (meta.output !== undefined) {
          span.setAttribute('output-json', safeJsonStringify(meta.output));
        }
        for (const [key, value] of Object.entries(meta.attributes)) {
          span.setAttribute(key, value);
        }
        if (meta.error) {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: getErrorMessage(meta.error),
          });
          if (meta.error instanceof Error) {
            span.recordException(meta.error);
          }
        } else {
          span.setStatus({ code: SpanStatusCode.OK });
        }
      } catch (e) {
        // Log the error but don't rethrow, to ensure span.end() is called.
        diag.error('Error setting span attributes in endSpan', e);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: `Error in endSpan: ${getErrorMessage(e)}`,
        });
      } finally {
        span.end();
      }
    };
    try {
      return await fn({ metadata: meta, endSpan });
    } catch (e) {
      meta.error = e;
      if (noAutoEnd) {
        // For streaming operations, the delegated endSpan call will not be reached
        // on an exception, so we must end the span here to prevent a leak.
        endSpan();
      }
      throw e;
    } finally {
      if (!noAutoEnd) {
        // For non-streaming operations, this ensures the span is always closed,
        // and if an error occurred, it will be recorded correctly by endSpan.
        endSpan();
      }
    }
  });
}

/**
 * Gets the error message from an error object.
 *
 * @param e The error object.
 * @returns The error message.
 */
function getErrorMessage(e: unknown): string {
  if (e instanceof Error) {
    return e.message;
  }
  if (typeof e === 'string') {
    return e;
  }
  return safeJsonStringify(e);
}
