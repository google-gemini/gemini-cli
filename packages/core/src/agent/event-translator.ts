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

import type { FinishReason, Part } from '@google/genai';
import { GeminiEventType } from '../core/turn.js';
import type {
  ServerGeminiStreamEvent,
  StructuredError,
  GeminiFinishedEventValue,
} from '../core/turn.js';
import type {
  AgentEvent,
  ContentPart,
  StreamEndReason,
  ErrorData,
  Usage,
} from './types.js';

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

function makeEvent(
  type: AgentEvent['type'],
  state: TranslationState,
  payload: Partial<AgentEvent>,
): AgentEvent {
  const id = `${state.streamId}-${state.eventCounter++}`;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- constructing AgentEvent from common fields + payload
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
    out.push(makeEvent('stream_start', state, { streamId: state.streamId }));
    state.streamStartEmitted = true;
  }
}

/**
 * Converts @google/genai Part[] to ContentPart[].
 * Text parts become text ContentParts; inline data becomes media ContentParts.
 */
function mapResponseParts(parts: Part[]): ContentPart[] {
  const result: ContentPart[] = [];
  for (const part of parts) {
    if (part.text !== undefined) {
      result.push({ type: 'text', text: part.text });
    } else if (part.inlineData) {
      result.push({
        type: 'media',
        data: part.inlineData.data,
        mimeType: part.inlineData.mimeType,
      });
    }
  }
  return result;
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
      if (!state.streamStartEmitted) {
        out.push(
          makeEvent('stream_start', state, { streamId: state.streamId }),
        );
        state.streamStartEmitted = true;
      } else {
        out.push(makeEvent('session_update', state, { model: event.value }));
      }
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
        makeEvent('stream_end', state, {
          streamId: state.streamId,
          reason: 'aborted',
        }),
      );
      break;

    case GeminiEventType.MaxSessionTurns:
      ensureStreamStart(state, out);
      out.push(
        makeEvent('stream_end', state, {
          streamId: state.streamId,
          reason: 'max_turns',
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
        }),
      );
      out.push(
        makeEvent('stream_end', state, {
          streamId: state.streamId,
          reason: 'failed',
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
      if (event.value.systemMessage) {
        out.push(
          makeEvent('message', state, {
            role: 'agent',
            content: [{ type: 'text', text: event.value.systemMessage }],
          }),
        );
      }
      out.push(
        makeEvent('stream_end', state, {
          streamId: state.streamId,
          reason: 'completed',
        }),
      );
      break;

    case GeminiEventType.AgentExecutionBlocked:
      ensureStreamStart(state, out);
      out.push(
        makeEvent('error', state, {
          status: 'PERMISSION_DENIED',
          message: event.value.reason,
          fatal: false,
        }),
      );
      out.push(
        makeEvent('stream_end', state, {
          streamId: state.streamId,
          reason: 'failed',
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

    // Internal concerns — no AgentEvent emitted
    case GeminiEventType.ChatCompressed:
    case GeminiEventType.Retry:
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

    case GeminiEventType.ToolCallResponse:
      ensureStreamStart(state, out);
      out.push(
        makeEvent('tool_response', state, {
          requestId: event.value.callId,
          name: state.pendingToolNames.get(event.value.callId) ?? 'unknown',
          content: mapResponseParts(event.value.responseParts),
          isError: event.value.error !== undefined,
          ...(event.value.data ? { data: event.value.data } : {}),
        }),
      );
      state.pendingToolNames.delete(event.value.callId);
      break;

    case GeminiEventType.ToolCallConfirmation:
      // Skip — elicitations not needed for non-interactive mode
      break;

    default:
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
  ensureStreamStart(state, out);

  if (value.usageMetadata) {
    const usage = mapUsage(value.usageMetadata, state.model);
    out.push(makeEvent('usage', state, usage));
  }

  out.push(
    makeEvent('stream_end', state, {
      streamId: state.streamId,
      reason: mapFinishReason(value.reason),
    }),
  );
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
 * Maps a Gemini FinishReason to a StreamEndReason.
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
      return 'refusal';
    case 'MALFORMED_FUNCTION_CALL':
    case 'OTHER':
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
 */
export function mapError(error: unknown): ErrorData {
  if (isStructuredError(error)) {
    return {
      status: mapHttpToGrpcStatus(error.status),
      message: error.message,
      fatal: true,
    };
  }

  if (error instanceof Error) {
    return {
      status: 'INTERNAL',
      message: error.message,
      fatal: true,
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
