/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content, Part } from '@google/genai';
import { debugLogger } from '../utils/debugLogger.js';

export const SYNTHETIC_THOUGHT_SIGNATURE = 'skip_thought_signature_validator';

/**
 * Hardens a chat history to ensure it strictly adheres to Gemini API invariants.
 * This is a defensive post-processing pass that patches violations using
 * sentinel messages rather than failing.
 */
export function hardenHistory(history: Content[]): Content[] {
  if (history.length === 0) return history;

  debugLogger.log(
    `[HistoryHardener] Hardening history with ${history.length} turns`,
  );

  // 1. Coalesce adjacent roles
  const coalesced: Content[] = [];
  for (const turn of history) {
    const last = coalesced[coalesced.length - 1];
    if (last && last.role === turn.role) {
      last.parts = [...(last.parts || []), ...(turn.parts || [])];
    } else if (turn.parts && turn.parts.length > 0) {
      coalesced.push({ ...turn });
    }
  }

  // 2. Ensure start with user
  if (coalesced.length > 0 && coalesced[0].role === 'model') {
    debugLogger.warn(
      '[HistoryHardener] History starts with model role. Prepending sentinel user turn.',
    );
    coalesced.unshift({
      role: 'user',
      parts: [{ text: '[Continuing from previous context...]' }],
    });
  }

  // 3. Ensure end with user
  if (
    coalesced.length > 0 &&
    coalesced[coalesced.length - 1].role === 'model'
  ) {
    debugLogger.warn(
      '[HistoryHardener] History ends with model role. Appending sentinel user turn.',
    );
    coalesced.push({
      role: 'user',
      parts: [{ text: 'Please continue.' }],
    });
  }

  // 4. Pair Tool Calls and Responses & Enforce Signatures
  const hardened: Content[] = [];
  for (let i = 0; i < coalesced.length; i++) {
    const turn = coalesced[i];

    if (turn.role === 'model') {
      const parts = turn.parts || [];

      // A. Enforce Thought Signatures (Required for Gemini-3 models)
      // The first function call in a model turn must have a signature.
      let foundCall = false;
      for (let j = 0; j < parts.length; j++) {
        const p = parts[j];
        if (p.functionCall) {
          if (!foundCall && !p.thoughtSignature) {
            debugLogger.warn(
              `[HistoryHardener] Missing thought signature on first function call in model turn. Injecting synthetic signature.`,
            );
            parts[j] = { ...p, thoughtSignature: SYNTHETIC_THOUGHT_SIGNATURE };
          }
          foundCall = true;
        }
      }

      // B. Pair Tool Calls and Responses
      const callParts = parts.filter((p) => !!p.functionCall) || [];
      if (callParts.length > 0) {
        // We have tool calls. The NEXT turn MUST be a user turn with responses.
        const nextTurn = coalesced[i + 1];
        const missingIds: Array<{ id: string; name: string }> = [];

        for (const call of callParts) {
          const id = call.functionCall!.id || 'undefined';
          const name = call.functionCall!.name || 'unknown';
          const hasResponse =
            nextTurn?.role === 'user' &&
            nextTurn.parts?.some(
              (p) =>
                p.functionResponse?.id === id &&
                p.functionResponse?.name === name,
            );

          if (!hasResponse) {
            debugLogger.warn(
              `[HistoryHardener] Call id='${id}' (name='${name}') has no matching response in next turn.`,
            );
            missingIds.push({ id, name });
          }
        }

        if (missingIds.length > 0) {
          debugLogger.error(
            `[HistoryHardener] Detected ${missingIds.length} tool calls without responses. Injecting sentinel responses.`,
          );

          // If the next turn isn't user, or it is but it's text-only, we might need to create/modify it.
          let targetUserTurn: Content;
          if (nextTurn?.role === 'user') {
            targetUserTurn = nextTurn;
          } else {
            targetUserTurn = { role: 'user', parts: [] };
            coalesced.splice(i + 1, 0, targetUserTurn);
          }

          for (const miss of missingIds) {
            targetUserTurn.parts = targetUserTurn.parts || [];
            targetUserTurn.parts.push({
              functionResponse: {
                name: miss.name,
                id: miss.id,
                response: {
                  error:
                    'The tool execution result was lost due to context management truncation.',
                },
              },
            });
          }
        }
      }
    }

    // Final check for orphaned responses (responses without a preceding model turn with calls)
    if (turn.role === 'user') {
      const parts = turn.parts || [];
      const prevTurn = hardened[hardened.length - 1];
      const validParts: Part[] = [];

      for (const p of parts) {
        if (p.functionResponse) {
          const id = p.functionResponse.id;
          const name = p.functionResponse.name;
          const hasCall =
            prevTurn?.role === 'model' &&
            prevTurn.parts?.some(
              (cp) =>
                cp.functionCall?.id === id && cp.functionCall?.name === name,
            );

          if (hasCall) {
            validParts.push(p);
          } else {
            debugLogger.warn(
              `[HistoryHardener] Dropping orphaned functionResponse id='${id}' (name='${name}')`,
            );
          }
        } else {
          validParts.push(p);
        }
      }
      turn.parts = validParts;
    }

    // Only push if we didn't empty the turn during coalescing
    if (turn.parts && turn.parts.length > 0) {
      hardened.push(turn);
    }
  }

  // Final role re-coalesce in case step 4 introduced adjacent roles (unlikely but safe)
  const final: Content[] = [];
  for (const turn of hardened) {
    const last = final[final.length - 1];
    if (last && last.role === turn.role) {
      last.parts = [...(last.parts || []), ...(turn.parts || [])];
    } else {
      final.push(turn);
    }
  }

  debugLogger.log(
    `[HistoryHardener] Finished hardening. Final history has ${final.length} turns.`,
  );
  return final;
}
