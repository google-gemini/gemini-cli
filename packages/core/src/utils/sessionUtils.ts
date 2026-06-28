/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Part, type PartListUnion } from '@google/genai';
import { type ConversationRecord } from '../services/chatRecordingService.js';
export { partListUnionToString } from '../core/geminiRequest.js';
import { partListUnionToString } from '../core/geminiRequest.js';
import { type HistoryTurn } from '../core/agentChatHistory.js';
import { deriveStableId } from './cryptoUtils.js';

/**
 * Ensures that all function calls and responses in a chat history have stable IDs.
 * If IDs are missing (e.g. legacy data or manually constructed tests), it synthesizes
 * them and MUTATES the underlying Part objects.
 *
 * It uses a deterministic pairing heuristic for adjacent turns to link calls and responses.
 */
export function ensureStableToolIds(history: HistoryTurn[]): void {
  for (let i = 0; i < history.length; i++) {
    const turn = history[i];
    const parts = turn.content.parts || [];

    for (let partIdx = 0; partIdx < parts.length; partIdx++) {
      const part = parts[partIdx];

      if (part.functionCall && !part.functionCall.id) {
        const name = part.functionCall.name;
        // Search ahead for a matching response in the next turn (common pattern)
        const nextTurn = history[i + 1];
        let pairedId: string | undefined;

        if (nextTurn?.content.role === 'user') {
          const matchingResp = nextTurn.content.parts?.find(
            (p) =>
              p.functionResponse &&
              p.functionResponse.name === name &&
              !p.functionResponse.id,
          );
          if (matchingResp) {
            pairedId = `synth_${name}_${deriveStableId([turn.id, i.toString(), partIdx.toString()])}`;
            part.functionCall.id = pairedId;
            matchingResp.functionResponse!.id = pairedId;
          }
        }

        if (!part.functionCall.id) {
          // If no pairing found, generate a solo synthetic ID
          part.functionCall.id = `synth_${name}_${deriveStableId([turn.id, i.toString(), partIdx.toString()])}`;
        }
      }

      if (part.functionResponse && !part.functionResponse.id) {
        // Orphaned response handling (search backward)
        const name = part.functionResponse.name;
        const prevTurn = history[i - 1];
        if (prevTurn?.content.role === 'model') {
          const matchingCall = prevTurn.content.parts?.find(
            (p) =>
              p.functionCall &&
              p.functionCall.name === name &&
              !p.functionCall.id,
          );
          if (matchingCall) {
            const pairedId = `synth_${name}_${deriveStableId([prevTurn.id, (i - 1).toString(), partIdx.toString()])}`;
            matchingCall.functionCall!.id = pairedId;
            part.functionResponse.id = pairedId;
          }
        }

        if (!part.functionResponse.id) {
          part.functionResponse.id = `synth_orph_${name}_${deriveStableId([turn.id, i.toString(), partIdx.toString()])}`;
        }
      }
    }
  }
}

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

export function isIgnoredUserContent(trimmedContent: string): boolean {
  return (
    trimmedContent.length === 0 ||
    trimmedContent.startsWith('/') ||
    trimmedContent.startsWith('?') ||
    trimmedContent.startsWith('<session_context>') ||
    trimmedContent.startsWith('<hook_context>')
  );
}

/**
 * Converts session/conversation data into Gemini client history formats.
 */
export function convertSessionToClientHistory(
  messages: ConversationRecord['messages'],
): HistoryTurn[] {
  const clientHistory: HistoryTurn[] = [];

  for (const msg of messages) {
    if (msg.type === 'info' || msg.type === 'error' || msg.type === 'warning') {
      continue;
    }

    if (msg.type === 'user') {
      const contentString = partListUnionToString(msg.content);
      const trimmedContent = contentString.trim();
      if (isIgnoredUserContent(trimmedContent)) {
        continue;
      }

      clientHistory.push({
        id: msg.id,
        content: {
          role: 'user',
          parts: ensurePartArray(msg.content),
        },
      });
    } else if (msg.type === 'gemini') {
      const modelParts: Part[] = [];

      const contentParts = msg.content ? ensurePartArray(msg.content) : [];
      const hasCallsInContent = contentParts.some((p) => !!p.functionCall);
      const hasThoughtsInContent = contentParts.some((p) => p.thought);

      if (hasCallsInContent || hasThoughtsInContent) {
        // Modern session: content is the source of truth for all parts
        modelParts.push(...contentParts);
      } else {
        // Legacy session: rebuild from components
        // 1. Add thoughts from metadata if present
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

        // 2. Add content (usually just text in legacy)
        modelParts.push(...contentParts);

        // 3. Add tool calls from metadata
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          for (const toolCall of msg.toolCalls) {
            modelParts.push({
              functionCall: {
                id: toolCall.id,
                name: toolCall.name,
                args: toolCall.args,
              },
            });
          }
        }
      }

      if (modelParts.length > 0) {
        clientHistory.push({
          id: msg.id,
          content: {
            role: 'model',
            parts: modelParts,
          },
        });

        // 4. Generate tool response turns
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          const functionResponseParts: Part[] = [];
          for (const toolCall of msg.toolCalls) {
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
              id: `${msg.id}_response`,
              content: {
                role: 'user',
                parts: functionResponseParts,
              },
            });
          }
        }
      }
    }
  }

  return clientHistory;
}
