/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GenerateContentResponse } from '@google/genai';
import { getCitations } from '../utils/generateContentResponseUtilities.js';
import {
  ActionStatus,
  type ConversationOffered,
  type StreamingLatency,
} from './types.js';

export function createConversationOffered(
  response: GenerateContentResponse,
  hasError: boolean,
  traceId: string,
  signal: AbortSignal | undefined,
  streamingLatency: StreamingLatency,
): ConversationOffered {
  return {
    citationCount: String(getCitations(response).length),
    includedCode: includesCode(response),
    status: getStatus(hasError, signal),
    traceId,
    streamingLatency,
    isAgentic: true,
  };
}

export function measureStreamingLatency(
  responses: AsyncGenerator<GenerateContentResponse>,
): {
  responses: AsyncGenerator<GenerateContentResponse>;
  streamingLatency: StreamingLatency;
} {
  const start = Date.now();

  const streamingLatency: StreamingLatency = {};

  async function* measureLatency(): AsyncGenerator<GenerateContentResponse> {
    let isFirst = true;
    try {
      for await (const response of responses) {
        if (isFirst) {
          isFirst = false;
          streamingLatency.firstMessageLatency = formatProtoJsonDuration(
            Date.now() - start,
          );
        }
        yield response;
      }
    } finally {
      streamingLatency.totalLatency = String(Date.now() - start);
    }
  }

  return { responses: measureLatency(), streamingLatency };
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
  hasError: boolean,
  signal: AbortSignal | undefined,
): ActionStatus {
  if (signal?.aborted) {
    return ActionStatus.ACTION_STATUS_CANCELLED;
  }

  if (hasError) {
    return ActionStatus.ACTION_STATUS_ERROR_UNKNOWN;
  }

  return ActionStatus.ACTION_STATUS_NO_ERROR;
}

export function formatProtoJsonDuration(milliseconds: number): string {
  return `${milliseconds / 1000}s`;
}
