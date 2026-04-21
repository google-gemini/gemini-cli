/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Part, type PartListUnion } from '@google/genai';
import { type ConversationRecord } from '../services/chatRecordingService.js';
import { partListUnionToString } from '../core/geminiRequest.js';

/**
 * Converts a PartListUnion into a normalized array of Part objects.
 * This handles converting raw strings into { text: string } parts.
 */
function ensurePartArray(content: PartListUnion): Part[] {
  if (Array.isArray(content)) {
    return content.map((part) =>
      typeof part === 'string' ? { text: part } : part,
    );
  }
  if (typeof content === 'string') {
    return [{ text: content }];
  }
  return [content];
}

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
        parts: ensurePartArray(msg.content),
      });
    } else if (msg.type === 'gemini') {
      const modelParts: Part[] = [];

      // Add thoughts if present
      if (msg.thoughts && msg.thoughts.length > 0) {
        for (const thought of msg.thoughts) {
          const thoughtText = thought.subject
            ? `**${thought.subject}** ${thought.description}`
            : thought.description;
          modelParts.push({
            text: thoughtText,
            thought: true,
          } as Part);
        }
      }

      const hasToolCalls = msg.toolCalls && msg.toolCalls.length > 0;

      if (hasToolCalls) {
        // Preserve original parts to maintain multimodal integrity
        if (msg.content) {
          modelParts.push(...ensurePartArray(msg.content));
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
          let responseData: Part;

          if (toolCall.result) {
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
              // Ensure we only take the first part if it's an array,
              // or handle multimodal nesting if present.
              // Our fixed convertToFunctionResponse now returns [part].
              const parts = ensurePartArray(toolCall.result);
              responseData = parts[0];

              // If for some reason there were siblings in old data, we must ignore them
              // to maintain the 1:1 part count.
            } else {
              responseData = toolCall.result;
            }
          } else {
            // Provide a placeholder if result is missing to preserve part count
            responseData = {
              functionResponse: {
                id: toolCall.id,
                name: toolCall.name,
                response: {
                  error: 'Tool execution result not recorded.',
                },
              },
            };
          }

          functionResponseParts.push(responseData);
        }

        if (functionResponseParts.length > 0) {
          clientHistory.push({
            role: 'user',
            parts: functionResponseParts,
          });
        }
      } else {
        if (msg.content) {
          modelParts.push(...ensurePartArray(msg.content));
        }

        if (modelParts.length > 0) {
          clientHistory.push({
            role: 'model',
            parts: modelParts,
          });
        }
      }
    }
  }

  return clientHistory;
}
