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

import { truncateString } from '../utils/textUtils.js';

const TRACER_NAME = 'gemini-cli';
const TRACER_VERSION = 'v1';

export function truncateForTelemetry(
  value: unknown,
  maxLength: number = 10000,
): AttributeValue | undefined {
  if (typeof value === 'string') {
    return truncateString(
      value,
      maxLength,
      `...[TRUNCATED: original length ${value.length}]`,
    );
  }
  if (typeof value === 'object' && value !== null) {
    const stringified = safeJsonStringify(value);
    return truncateString(
      stringified,
      maxLength,
      `...[TRUNCATED: original length ${stringified.length}]`,
    );
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  return undefined;
}

function isAsyncIterable<T>(value: T): value is T & AsyncIterable<unknown> {
  return (
    typeof value === 'object' && value !== null && Symbol.asyncIterator in value
  );
}

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
  opts: SpanOptions & { operation: GeminiCliOperation; logPrompts?: boolean },
  fn: ({ metadata }: { metadata: SpanMetadata }) => Promise<R>,
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

        return Object.assign(streamWrapper, result);
      }
      return result;
    } catch (e) {
      meta.error = e;
      throw e;
    } finally {
      if (!isStream) {
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
