/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content, Part } from '@google/genai';
import type { HistoryTurn } from '../core/agentChatHistory.js';

/**
 * The exact text injected by `closeUnansweredToolResponseTurn` when a stream
 * is interrupted after a tool response has already been committed to history.
 *
 * This text is dangerous because the model recognizes it as its own output and
 * parrots it back on subsequent turns, creating an infinite loop.
 */
export const INTERRUPTED_RESPONSE_TEXT =
  '[The previous response was interrupted before it completed.]';

/**
 * A benign, model-neutral replacement that maintains correct turn alternation
 * (preventing user-turn coalescence) without polluting the model's in-context
 * learning signal.
 *
 * Deliberately terse so the model treats it as a no-op acknowledgment and
 * proceeds to answer the next user message normally.
 */
export const BENIGN_INTERRUPTION_REPLACEMENT = 'Continuing.';

/**
 * Checks whether a text string contains the interruption placeholder.
 *
 * @param text - The text to inspect.
 * @returns `true` if the text matches or contains the known placeholder.
 */
export function isInterruptionPlaceholder(text: string): boolean {
  return text.trim() === INTERRUPTED_RESPONSE_TEXT;
}

/**
 * Checks whether a Content object is a synthetic interruption placeholder turn.
 */
export function isInterruptionContent(content: Content): boolean {
  if (!content || content.role !== 'model') return false;
  const parts = content.parts ?? [];
  if (parts.length === 0) return false;

  return parts.some(
    (part) =>
      part &&
      typeof part.text === 'string' &&
      isInterruptionPlaceholder(part.text),
  );
}

/**
 * Replaces interruption placeholder text in a single Part with the benign
 * replacement, returning a new Part. Non-matching parts are returned as-is.
 */
export function sanitizePart(part: Part): Part {
  if (
    !part ||
    typeof part.text !== 'string' ||
    !isInterruptionPlaceholder(part.text)
  ) {
    return part;
  }
  return { ...part, text: BENIGN_INTERRUPTION_REPLACEMENT };
}

/**
 * Sanitizes a Content turn by replacing any interruption placeholder text in
 * its parts. Returns a new Content object; the original is not mutated.
 */
export function sanitizeContent(content: Content): Content {
  if (!content || !isInterruptionContent(content)) {
    return content;
  }
  return {
    ...content,
    parts: (content.parts ?? []).map(sanitizePart),
  };
}

/**
 * Sanitizes an array of HistoryTurns, replacing any interruption placeholder
 * model turns with the benign replacement. Non-matching turns are returned
 * by reference (zero-copy for the common path).
 */
export function sanitizeInterruptedTurns(
  turns: HistoryTurn[],
): HistoryTurn[] {
  if (!turns) return [];
  return turns.map((turn) => {
    if (!turn || !turn.content || !isInterruptionContent(turn.content)) {
      return turn;
    }
    return {
      ...turn,
      content: sanitizeContent(turn.content),
    };
  });
}

/**
 * Sanitizes a flat Content[] history (as used by the compression service and
 * next-speaker checker). Returns a new array with placeholders replaced.
 */
export function sanitizeContentHistory(history: Content[]): Content[] {
  if (!history) return [];
  return history.map(sanitizeContent);
}
