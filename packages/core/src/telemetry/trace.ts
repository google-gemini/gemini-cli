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
import { truncateString } from '../utils/textUtils.js';
import {
  type GeminiCliOperation,
  GEN_AI_AGENT_DESCRIPTION,
  GEN_AI_AGENT_NAME,
  GEN_AI_CONVERSATION_ID,
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OPERATION_NAME,
  GEN_AI_OUTPUT_MESSAGES,
  SERVICE_DESCRIPTION,
  SERVICE_NAME,
} from './constants.js';
import { sessionId } from '../utils/session.js';

const TRACER_NAME = 'gemini-cli';
const TRACER_VERSION = 'v1';

/**
 * Maximum character length for any single telemetry span attribute value.
 * Chosen to be safe for OTLP collectors (Jaeger, Zipkin, GCP Trace) while
 * remaining useful for debugging. With multiple attributes per span and
 * many concurrent spans, 10 KB per attribute prevents unbounded heap growth.
 */
const MAX_TELEMETRY_ATTR_LENGTH = 10_000;

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
 * Truncates a value for safe storage as an OpenTelemetry span attribute.
 * Handles strings, objects (via JSON serialization), and primitive types.
 * Uses grapheme-aware truncation via `truncateString` from textUtils to
 * safely handle Unicode surrogate pairs and multi-byte characters.
 *
 * @param value The value to truncate.
 * @param maxLength Maximum character length (defaults to MAX_TELEMETRY_ATTR_LENGTH).
 * @returns A bounded AttributeValue, or undefined if the value cannot be represented.
 */
export function truncateForTelemetry(
  value: unknown,
  maxLength: number = MAX_TELEMETRY_ATTR_LENGTH,
): AttributeValue | undefined {
  if (typeof value === 'string') {
    return truncateString(value, maxLength);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'object' && value !== null) {
    const stringified = safeJsonStringify(value);
    return truncateString(stringified, maxLength);
  }
  return undefined;
}

/**
 * Type guard for AsyncIterable values. Used to detect streaming responses
 * so that the span lifecycle can be bound to the stream's completion.
 */
function isAsyncIterable<T>(value: T): value is T & AsyncIterable<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Symbol.asyncIterator in (value as object)
  );
}

/**
 * Runs a function in a new OpenTelemetry span.
 *
 * The `meta` object will be automatically used to set the span's status and attributes upon completion.
 *
 * For streaming callers that return an AsyncIterable, the span lifecycle is
 * automatically bound to the stream: `endSpan()` runs in the generator's
 * `finally` block, ensuring the span is closed even if the stream is
 * abandoned mid-way (V8 finalizes suspended generators on GC).
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
  opts: SpanOptions & {
    operation: GeminiCliOperation;
    logPrompts?: boolean;
  },
  fn: ({
    metadata,
  }: {
    metadata: SpanMetadata;
  }) => Promise<R>,
): Promise<R> {
  const { operation, logPrompts, ...restOfSpanOpts } = opts;

  const tracer = trace.getTracer(TRACER_NAME, TRACER_VERSION);
  return tracer.startActiveSpan(operation, restOfSpanOpts, async (span) => {
    const meta: SpanMetadata = {
      name: operation,
      attributes: {
        [GEN_AI_OPERATION_NAME]: operation,
        [GEN_AI_AGENT_NAME]: SERVICE_NAME,
        [GEN_AI_AGENT_DESCRIPTION]: SERVICE_DESCRIPTION,
        [GEN_AI_CONVERSATION_ID]: sessionId,
      },
    };
    const endSpan = () => {
      try {
        // Only attach input/output prompt data when user has not opted out.
        if (logPrompts !== false) {
          if (meta.input !== undefined) {
            const truncated = truncateForTelemetry(meta.input);
            if (truncated !== undefined) {
              span.setAttribute(GEN_AI_INPUT_MESSAGES, truncated);
            }
          }
          if (meta.output !== undefined) {
            const truncated = truncateForTelemetry(meta.output);
            if (truncated !== undefined) {
              span.setAttribute(GEN_AI_OUTPUT_MESSAGES, truncated);
            }
          }
        }
        // Truncate ALL custom attributes to prevent unbounded memory growth.
        for (const [key, value] of Object.entries(meta.attributes)) {
          const truncated = truncateForTelemetry(value);
          if (truncated !== undefined) {
            span.setAttribute(key, truncated);
          }
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

    let isStream = false;
    try {
      const result = await fn({ metadata: meta });

      // If the result is an AsyncIterable (streaming response), wrap it
      // in a self-contained generator whose `finally` block always calls
      // `endSpan()`. This eliminates the V8 closure leak: even if the
      // consumer abandons the stream, V8 will finalize the generator on
      // GC and execute the `finally` block, releasing `meta` and `span`.
      if (isAsyncIterable(result)) {
        isStream = true;
        const streamWrapper = (async function* () {
          try {
            yield* result;
          } catch (e) {
            meta.error = e;
            throw e;
          } finally {
            endSpan();
          }
        })();
        // Preserve any extra properties on the original iterable (e.g.
        // abort methods, response metadata) so callers see the same shape.
        return Object.assign(streamWrapper, result) as R;
      }

      return result;
    } catch (e) {
      meta.error = e;
      throw e;
    } finally {
      if (!isStream) {
        // For non-streaming paths, always close the span in finally.
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
