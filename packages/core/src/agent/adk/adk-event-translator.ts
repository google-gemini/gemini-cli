/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  AgentEvent,
  AgentEventType,
  ContentPart,
  ElicitationResponse,
  ToolRequest,
} from '../types.js';
import type { ToolResultDisplay } from '../../tools/tools.js';
import type { Event as AdkEvent } from '@google/adk';
import { REQUEST_CONFIRMATION_FUNCTION_CALL_NAME } from '@google/adk';
import type { Part as GenAIPart } from '@google/genai';
import { buildToolResponseData } from '../content-utils.js';
import { toolResultDisplayToDisplayContent } from '../tool-display-utils.js';

function makeEvent<T extends AgentEventType>(
  type: T,
  payload: Partial<AgentEvent<T>>,
): AgentEvent {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  return {
    ...payload,
    type,
  } as AgentEvent;
}

export function translateEvent(event: AdkEvent): AgentEvent[] {
  if (!event.content?.parts?.length) {
    return [];
  }

  const result: AgentEvent[] = [];

  if (event.author === 'user') {
    for (const part of event.content.parts) {
      if (part.text) {
        result.push(
          makeEvent('message', {
            role: 'user',
            content: [{ type: 'text', text: part.text }],
          }),
        );
      }
    }

    return result;
  }

  for (const part of event.content.parts) {
    // Agent text
    if (part.text && !part.thought) {
      result.push(
        makeEvent('message', {
          role: 'agent',
          content: [{ type: 'text', text: part.text }],
        }),
      );

      continue;
    }

    // Agent thinking text
    if (part.text && part.thought) {
      const content: ContentPart[] = [];

      if (part.text) {
        content.push({ type: 'thought', thought: part.text });
      }

      result.push(
        makeEvent('message', {
          role: 'agent',
          content,
        }),
      );

      continue;
    }

    // Agent inline data
    if (part.inlineData) {
      result.push(
        makeEvent('message', {
          role: 'agent',
          content: [
            {
              type: 'media',
              data: part.inlineData.data,
              mimeType: part.inlineData.mimeType,
            },
          ],
        }),
      );

      continue;
    }

    // Tool execution call
    if (
      part.functionCall &&
      part.functionCall.name !== REQUEST_CONFIRMATION_FUNCTION_CALL_NAME
    ) {
      const functionId = part.functionCall.id;
      if (!functionId) {
        continue;
      }

      result.push(
        makeEvent('tool_request', {
          requestId: functionId,
          name: part.functionCall.name!,
          args: part.functionCall.args ?? {},
        }),
      );

      continue;
    }

    // Tool execution success/failure response
    if (
      part.functionResponse &&
      part.functionResponse.id &&
      !event.actions.requestedToolConfirmations[part.functionResponse.id]
    ) {
      const functionId = part.functionResponse.id;
      const response = part.functionResponse.response;
      if (response) {
        const functionResponse = response as {
          data?: Record<string, unknown>;
          error?: {
            message?: string;
            code?: number;
          };
          errorType?: string;
          outputFile?: string;
          contentLength?: number;
          llmContent?: string;
          display?: ToolResultDisplay;
          returnDisplay?: ToolResultDisplay;
        };
        const isError = !!functionResponse.error;
        const content: ContentPart[] = functionResponse.llmContent
          ? [{ type: 'text', text: functionResponse.llmContent }]
          : [];
        const errorContent: ContentPart[] = functionResponse.error?.message
          ? [{ type: 'text', text: functionResponse.error.message }]
          : [];
        const functionResultDisplay =
          functionResponse.display ?? functionResponse.returnDisplay;
        result.push(
          makeEvent('tool_response', {
            requestId: functionId,
            name: part.functionResponse.name,
            isError,
            content: isError ? errorContent : content,
            display: functionResultDisplay
              ? {
                  result: toolResultDisplayToDisplayContent(
                    functionResultDisplay,
                  ),
                }
              : undefined,
            data: buildToolResponseData(functionResponse),
          }),
        );
      }

      continue;
    }

    // Tool execution confirmation request
    if (
      part.functionResponse &&
      part.functionResponse.id &&
      event.actions.requestedToolConfirmations[part.functionResponse.id]
    ) {
      const functionId = part.functionResponse.id;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const functionResponse = part.functionResponse.response as {
        display?: 'inline' | 'modal';
        title?: string;
        message?: string;
        schema?: Record<string, unknown>;
      };

      result.push(
        makeEvent('elicitation_request', {
          requestId: functionId,
          display: functionResponse.display || 'inline',
          title: functionResponse.title || '',
          message: functionResponse.message || '',
          requestedSchema: functionResponse.schema || {},
        }),
      );

      continue;
    }
  }

  return result;
}

export function elicitationToAdkToolConfirmation(
  response: ElicitationResponse,
  agentEvents: AgentEvent[],
): GenAIPart {
  const toolRequestEvent = agentEvents.find(
    (event) =>
      event.type === 'tool_request' && event.requestId === response.requestId,
  );
  if (!toolRequestEvent) {
    throw new Error(
      `Tool request not found for request id: ${response.requestId}`,
    );
  }

  return {
    functionResponse: {
      id: response.requestId,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      name: (toolRequestEvent as ToolRequest).name,
      response: {
        accepted: response.action === 'accept',
        declined: response.action === 'decline',
        cancelled: response.action === 'cancel',
        content: response.content,
      },
    },
  };
}
