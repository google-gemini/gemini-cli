/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { FinishReason, type GenerateContentResponse } from '@google/genai';
import { getCitations } from '../utils/generateContentResponseUtilities.js';
import {
  ActionStatus,
  ConversationInteractionInteraction,
  InitiationMethod,
  type ConversationInteraction,
  type ConversationOffered,
  type StreamingLatency,
} from './types.js';
import type { CompletedToolCall } from '../core/coreToolScheduler.js';
import type { Config } from '../config/config.js';
import { debugLogger } from '../utils/debugLogger.js';
import { getCodeAssistServer } from './codeAssist.js';
import { EDIT_TOOL_NAMES } from '../tools/tool-names.js';
import { getErrorMessage } from '../utils/errors.js';
import type { CodeAssistServer } from './server.js';
import { ToolConfirmationOutcome } from '../tools/tools.js';

export async function recordConversationOffered(
  server: CodeAssistServer,
  traceId: string | undefined,
  response: GenerateContentResponse,
  streamingLatency: StreamingLatency,
  abortSignal: AbortSignal | undefined,
): Promise<void> {
  try {
    if (traceId) {
      const offered = createConversationOffered(
        response,
        traceId,
        abortSignal,
        streamingLatency,
      );
      if (offered) {
        await server.recordConversationOffered(offered);
      }
    }
  } catch (error: unknown) {
    debugLogger.warn(
      `Error recording tool call interactions: ${getErrorMessage(error)}`,
    );
  }
}

export async function recordToolCallInteractions(
  config: Config,
  toolCalls: CompletedToolCall[],
): Promise<void> {
  // Only send interaction events for responses that contain function calls.
  if (toolCalls.length === 0) {
    return;
  }

  try {
    const server = getCodeAssistServer(config);
    if (!server) {
      return;
    }

    const interaction = summarizeToolCalls(toolCalls);
    if (interaction) {
      await server.recordConversationInteraction(interaction);
    }
  } catch (error: unknown) {
    debugLogger.warn(
      `Error recording tool call interactions: ${getErrorMessage(error)}`,
    );
  }
}

export function createConversationOffered(
  response: GenerateContentResponse,
  traceId: string,
  signal: AbortSignal | undefined,
  streamingLatency: StreamingLatency,
): ConversationOffered | undefined {
  // Only send conversation offered events for responses that contain function
  // calls. Non-function call events don't represent user actionable
  // 'suggestions'.
  if ((response.functionCalls?.length || 0) === 0) {
    return;
  }

  const actionStatus = getStatusFromResponse(response, signal);

  return {
    citationCount: String(getCitations(response).length),
    includedCode: includesCode(response),
    status: actionStatus,
    traceId,
    streamingLatency,
    isAgentic: true,
    initiationMethod: InitiationMethod.COMMAND,
  };
}

function summarizeToolCalls(
  toolCalls: CompletedToolCall[],
): ConversationInteraction | undefined {
  let acceptedToolCalls = 0;
  let actionStatus = undefined;
  let traceId = undefined;

  // Treat file edits as ACCEPT_FILE and everything else as unknown.
  let isEdit = false;

  // Iterate the tool calls and summarize them into a single conversation
  // interaction so that the ConversationOffered and ConversationInteraction
  // events are 1:1 in telemetry.
  for (const toolCall of toolCalls) {
    traceId ||= toolCall.request.traceId;

    // If any tool call is canceled, we treat the entire interaction as canceled.
    if (toolCall.status === 'cancelled') {
      actionStatus = ActionStatus.ACTION_STATUS_CANCELLED;
      break;
    }

    // If any tool call encounters an error, we treat the entire interaction as
    // having errored.
    if (toolCall.status === 'error') {
      actionStatus = ActionStatus.ACTION_STATUS_ERROR_UNKNOWN;
      break;
    }

    // Record if the tool call was accepted.
    if (toolCall.outcome !== ToolConfirmationOutcome.Cancel) {
      acceptedToolCalls++;

      // Edits are ACCEPT_FILE, everything else is UNKNOWN.
      if (EDIT_TOOL_NAMES.has(toolCall.request.name)) {
        isEdit ||= true;
      }
    }
  }

  // Only file interaction telemetry if 100% of the tool calls were accepted.
  return traceId && acceptedToolCalls / toolCalls.length >= 1
    ? createConversationInteraction(
        traceId,
        actionStatus || ActionStatus.ACTION_STATUS_NO_ERROR,
        isEdit
          ? ConversationInteractionInteraction.ACCEPT_FILE
          : ConversationInteractionInteraction.UNKNOWN,
      )
    : undefined;
}

function createConversationInteraction(
  traceId: string,
  status: ActionStatus,
  interaction: ConversationInteractionInteraction,
): ConversationInteraction {
  return {
    traceId,
    status,
    interaction,
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

function getStatusFromResponse(
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
