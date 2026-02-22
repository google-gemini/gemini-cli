/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Part } from '@google/genai';
import { type ConversationRecord } from '../services/chatRecordingService.js';
import { partListUnionToString } from '../core/geminiRequest.js';

/**
 * Converts session/conversation data into Gemini client history formats.
 */
export function convertSessionToClientHistory(
  messages: ConversationRecord['messages'],
): Array<{ role: 'user' | 'model'; parts: Part[] }> {
  const clientHistory: Array<{ role: 'user' | 'model'; parts: Part[] }> = [];

  for (const msg of messages) {
    if (msg.type === 'info' || msg.type === 'error' || msg.type === 'warning') {
      continue;
    }

    if (msg.type === 'user') {
      const contentString = partListUnionToString(msg.content);
      if (
        contentString.trim().startsWith('/') ||
        contentString.trim().startsWith('?')
      ) {
        continue;
      }

      clientHistory.push({
        role: 'user',
        parts: Array.isArray(msg.content)
          ? // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
            (msg.content as Part[])
          : [{ text: contentString }],
      });
    } else if (msg.type === 'gemini') {
      const hasToolCalls = msg.toolCalls && msg.toolCalls.length > 0;

      if (hasToolCalls) {
        const modelParts: Part[] = [];
        const contentString = partListUnionToString(msg.content);
        if (msg.content && contentString.trim()) {
          modelParts.push({ text: contentString });
        }

        for (const toolCall of msg.toolCalls!) {
          modelParts.push({
            functionCall: {
              name: toolCall.name,
              args: toolCall.args,
              ...(toolCall.id && { id: toolCall.id }),
            },
          });
        }

        clientHistory.push({
          role: 'model',
          parts: modelParts,
        });

        const functionResponseParts: Part[] = [];
        for (const toolCall of msg.toolCalls!) {
          if (toolCall.result) {
            let responseData: Part;

            if (typeof toolCall.result === 'string') {
              responseData = {
                functionResponse: {
                  id: toolCall.id,
                  name: toolCall.name,
                  response: {
                    output: toolCall.result,
                  },
                },
              };
            } else if (Array.isArray(toolCall.result)) {
              // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
              functionResponseParts.push(...(toolCall.result as Part[]));
              continue;
            } else {
              responseData = toolCall.result;
            }

            functionResponseParts.push(responseData);
          }
        }

        if (functionResponseParts.length > 0) {
          clientHistory.push({
            role: 'user',
            parts: functionResponseParts,
          });
        }
      } else {
        const contentString = partListUnionToString(msg.content);
        if (msg.content && contentString.trim()) {
          clientHistory.push({
            role: 'model',
            parts: [{ text: contentString }],
          });
        }
      }
    }
  }

  return clientHistory;
}
