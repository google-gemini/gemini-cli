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
import { truncateForTelemetry } from './truncate.js';
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
  opts: SpanOptions & { operation: GeminiCliOperation },
  fn: ({
    metadata,
  }: {
    metadata: SpanMetadata;
    endSpan: () => void;
  }) => Promise<R>,
): Promise<R> {
  const { operation, ...restOfSpanOpts } = opts;

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
    let spanEnded = false;
    const endSpan = () => {
      if (spanEnded) return;
      spanEnded = true;
      try {
        if (meta.input !== undefined) {
          const truncatedInput = truncateForTelemetry(meta.input);
          if (truncatedInput !== undefined) {
            span.setAttribute(GEN_AI_INPUT_MESSAGES, truncatedInput);
          }
        }
        if (meta.output !== undefined) {
          const truncatedOutput = truncateForTelemetry(meta.output);
          if (truncatedOutput !== undefined) {
            span.setAttribute(GEN_AI_OUTPUT_MESSAGES, truncatedOutput);
          }
        }
        for (const [key, value] of Object.entries(meta.attributes)) {
          const truncatedValue = truncateForTelemetry(value);
          if (truncatedValue !== undefined) {
            span.setAttribute(key, truncatedValue);
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

    let result: R;
    try {
      result = await fn({ metadata: meta, endSpan });
    } catch (e) {
      meta.error = e;
      endSpan();
      throw e;
    }

    // Auto-detect AsyncGenerators and wrap them to ensure endSpan is called
    // when iteration finishes or fails.
    if (
      result != null &&
      typeof result === 'object' &&
      Symbol.asyncIterator in result
    ) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const asyncIterable = result as unknown as AsyncIterable<unknown>;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      return (async function* () {
        try {
          yield* asyncIterable;
        } catch (e) {
          meta.error = e;
          throw e;
        } finally {
          endSpan();
        }
      })() as unknown as R;
    }

    endSpan();
    return result;
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
