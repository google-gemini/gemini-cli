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

import { debugLogger } from '../utils/debugLogger.js';
import { safeJsonStringify } from '../utils/safeJsonStringify.js';
import {
  GEN_AI_AGENT_DESCRIPTION,
  GEN_AI_AGENT_NAME,
  GEN_AI_CONVERSATION_ID,
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OPERATION_NAME,
  GEN_AI_OUTPUT_MESSAGES,
  SERVICE_DESCRIPTION,
  SERVICE_NAME,
  type GeminiCliOperation,
} from './constants.js';

const TRACER_NAME = 'gemini-cli';
const TRACER_VERSION = 'v1';

/**
 * Registry used to ensure that spans are properly ended when their associated
 * async objects are garbage collected.
 */
export const spanRegistry = new FinalizationRegistry((endSpan: () => void) => {
  try {
    endSpan();
  } catch (e) {
    debugLogger.warn(
      'Error in FinalizationRegistry callback for span cleanup',
      e,
    );
  }
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isHasToJSON(value: unknown): value is { toJSON: () => unknown } {
  if (!isRecord(value)) return false;
  if (!('toJSON' in value)) return false;
  const toJSONFn = value['toJSON'];
  return typeof toJSONFn === 'function';
}

/**
 * Truncates a value for inclusion in telemetry attributes.
 *
 * @param value The value to truncate.
 * @param maxLength The maximum length of the stringified value.
 * @returns The truncated value, or undefined if the value type is not supported.
 */
export function truncateForTelemetry(
  value: unknown,
  maxStringLength = 10000,
  maxArrayLength = 100,
  maxDepth = 4,
  maxGlobalStringLength = 50000,
): AttributeValue | undefined {
  const truncateObj = (v: unknown, depth: number): unknown => {
    if (typeof v === 'string') {
      const graphemes = Array.from(v);
      if (graphemes.length > maxStringLength) {
        return (
          graphemes.slice(0, maxStringLength).join('') +
          `...[TRUNCATED: original length ${graphemes.length}]`
        );
      }
      return v;
    }
    if (
      typeof v === 'number' ||
      typeof v === 'boolean' ||
      v === null ||
      v === undefined
    ) {
      return v;
    }
    if (isHasToJSON(v)) {
      try {
        return truncateObj(v.toJSON(), depth);
      } catch {
        // Ignore and fall back to manual structural iteration
      }
    }
    if (typeof v === 'object') {
      if (depth >= maxDepth) {
        return `[TRUNCATED: Max Depth Reached]`;
      }
      if (Array.isArray(v)) {
        if (v.length > maxArrayLength) {
          const truncatedArray = v
            .slice(0, maxArrayLength)
            .map((item) => truncateObj(item, depth + 1));
          truncatedArray.push(`[TRUNCATED: Array of length ${v.length}]`);
          return truncatedArray;
        }
        return v.map((item) => truncateObj(item, depth + 1));
      }

      const newObj: Record<string, unknown> = {};
      let numKeys = 0;
      const MAX_KEYS = 100;
      const recordV = isRecord(v) ? v : {};
      for (const key in recordV) {
        if (!Object.prototype.hasOwnProperty.call(recordV, key)) continue;
        if (numKeys >= MAX_KEYS) {
          newObj['__truncated'] = `[TRUNCATED: Object with >${MAX_KEYS} keys]`;
          break;
        }
        try {
          const val = recordV[key];
          const truncatedKey =
            key.length > 100 ? key.slice(0, 100) + '...[TRUNCATED_KEY]' : key;
          newObj[truncatedKey] = truncateObj(val, depth + 1);
        } catch {
          newObj[key] = '[ERROR: Failed to read property]';
        }
        numKeys++;
      }
      return newObj;
    }
    return undefined;
  };

  const truncated = truncateObj(value, 0);

  if (
    typeof truncated === 'string' ||
    typeof truncated === 'number' ||
    typeof truncated === 'boolean'
  ) {
    return truncated as AttributeValue;
  }
  if (truncated === null || truncated === undefined) {
    return undefined;
  }

  const stringified = safeJsonStringify(truncated);

  if (stringified.length > maxGlobalStringLength) {
    const graphemes = Array.from(stringified);
    if (graphemes.length > maxGlobalStringLength) {
      return `"[TRUNCATED: Payload exceeded global limit of ${maxGlobalStringLength} characters. Original length: ${graphemes.length}]"`;
    }
  }

  return stringified as AttributeValue;
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
 * await runInDevTraceSpan(
 *   { operation: GeminiCliOperation.LLMCall, sessionId: 'my-session' },
 *   async ({ metadata }) => {
 *     metadata.input = { foo: 'bar' };
 *     // ... do work ...
 *     metadata.output = { result: 'baz' };
 *     metadata.attributes['my.custom.attribute'] = 'some-value';
 *   }
 * );
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
    sessionId: string;
  },
  fn: ({ metadata }: { metadata: SpanMetadata }) => Promise<R>,
): Promise<R> {
  const { operation, logPrompts, sessionId, ...restOfSpanOpts } = opts;

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
      if (spanEnded) {
        return;
      }
      spanEnded = true;
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
          } catch (e: unknown) {
            meta.error = e;
            throw e;
          } finally {
            endSpan();
          }
        })();

        const finalResult = Object.assign(streamWrapper, result);
        spanRegistry.register(finalResult, endSpan);
        return finalResult;
      }
      return result;
    } catch (e: unknown) {
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
