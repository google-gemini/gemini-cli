/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { SHELL_TOOL_NAME } from '../tools/definitions/base-declarations.js';

const WORKFLOW_PART_SEPARATOR = ' | ';
const TOOL_SEQUENCE_SEPARATOR = ' -> ';
const SHELL_ASSIGNMENT_REGEX = /^[A-Za-z_][A-Za-z0-9_]*=/;
const SAFE_COMMAND_NAME_REGEX = /^[A-Za-z0-9_.@+-]+$/;
const SAFE_TOOL_SEQUENCE_ENTRY_REGEX = /^[A-Za-z_][A-Za-z0-9_:.]*$/;

function tokenizeShellCommand(command: string): string[] {
  const tokens: string[] = [];
  let currentToken = '';
  let quote: '"' | "'" | '`' | undefined;

  for (let i = 0; i < command.length; i++) {
    const char = command[i];

    if (quote) {
      if (char === quote) {
        quote = undefined;
        continue;
      }

      if (quote === '"' && char === '\\' && i + 1 < command.length) {
        currentToken += command[i + 1];
        i++;
        continue;
      }

      currentToken += char;
      continue;
    }

    if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
      if (currentToken) {
        tokens.push(currentToken);
        currentToken = '';
      }
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }

    currentToken += char;
  }

  if (currentToken) {
    tokens.push(currentToken);
  }

  return tokens;
}

function getSafeCommandName(token: string): string | undefined {
  if (!token || SHELL_ASSIGNMENT_REGEX.test(token)) {
    return undefined;
  }

  const pathParts = token.split(/[/\\]/).filter(Boolean);
  const basename = pathParts[pathParts.length - 1] ?? token;
  if (!basename || basename.includes('://')) {
    return 'shell';
  }

  return SAFE_COMMAND_NAME_REGEX.test(basename) ? basename : 'shell';
}

export function summarizeShellCommandForScratchpad(
  command: string,
): string | undefined {
  const normalized = command.replace(/\s+/g, ' ').trim();
  if (normalized.length === 0) {
    return undefined;
  }

  for (const token of tokenizeShellCommand(normalized)) {
    const commandName = getSafeCommandName(token);
    if (commandName) {
      return commandName;
    }
  }

  return undefined;
}

function sanitizeWorkflowToolSequenceEntry(entry: string): string | undefined {
  const trimmed = entry.trim();
  if (!trimmed) {
    return undefined;
  }

  const shellPrefix = `${SHELL_TOOL_NAME}:`;
  if (trimmed.startsWith(shellPrefix)) {
    const command = trimmed.slice(shellPrefix.length).trim();
    const commandSummary = summarizeShellCommandForScratchpad(command);
    return commandSummary
      ? `${SHELL_TOOL_NAME}: ${commandSummary}`
      : SHELL_TOOL_NAME;
  }

  if (
    trimmed === SHELL_TOOL_NAME ||
    SAFE_TOOL_SEQUENCE_ENTRY_REGEX.test(trimmed)
  ) {
    return trimmed;
  }

  return undefined;
}

export function sanitizeWorkflowSummaryForScratchpad(summary: string): string {
  const normalized = summary.replace(/\s+/g, ' ').trim();
  if (!normalized.includes(`${SHELL_TOOL_NAME}:`)) {
    return normalized;
  }

  const sanitizedParts: string[] = [];
  for (const part of normalized.split(WORKFLOW_PART_SEPARATOR)) {
    const trimmed = part.trim();
    if (!trimmed) {
      continue;
    }

    if (trimmed.includes(`${SHELL_TOOL_NAME}:`)) {
      const sanitizedToolSequence = trimmed
        .split(TOOL_SEQUENCE_SEPARATOR)
        .map(sanitizeWorkflowToolSequenceEntry)
        .filter((entry): entry is string => Boolean(entry));
      if (sanitizedToolSequence.length > 0) {
        sanitizedParts.push(
          sanitizedToolSequence.join(TOOL_SEQUENCE_SEPARATOR),
        );
      }
      continue;
    }

    if (
      trimmed.startsWith('paths ') ||
      trimmed === 'validated' ||
      trimmed === 'validation failed'
    ) {
      sanitizedParts.push(trimmed);
    }
  }

  return sanitizedParts.join(WORKFLOW_PART_SEPARATOR);
}
