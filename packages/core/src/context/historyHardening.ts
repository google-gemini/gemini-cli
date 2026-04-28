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
 *
 * Invariants enforced:
 * 1. Role Alternation: user -> model -> user -> model
 * 2. Start Constraint: Must start with a 'user' turn.
 * 3. End Constraint: Must end with a 'user' turn (usually for follow-up prompts).
 * 4. Tool Pairing: Every model functionCall must be followed by a user functionResponse.
 * 5. Signatures: The first functionCall in a model turn must have a thoughtSignature.
 */
export function hardenHistory(history: Content[]): Content[] {
  if (history.length === 0) return history;

  debugLogger.log(
    `[HistoryHardener] Hardening history with ${history.length} turns`,
  );

  // Pass 1: Initial Coalesce & Empty Turn Removal
  let coalesced = coalesce(history);

  // Pass 2: Tool Pairing & Signatures (The semantic layer)
  // This might inject sentinel responses or drop orphaned responses.
  coalesced = pairToolsAndEnforceSignatures(coalesced);

  // Pass 3: Enforce Structural Invariants (Start/End/Alternation)
  // This MUST run after pairing because pairing can drop/add turns.
  const final = enforceRoleConstraints(coalesced);

  debugLogger.log(
    `[HistoryHardener] Finished hardening. Final history has ${final.length} turns.`,
  );

  // Final verification log of roles to help debug 400 errors
  const roleSequence = final.map((t) => t.role).join(' -> ');
  debugLogger.log(`[HistoryHardener] Final role sequence: ${roleSequence}`);

  return final;
}

/**
 * Combines adjacent turns with the same role and removes empty turns.
 */
function coalesce(history: Content[]): Content[] {
  const result: Content[] = [];
  for (const turn of history) {
    if (!turn.parts || turn.parts.length === 0) continue;

    const last = result[result.length - 1];
    if (last && last.role === turn.role) {
      last.parts = [...(last.parts || []), ...(turn.parts || [])];
    } else {
      // Shallow clone the turn so we don't mutate the original history array structure
      result.push({ ...turn });
    }
  }
  return result;
}

/**
 * Ensures tool calls have matching responses and model turns have required signatures.
 */
function pairToolsAndEnforceSignatures(history: Content[]): Content[] {
  const result: Content[] = [];

  // We work on a copy to allow splicing in sentinel turns
  const work = [...history];

  for (let i = 0; i < work.length; i++) {
    const turn = work[i];

    if (turn.role === 'model') {
      const parts = turn.parts || [];

      // A. Signatures
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

      // B. Pairing
      const callParts = parts.filter((p) => !!p.functionCall);
      if (callParts.length > 0) {
        const nextTurn = work[i + 1];
        const missing: Array<{ id: string; name: string }> = [];

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
            debugLogger.log(
              `[HistoryHardener] Call id='${id}' (name='${name}') has no matching response in next turn.`,
            );
            missing.push({ id, name });
          }
        }

        if (missing.length > 0) {
          debugLogger.log(
            `[HistoryHardener] Detected ${missing.length} tool calls without responses. Injecting sentinel responses.`,
          );

          let targetUserTurn: Content;
          if (nextTurn?.role === 'user') {
            targetUserTurn = nextTurn;
          } else {
            targetUserTurn = { role: 'user', parts: [] };
            work.splice(i + 1, 0, targetUserTurn);
          }

          for (const m of missing) {
            targetUserTurn.parts = targetUserTurn.parts || [];
            targetUserTurn.parts.push({
              functionResponse: {
                name: m.name,
                id: m.id,
                response: {
                  error:
                    'The tool execution result was lost due to context management truncation.',
                },
              },
            });
          }
        }
      }
    } else if (turn.role === 'user') {
      // C. Orphaned Responses
      // A user response MUST follow a model call.
      const prevTurn = result[result.length - 1];
      const parts = turn.parts || [];
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
            debugLogger.log(
              `[HistoryHardener] Dropping orphaned functionResponse id='${id}' (name='${name}')`,
            );
          }
        } else {
          validParts.push(p);
        }
      }
      turn.parts = validParts;
    }

    if (turn.parts && turn.parts.length > 0) {
      result.push(turn);
    }
  }

  return result;
}

/**
 * Final pass to ensure start/end roles and alternation are correct.
 */
function enforceRoleConstraints(history: Content[]): Content[] {
  if (history.length === 0) return [];

  // Re-coalesce first to catch any empty turns or adjacent roles introduced by pairing
  const base = coalesce(history);
  if (base.length === 0) return [];

  const result: Content[] = [...base];

  // 1. Ensure starts with user
  if (result[0].role === 'model') {
    debugLogger.log(
      '[HistoryHardener] Final history starts with model role. Prepending sentinel user turn.',
    );
    result.unshift({
      role: 'user',
      parts: [{ text: '[Continuing from previous AI thoughts...]' }],
    });
  }

  // 2. Ensure ends with user
  if (result[result.length - 1].role === 'model') {
    debugLogger.log(
      '[HistoryHardener] Final history ends with model role. Appending sentinel user turn.',
    );
    result.push({
      role: 'user',
      parts: [{ text: 'Please continue.' }],
    });
  }

  // 3. Final Alternation Check (redundant if coalesce works, but safe)
  return coalesce(result);
}
