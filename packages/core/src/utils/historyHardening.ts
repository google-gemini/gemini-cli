/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content, Part } from '@google/genai';
import { debugLogger } from './debugLogger.js';

export const SYNTHETIC_THOUGHT_SIGNATURE = 'skip_thought_signature_validator';

export interface HardeningOptions {
  sentinels?: {
    continuation?: string;
    lostToolResponse?: string;
  };
}

const DEFAULT_SENTINELS = {
  continuation: '[Continuing from previous AI thoughts...]',
  lostToolResponse:
    'The tool execution result was lost due to context management truncation.',
};

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
export function hardenHistory(
  history: Content[],
  options: HardeningOptions = {},
): Content[] {
  if (history.length === 0) return history;

  const sentinels = { ...DEFAULT_SENTINELS, ...options.sentinels };

  // Pass 1: Initial Coalesce & Empty Turn Removal
  let coalesced = coalesce(history);

  // Pass 2: Tool Pairing & Signatures (The semantic layer)
  coalesced = pairToolsAndEnforceSignatures(coalesced, sentinels);

  // Pass 3: Structural Refinement (Hoisting & Re-ordering of tool responses)
  coalesced = refineToolResponses(coalesced);

  // Pass 4: Enforce Structural Invariants (Start/End/Alternation)
  let final = enforceRoleConstraints(coalesced, sentinels);

  // Pass 5: Final Scrubbing (Remove custom/non-standard properties for API compatibility)
  final = scrubHistory(final);

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
function pairToolsAndEnforceSignatures(
  history: Content[],
  sentinels: Required<NonNullable<HardeningOptions['sentinels']>>,
): Content[] {
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
                  error: sentinels.lostToolResponse,
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
 * Hoists and re-orders tool responses within user turns to match preceding model turns.
 */
function refineToolResponses(history: Content[]): Content[] {
  for (let i = 1; i < history.length; i++) {
    const turn = history[i];
    const prev = history[i - 1];

    if (turn.role === 'user' && prev.role === 'model') {
      const callOrder =
        prev.parts
          ?.filter((p) => !!p.functionCall)
          .map((p) => p.functionCall!.id) || [];

      if (callOrder.length > 0) {
        const responseParts =
          turn.parts?.filter((p) => !!p.functionResponse) || [];
        const otherParts = turn.parts?.filter((p) => !p.functionResponse) || [];

        if (responseParts.length > 0) {
          // 1. Re-order: Sort responses to match the model's call order
          responseParts.sort((a, b) => {
            const idA = a.functionResponse!.id;
            const idB = b.functionResponse!.id;
            const idxA = callOrder.indexOf(idA);
            const idxB = callOrder.indexOf(idB);

            // If an ID isn't found in the preceding turn (should be rare after pairing),
            // move it to the end.
            if (idxA === -1) return 1;
            if (idxB === -1) return -1;
            return idxA - idxB;
          });

          // 2. Hoisting: Place all sorted responses BEFORE text or other parts
          turn.parts = [...responseParts, ...otherParts];
        }
      }
    }
  }
  return history;
}

/**
 * Final pass to ensure start/end roles and alternation are correct.
 */
function enforceRoleConstraints(
  history: Content[],
  sentinels: Required<NonNullable<HardeningOptions['sentinels']>>,
): Content[] {
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
      parts: [{ text: sentinels.continuation }],
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

/**
 * Deep-scrubs the history to remove any non-standard properties from Content and Part objects.
 * This ensures compatibility with strict APIs (like Vertex AI) that reject unknown fields.
 */
export function scrubHistory(history: Content[]): Content[] {
  return history.map((content) => ({
    role: content.role,
    parts: (content.parts || []).map(scrubPart),
  }));
}

interface ThoughtPart extends Part {
  thoughtSignature?: string;
}

function isThoughtPart(part: Part): part is ThoughtPart {
  return 'thoughtSignature' in part;
}

function scrubPart(part: Part): Part {
  const scrubbed: Record<string, unknown> = {};

  if ('text' in part && typeof part.text === 'string') {
    scrubbed['text'] = part.text;
  }
  if ('inlineData' in part) {
    scrubbed['inlineData'] = part.inlineData;
  }
  if ('functionCall' in part && part.functionCall) {
    const scrubbedCall: Record<string, unknown> = {
      name: part.functionCall.name,
      args: part.functionCall.args,
    };
    if (part.functionCall.id) {
      scrubbedCall['id'] = part.functionCall.id;
    }
    scrubbed['functionCall'] = scrubbedCall;
  }
  if (isThoughtPart(part)) {
    scrubbed['thoughtSignature'] = part.thoughtSignature;
  }
  if ('functionResponse' in part && part.functionResponse) {
    const scrubbedResp: Record<string, unknown> = {
      name: part.functionResponse.name,
      response: part.functionResponse.response,
    };
    if (part.functionResponse.id) {
      scrubbedResp['id'] = part.functionResponse.id;
    }
    scrubbed['functionResponse'] = scrubbedResp;
  }
  if ('fileData' in part) {
    scrubbed['fileData'] = part.fileData;
  }
  if ('executableCode' in part) {
    scrubbed['executableCode'] = part.executableCode;
  }
  if ('codeExecutionResult' in part) {
    scrubbed['codeExecutionResult'] = part.codeExecutionResult;
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  return scrubbed as unknown as Part;
}
