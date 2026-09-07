/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ParsedThoughtResult {
  thought?: string;
  content: string;
}

export interface StreamingThoughtResult extends ParsedThoughtResult {
  isThinking: boolean;
}

const COMPLETE_THOUGHT_REGEX = /<(thought|think)>([\s\S]*?)<\/\1>/i;
const OPEN_THOUGHT_REGEX = /<(thought|think)>/i;

/**
 * Extracts completed thought blocks (<thought>...</thought> or <think>...</think>)
 * from final assistant text.
 */
export function extractThoughts(raw: string): ParsedThoughtResult {
  const match = COMPLETE_THOUGHT_REGEX.exec(raw);
  if (match) {
    const thought = match[2]?.trim();
    const content = raw.replace(match[0], '').trim();
    return {
      thought: thought || undefined,
      content,
    };
  }

  return { content: raw };
}

/**
 * Incrementally parses a streaming response to distinguish active in-flight thoughts
 * from the main content stream.
 */
export function parseStreamingThoughts(raw: string): StreamingThoughtResult {
  const completeMatch = COMPLETE_THOUGHT_REGEX.exec(raw);
  if (completeMatch) {
    const thought = completeMatch[2]?.trim();
    const content = raw.slice(completeMatch.index + completeMatch[0].length).trimStart();
    return {
      thought: thought || undefined,
      content,
      isThinking: false,
    };
  }

  const openMatch = OPEN_THOUGHT_REGEX.exec(raw);
  if (openMatch) {
    const thought = raw.slice(openMatch.index + openMatch[0].length);
    return {
      thought: thought || undefined,
      content: '',
      isThinking: true,
    };
  }

  return {
    content: raw,
    isThinking: false,
  };
}
