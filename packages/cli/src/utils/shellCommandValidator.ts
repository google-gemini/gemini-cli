/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Patterns that indicate a string is likely a shell command rather than
 * natural language text.
 */
const SHELL_SYNTAX_PATTERNS = [
  /[|;&<>`$]/,
  /\$\{/,
  /\$\(/,
  /\(\)\s*\{/,
  /&&/,
  /\|\|/,
  /\b(?:echo|cat|ls|cd|pwd|grep|find|sort|uniq|wc|head|tail|sed|awk|cut|tr|tee|xargs|mkdir|rmdir|rm|cp|mv|chmod|chown|ps|kill|top|df|du|mount|umount|tar|gzip|gunzip|zip|unzip|curl|wget|ssh|scp|git|npm|npx|yarn|pnpm|docker|kubectl|node|python|python3|ruby|perl|php|java|javac|mvn|gradle|make|cmake|cc|gcc|g\+\+|clang|go|rustc|cargo|deno|bun|dotnet|pip|pip3|composer|gem)\b/i,
];

/**
 * Checks whether a string looks like a shell command rather than
 * natural language text, using heuristic regex matching.
 *
 * Returns true if the text contains shell operators or known
 * command names, false if it looks like natural language or is empty.
 */
export function isLikelyShellCommand(text: string): boolean {
  if (!text || text.trim().length === 0) {
    return false;
  }

  const trimmed = text.trim();

  if (SHELL_SYNTAX_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return true;
  }

  return false;
}
