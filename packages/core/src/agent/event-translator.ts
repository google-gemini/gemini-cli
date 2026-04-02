/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Pure, stateless-per-call translation functions that convert
 * ServerGeminiStreamEvent objects into AgentEvent objects.
 *
 * No side effects, no generators. Each call to `translateEvent` takes an event
 * and mutable TranslationState, returning zero or more AgentEvents.
 */

import type { FinishReason } from '@google/genai';
import { GeminiEventType } from '../core/turn.js';
import type {
  ServerGeminiStreamEvent,
  StructuredError,
  GeminiFinishedEventValue,
} from '../core/turn.js';
import type {
  AgentEvent,
  StreamEndReason,
  ErrorData,
  Usage,
  AgentEventType,
} from './types.js';
import {
  geminiPartsToContentParts,
  toolResultDisplayToContentParts,
  buildToolResponseData,
} from './content-utils.js';

// ---------------------------------------------------------------------------
// Translation State
// ---------------------------------------------------------------------------

export interface TranslationState {
  streamId: string;
  streamStartEmitted: boolean;
  model: string | undefined;
  eventCounter: number;
  /** Tracks callId → tool name from requests so responses can reference the name. */
  pendingToolNames: Map<string, string>;
}

export function createTranslationState(streamId?: string): TranslationState {
  return {
    streamId: streamId ?? crypto.randomUUID(),
    streamStartEmitted: false,
    model: undefined,
    eventCounter: 0,
    pendingToolNames: new Map(),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent<T extends AgentEventType>(
  type: T,
  state: TranslationState,
  payload: Partial<AgentEvent<T>>,
): AgentEvent {
  const id = `${state.streamId}-${state.eventCounter++}`;
  // TypeScript cannot preserve the specific discriminated union member across
  // this generic object assembly, so keep the narrowing local to the event
  // constructor boundary.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  return {
    ...payload,
    id,
    timestamp: new Date().toISOString(),
    streamId: state.streamId,
    type,
  } as AgentEvent;
}

function ensureStreamStart(state: TranslationState, out: AgentEvent[]): void {
  if (!state.streamStartEmitted) {
    out.push(makeEvent('agent_start', state, {}));
    state.streamStartEmitted = true;
  }
}

// ---------------------------------------------------------------------------
// Core Translator
// ---------------------------------------------------------------------------

/**
 * Translates a single ServerGeminiStreamEvent into zero or more AgentEvents.
 * Mutates `state` (counter, flags) as a side effect.
 */
export function translateEvent(
  event: ServerGeminiStreamEvent,
  state: TranslationState,
): AgentEvent[] {
  const out: AgentEvent[] = [];

  switch (event.type) {
    case GeminiEventType.ModelInfo:
      state.model = event.value;
      ensureStreamStart(state, out);
      out.push(makeEvent('session_update', state, { model: event.value }));
      break;

    case GeminiEventType.Content:
      ensureStreamStart(state, out);
      out.push(
        makeEvent('message', state, {
          role: 'agent',
          content: [{ type: 'text', text: event.value }],
        }),
      );
      break;

    case GeminiEventType.Thought:
      ensureStreamStart(state, out);
      out.push(
        makeEvent('message', state, {
          role: 'agent',
          content: [{ type: 'thought', thought: event.value.description }],
          _meta: event.value.subject
            ? { source: 'agent', subject: event.value.subject }
            : { source: 'agent' },
        }),
      );
      break;

    case GeminiEventType.Citation:
      ensureStreamStart(state, out);
      out.push(
        makeEvent('message', state, {
          role: 'agent',
          content: [{ type: 'text', text: event.value }],
          _meta: { source: 'agent', citation: true },
        }),
      );
      break;

    case GeminiEventType.Finished:
      handleFinished(event.value, state, out);
      break;

    case GeminiEventType.Error:
      handleError(event.value.error, state, out);
      break;

    case GeminiEventType.UserCancelled:
      ensureStreamStart(state, out);
      out.push(
        makeEvent('agent_end', state, {
          reason: 'aborted',
        }),
      );
      break;

    case GeminiEventType.MaxSessionTurns:
      ensureStreamStart(state, out);
      out.push(
        makeEvent('agent_end', state, {
          reason: 'max_turns',
          data: {
            code: 'MAX_TURNS_EXCEEDED',
          },
        }),
      );
      break;

    case GeminiEventType.LoopDetected:
      ensureStreamStart(state, out);
      out.push(
        makeEvent('error', state, {
          status: 'INTERNAL',
          message: 'Loop detected, stopping execution',
          fatal: false,
          _meta: { code: 'LOOP_DETECTED' },
        }),
      );
      break;

    case GeminiEventType.ContextWindowWillOverflow:
      ensureStreamStart(state, out);
      out.push(
        makeEvent('error', state, {
          status: 'RESOURCE_EXHAUSTED',
          message: `Context window will overflow (estimated: ${event.value.estimatedRequestTokenCount}, remaining: ${event.value.remainingTokenCount})`,
          fatal: true,
        }),
      );
      break;

    case GeminiEventType.AgentExecutionStopped:
      ensureStreamStart(state, out);
      out.push(
        makeEvent('agent_end', state, {
          reason: 'completed',
          data: {
            message: event.value.systemMessage?.trim() || event.value.reason,
          },
        }),
      );
      break;

    case GeminiEventType.AgentExecutionBlocked:
      ensureStreamStart(state, out);
      out.push(
        makeEvent('error', state, {
          status: 'PERMISSION_DENIED',
          message: `Agent execution blocked: ${event.value.systemMessage?.trim() || event.value.reason}`,
          fatal: false,
          _meta: { code: 'AGENT_EXECUTION_BLOCKED' },
        }),
      );
      break;

    case GeminiEventType.InvalidStream:
      ensureStreamStart(state, out);
      out.push(
        makeEvent('error', state, {
          status: 'INTERNAL',
          message: 'Invalid stream received from model',
          fatal: true,
        }),
      );
      break;

    case GeminiEventType.ToolCallRequest:
      ensureStreamStart(state, out);
      state.pendingToolNames.set(event.value.callId, event.value.name);
      out.push(
        makeEvent('tool_request', state, {
          requestId: event.value.callId,
          name: event.value.name,
          args: event.value.args,
        }),
      );
      break;

    case GeminiEventType.ToolCallResponse: {
      ensureStreamStart(state, out);
      const displayContent = toolResultDisplayToContentParts(
        event.value.resultDisplay,
      );
      const data = buildToolResponseData(event.value);
      out.push(
        makeEvent('tool_response', state, {
          requestId: event.value.callId,
          name: state.pendingToolNames.get(event.value.callId) ?? 'unknown',
          content: event.value.error
            ? [{ type: 'text', text: event.value.error.message }]
            : geminiPartsToContentParts(event.value.responseParts),
          isError: event.value.error !== undefined,
          ...(displayContent ? { displayContent } : {}),
          ...(data ? { data } : {}),
        }),
      );
      state.pendingToolNames.delete(event.value.callId);
      break;
    }

    case GeminiEventType.ToolCallConfirmation:
      // Elicitations are handled separately by the session layer
      break;

    // Internal concerns — no AgentEvent emitted
    case GeminiEventType.ChatCompressed:
    case GeminiEventType.Retry:
      break;

    default:
      ((x: never) => {
        throw new Error(`Unhandled event type: ${JSON.stringify(x)}`);
      })(event);
      break;
  }

  return out;
}

// ---------------------------------------------------------------------------
// Finished Event Handling
// ---------------------------------------------------------------------------

function handleFinished(
  value: GeminiFinishedEventValue,
  state: TranslationState,
  out: AgentEvent[],
): void {
  if (value.usageMetadata) {
    ensureStreamStart(state, out);
    const usage = mapUsage(value.usageMetadata, state.model);
    out.push(makeEvent('usage', state, usage));
  }
}

// ---------------------------------------------------------------------------
// Error Handling
// ---------------------------------------------------------------------------

function handleError(
  error: unknown,
  state: TranslationState,
  out: AgentEvent[],
): void {
  ensureStreamStart(state, out);

  const mapped = mapError(error);
  out.push(makeEvent('error', state, mapped));
}

// ---------------------------------------------------------------------------
// Public Mapping Functions
// ---------------------------------------------------------------------------

/**
 * Maps a Gemini FinishReason to an AgentEnd reason.
 */
export function mapFinishReason(
  reason: FinishReason | undefined,
): StreamEndReason {
  if (!reason) return 'completed';

  switch (reason) {
    case 'STOP':
    case 'FINISH_REASON_UNSPECIFIED':
      return 'completed';
    case 'MAX_TOKENS':
      return 'max_budget';
    case 'SAFETY':
    case 'RECITATION':
    case 'LANGUAGE':
    case 'BLOCKLIST':
    case 'PROHIBITED_CONTENT':
    case 'SPII':
    case 'IMAGE_SAFETY':
    case 'IMAGE_PROHIBITED_CONTENT':
      return 'refusal';
    case 'MALFORMED_FUNCTION_CALL':
    case 'OTHER':
    case 'UNEXPECTED_TOOL_CALL':
    case 'NO_IMAGE':
      return 'failed';
    default:
      return 'failed';
  }
}

/**
 * Maps an HTTP status code to a gRPC-style status string.
 */
export function mapHttpToGrpcStatus(
  httpStatus: number | undefined,
): ErrorData['status'] {
  if (httpStatus === undefined) return 'INTERNAL';

  switch (httpStatus) {
    case 400:
      return 'INVALID_ARGUMENT';
    case 401:
      return 'UNAUTHENTICATED';
    case 403:
      return 'PERMISSION_DENIED';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'ALREADY_EXISTS';
    case 429:
      return 'RESOURCE_EXHAUSTED';
    case 500:
      return 'INTERNAL';
    case 501:
      return 'UNIMPLEMENTED';
    case 503:
      return 'UNAVAILABLE';
    case 504:
      return 'DEADLINE_EXCEEDED';
    default:
      return 'INTERNAL';
  }
}

/**
 * Maps a StructuredError (or unknown error value) to an ErrorData payload.
 * Preserves selected error metadata in _meta and includes raw structured
 * errors for lossless debugging.
 */
export function mapError(
  error: unknown,
): ErrorData & { _meta?: Record<string, unknown> } {
  const meta: Record<string, unknown> = {};

  if (error instanceof Error) {
    meta['errorName'] = error.constructor.name;
    if ('exitCode' in error && typeof error.exitCode === 'number') {
      meta['exitCode'] = error.exitCode;
    }
    if ('code' in error) {
      meta['code'] = error.code;
    }
  }

  if (isStructuredError(error)) {
    const structuredMeta = { ...meta, rawError: error, status: error.status };
    return {
      status: mapHttpToGrpcStatus(error.status),
      message: error.message,
      fatal: true,
      _meta: structuredMeta,
    };
  }

  if (error instanceof Error) {
    return {
      status: 'INTERNAL',
      message: error.message,
      fatal: true,
      ...(Object.keys(meta).length > 0 ? { _meta: meta } : {}),
    };
  }

  return {
    status: 'INTERNAL',
    message: String(error),
    fatal: true,
  };
}

function isStructuredError(error: unknown): error is StructuredError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  );
}

/**
 * Maps Gemini usageMetadata to Usage.
 */
export function mapUsage(
  metadata: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    cachedContentTokenCount?: number;
  },
  model?: string,
): Usage {
  return {
    model: model ?? 'unknown',
    inputTokens: metadata.promptTokenCount,
    outputTokens: metadata.candidatesTokenCount,
    cachedTokens: metadata.cachedContentTokenCount,
  };
}
