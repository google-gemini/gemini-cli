/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { FinishReason, type GenerateContentResponse } from '@google/genai';
import { getCitations } from '../utils/generateContentResponseUtilities.js';
import {
  ActionStatus,
  type ConversationOffered,
  type StreamingLatency,
} from './types.js';

export function createConversationOffered(
  response: GenerateContentResponse,
  traceId: string,
  signal: AbortSignal | undefined,
  streamingLatency: StreamingLatency,
): ConversationOffered {
  const actionStatus = getStatus(response, signal);

  return {
    citationCount: String(getCitations(response).length),
    includedCode: includesCode(response),
    status: actionStatus,
    traceId,
    streamingLatency,
    isAgentic: true,
  };
}

function includesCode(resp: GenerateContentResponse): boolean {
  if (!resp.candidates) {
    return false;
  }
  for (const candidate of resp.candidates) {
    if (!candidate.content || !candidate.content.parts) {
      continue;
    }
    for (const part of candidate.content.parts) {
      if ('text' in part && part?.text?.includes('```')) {
        return true;
      }
    }
  }
  return false;
}

function getStatus(
  response: GenerateContentResponse,
  signal: AbortSignal | undefined,
): ActionStatus {
  if (signal?.aborted) {
    return ActionStatus.ACTION_STATUS_CANCELLED;
  }

  if (hasError(response)) {
    return ActionStatus.ACTION_STATUS_ERROR_UNKNOWN;
  }

  if ((response.candidates?.length ?? 0) <= 0) {
    return ActionStatus.ACTION_STATUS_EMPTY;
  }

  return ActionStatus.ACTION_STATUS_NO_ERROR;
}

export function formatProtoJsonDuration(milliseconds: number): string {
  return `${milliseconds / 1000}s`;
}

function hasError(response: GenerateContentResponse): boolean {
  // Non-OK SDK results should be considered an error.
  if (
    response.sdkHttpResponse &&
    !response.sdkHttpResponse?.responseInternal?.ok
  ) {
    return true;
  }

  for (const candidate of response.candidates || []) {
    // Treat sanitization, SPII, recitation, and forbidden terms as an error.
    if (
      candidate.finishReason &&
      candidate.finishReason !== FinishReason.STOP &&
      candidate.finishReason !== FinishReason.MAX_TOKENS
    ) {
      return true;
    }
  }
  return false;
}
