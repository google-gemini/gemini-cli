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
 *
 * If the messages contain compression markers (recorded when context compression
 * occurs), the last marker's compressedHistory is used as the base, and only
 * messages after that marker are converted. This ensures resumed sessions
 * reconstruct the compressed state rather than replaying the full uncompressed
 * history.
 */
export function convertSessionToClientHistory(
  messages: ConversationRecord['messages'],
): Array<{ role: 'user' | 'model'; parts: Part[] }> {
  const clientHistory: Array<{ role: 'user' | 'model'; parts: Part[] }> = [];

  // Find the last compression marker to determine the resume boundary.
  let lastCompressionMarkerIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].type === 'compression_marker') {
      lastCompressionMarkerIndex = i;
      break;
    }
  }

  // If a compression marker exists, use its compressed history as the base
  // and only process messages that came after it.
  if (lastCompressionMarkerIndex >= 0) {
    const marker = messages[lastCompressionMarkerIndex];
    if (marker.type === 'compression_marker') {
      for (const entry of marker.compressedHistory) {
        clientHistory.push({
          role: entry.role === 'model' ? 'model' : 'user',
          parts: entry.parts ? ensurePartArray(entry.parts) : [],
        });
      }
    }
  }

  // Process messages after the compression marker (or all messages if no marker).
  const startIndex = lastCompressionMarkerIndex + 1;
  for (let i = startIndex; i < messages.length; i++) {
    const msg = messages[i];
    if (
      msg.type === 'info' ||
      msg.type === 'error' ||
      msg.type === 'warning' ||
      msg.type === 'compression_marker'
    ) {
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
      const hasToolCalls = msg.toolCalls && msg.toolCalls.length > 0;

      if (hasToolCalls) {
        const modelParts: Part[] = [];

        // TODO: Revisit if we should preserve more than just Part metadata (e.g. thoughtSignatures)
        // currently those are only required within an active loop turn which resume clears
        // by forcing a new user text prompt.

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
              functionResponseParts.push(...ensurePartArray(toolCall.result));
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
        if (msg.content) {
          const parts = ensurePartArray(msg.content);

          if (parts.length > 0) {
            clientHistory.push({
              role: 'model',
              parts,
            });
          }
        }
      }
    }
  }

  return clientHistory;
}
