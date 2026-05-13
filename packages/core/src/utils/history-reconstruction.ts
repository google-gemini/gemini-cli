/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content, Part } from '@google/genai';
import type { MessageRecord } from '../services/chatRecordingTypes.js';

/**
 * Reconstructs the model-compatible history array from rich message records.
 * This allows us to treat MessageRecord as the source of truth and generate
 * the API-specific Content array on-the-fly.
 */
export function reconstructHistory(messages: MessageRecord[]): Content[] {
  const history: Content[] = [];

  for (const msg of messages) {
    const parts: Part[] = [];
    if (Array.isArray(msg.content)) {
      // Map PartUnion to Part
      for (const p of msg.content) {
        if (typeof p === 'string') {
          parts.push({ text: p });
        } else {
          parts.push(p);
        }
      }
    } else if (typeof msg.content === 'string') {
      parts.push({ text: msg.content });
    }

    if (msg.type === 'user') {
      history.push({ role: 'user', parts });
    } else if (msg.type === 'gemini') {
      // 1. Add model-generated tool calls if present
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        msg.toolCalls.forEach((tc) => {
          parts.push({
            functionCall: {
              name: tc.name,
              args: tc.args,
              id: tc.id,
            },
          });
        });
      }

      history.push({ role: 'model', parts });

      // 2. Add the tool responses as a following user turn if results exist
      const toolResponseParts: Part[] = [];
      if (msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          if (tc.result) {
            if (Array.isArray(tc.result)) {
              for (const r of tc.result) {
                if (typeof r === 'string') {
                  toolResponseParts.push({ text: r });
                } else {
                  toolResponseParts.push(r);
                }
              }
            } else if (typeof tc.result === 'string') {
              toolResponseParts.push({ text: tc.result });
            } else {
              toolResponseParts.push(tc.result);
            }
          }
        }
      }

      if (toolResponseParts.length > 0) {
        history.push({ role: 'user', parts: toolResponseParts });
      }
    }
  }

  return history;
}
