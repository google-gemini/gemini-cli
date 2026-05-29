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
  /\(\)\s*\{/,
  /^\s*\S+[/\\]\S+/,
  /^[a-zA-Z]:[/\\]/,
  /^\S+\.(?:sh|bat|cmd|exe)\b/i,
  /\s--?[a-zA-Z0-9]/,
  /^\s*(?:sudo\s+|env\s+)?(?:[a-zA-Z_][a-zA-Z0-9_]*=\S+\s+)*\b(?:bash|sh|zsh|cmd|powershell|pwsh|echo|cat|ls|cd|pwd|grep|find|sort|uniq|wc|head|tail|sed|awk|cut|tr|tee|xargs|mkdir|rmdir|rm|cp|mv|chmod|chown|ps|kill|top|df|du|mount|umount|tar|gzip|gunzip|zip|unzip|curl|wget|ssh|scp|git|npm|npx|yarn|pnpm|docker|kubectl|node|python|python3|ruby|perl|php|java|javac|mvn|gradle|make|cmake|cc|gcc|g\+\+|clang|go|rustc|cargo|deno|bun|dotnet|pip|pip3|composer|gem|sudo|apt|apt-get|brew|gcloud|aws|nvm|export|source|gh|tsc|eslint|prettier|vitest|jest|vite|next|terraform|ping|poetry|uv|jq|yq|touch|clear|cls|open|xdg-open|start|py|tsx|ts-node|docker-compose)(?!\w)/i,
];

/**
 * Checks whether a string looks like a shell command rather than
 * natural language text, using heuristic regex matching.
 *
 * Returns true if the text contains shell operators, known
 * command names, path-prefixed commands, or is a single-word
 * input (highly likely to be an executable name). Returns false
 * if it looks like natural language or is empty.
 */
export function isLikelyShellCommand(text: string): boolean {
  if (!text || text.trim().length === 0) {
    return false;
  }

  const trimmed = text.trim();

  if (!trimmed.includes(' ')) {
    return true;
  }

  if (SHELL_SYNTAX_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return true;
  }

  return false;
}
