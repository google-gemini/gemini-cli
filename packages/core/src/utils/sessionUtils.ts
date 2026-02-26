/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Part, type PartListUnion } from '@google/genai';
import { type ConversationRecord } from '../services/chatRecordingService.js';
import { partListUnionToString } from '../core/geminiRequest.js';
import { stableStringify } from '../policy/stable-stringify.js';

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

function incrementCount(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function consumeCount(map: Map<string, number>, key: string): boolean {
  const count = map.get(key);
  if (!count) {
    return false;
  }
  if (count === 1) {
    map.delete(key);
  } else {
    map.set(key, count - 1);
  }
  return true;
}

function getFunctionCallFingerprint(
  name: string | undefined,
  args: unknown,
): string {
  return `${name ?? ''}:${stableStringify(args ?? {})}`;
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
      const hasToolCalls = msg.toolCalls && msg.toolCalls.length > 0;

      if (hasToolCalls) {
        const modelParts: Part[] = [];
        const existingFunctionCallIds = new Map<string, number>();
        const existingFunctionCallFingerprints = new Map<string, number>();

        // Preserve original parts as source of truth. Some session records
        // duplicate function calls in both `content` and `toolCalls`; we only
        // append toolCalls that are not already represented in content.

        if (msg.content) {
          const existingParts = ensurePartArray(msg.content);
          modelParts.push(...existingParts);
          for (const part of existingParts) {
            if (!part.functionCall) {
              continue;
            }
            if (part.functionCall.id) {
              incrementCount(existingFunctionCallIds, part.functionCall.id);
            } else {
              incrementCount(
                existingFunctionCallFingerprints,
                getFunctionCallFingerprint(
                  part.functionCall.name,
                  part.functionCall.args,
                ),
              );
            }
          }
        }

        for (const toolCall of msg.toolCalls!) {
          if (
            toolCall.id &&
            consumeCount(existingFunctionCallIds, toolCall.id)
          ) {
            continue;
          }
          if (
            existingFunctionCallFingerprints.size > 0 &&
            consumeCount(
              existingFunctionCallFingerprints,
              getFunctionCallFingerprint(toolCall.name, toolCall.args),
            )
          ) {
            continue;
          }

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
