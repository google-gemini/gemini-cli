/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content } from '@google/genai';
import { parse as shellParse } from 'shell-quote';
import { getCommandRoots } from './shell-utils.js';

export interface UntrustedContextData {
  untrustedTexts: string[];
  untrustedTokens: Set<string>;
}

interface LogResponse {
  output?: unknown;
  content?: unknown;
}

const UNTRUSTED_CONTEXT_REGEX =
  /<untrusted_context(?:\s+[^>]*)?>([\s\S]*?)<\/untrusted_context>/gi;

/**
 * Root commands that invoke build engines, test runners, or dependency lifecycles.
 */
export const BUILD_TEST_COMMAND_ROOTS: ReadonlySet<string> = new Set([
  'blaze',
  'bazel',
  'build_cleaner',
  'make',
  'cmake',
  'ninja',
  'npm',
  'npx',
  'yarn',
  'pnpm',
  'bun',
  'cargo',
  'mvn',
  'gradle',
  './gradlew',
  'pytest',
  'python',
  'python3',
  'go',
]);

/**
 * Common, benign subcommands or tokens that should not trigger untrusted flag detection
 * on their own unless paired with explicit flags or non-standard arguments.
 */
const BENIGN_SUBCOMMAND_TOKENS: ReadonlySet<string> = new Set([
  'test',
  'build',
  'run',
  'exec',
  'compile',
  'install',
  'add',
  'update',
  'upgrade',
  'remove',
  'uninstall',
  'clean',
  'format',
  'lint',
  'check',
  'typecheck',
  'start',
  'stop',
  'restart',
  'status',
]);

/**
 * Extracts and indices all text and individual tokens contained within
 * <untrusted_context> tags across the conversation history.
 *
 * @param history The conversation messages history.
 * @returns Struct containing extracted texts and a set of lowercased tokens.
 */
export function extractUntrustedContext(history: readonly Content[]): UntrustedContextData {
  const untrustedTexts: string[] = [];
  const untrustedTokens = new Set<string>();

  if (!history || history.length === 0) {
    return { untrustedTexts, untrustedTokens };
  }

  for (const message of history) {
    if (!message.parts) continue;
    for (const part of message.parts) {
      // Find untrusted content in either text parts or tool response parts
      let contentToSearch = '';
      if (part.text) {
        contentToSearch = part.text;
      } else if (
        part.functionResponse &&
        part.functionResponse.response &&
        typeof part.functionResponse.response === 'object'
      ) {
        const responseObj = part.functionResponse.response as LogResponse;
        const output = responseObj.output;
        const content = responseObj.content;
        if (typeof output === 'string') {
          contentToSearch = output;
        } else if (typeof content === 'string') {
          contentToSearch = content;
        }
      }

      if (!contentToSearch) continue;

      let match;
      // Reset regex index
      UNTRUSTED_CONTEXT_REGEX.lastIndex = 0;
      while ((match = UNTRUSTED_CONTEXT_REGEX.exec(contentToSearch)) !== null) {
        const untrustedContent = match[1]?.trim();
        if (untrustedContent) {
          untrustedTexts.push(untrustedContent);

          // Tokenize the untrusted text to index specific words/flags
          const tokens = untrustedContent
            .split(/[\s,`"';()|&]+/)
            .map((t) => t.trim())
            .filter((t) => t.length > 1) // Ignore single-character words/punctuation
            .filter((t) => !BENIGN_SUBCOMMAND_TOKENS.has(t.toLowerCase()));

          for (const token of tokens) {
            untrustedTokens.add(token);
            // Also index without common flag prefixes so we can match '--flag' against 'flag'
            if (token.startsWith('--')) {
              untrustedTokens.add(token.substring(2));
            } else if (token.startsWith('-')) {
              untrustedTokens.add(token.substring(1));
            }

            // Split on equals to handle key-value pairs
            if (token.includes('=')) {
              const eqParts = token.split('=');
              for (const eqPart of eqParts) {
                const trimmedPart = eqPart.trim();
                if (trimmedPart.length > 1) {
                  untrustedTokens.add(trimmedPart);
                  if (trimmedPart.startsWith('--')) {
                    untrustedTokens.add(trimmedPart.substring(2));
                  } else if (trimmedPart.startsWith('-')) {
                    untrustedTokens.add(trimmedPart.substring(1));
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  return { untrustedTexts, untrustedTokens };
}

/**
 * Inspects a shell command to identify flags or sensitive arguments that were
 * sourced directly from untrusted text in the conversation history.
 *
 * @param command The shell command string.
 * @param untrustedContext The extracted untrusted context data.
 * @returns An array of detected flags or arguments sourced from untrusted text.
 */
export function findUntrustedFlags(
  command: string,
  untrustedContext: UntrustedContextData,
): string[] {
  if (
    !command ||
    untrustedContext.untrustedTexts.length === 0 ||
    untrustedContext.untrustedTokens.size === 0
  ) {
    return [];
  }

  const detected = new Set<string>();

  // Parse the command safely using shell-quote to handle quotes and escapes correctly
  let parsed: ReturnType<typeof shellParse>;
  try {
    parsed = shellParse(command);
  } catch {
    // Fallback to whitespace split if parsing fails
    parsed = command.trim().split(/\s+/);
  }

  const rawTokens = parsed
    .map((x) => {
      if (typeof x === 'string') return x;
      if (x && typeof x === 'object' && 'pattern' in x) return x.pattern;
      return '';
    })
    .filter(Boolean);

  for (let i = 0; i < rawTokens.length; i++) {
    const token = rawTokens[i];

    // Check 1: Flags (starting with '-' or '--')
    if (token.startsWith('-')) {
      let flagToCheck = token;
      let valToCheck: string | undefined;

      if (token.includes('=')) {
        const eqIdx = token.indexOf('=');
        flagToCheck = token.substring(0, eqIdx);
        valToCheck = token.substring(eqIdx + 1);
      }

      // Check if full flag or flag name exists in untrusted tokens
      if (
        untrustedContext.untrustedTokens.has(token) ||
        untrustedContext.untrustedTokens.has(flagToCheck)
      ) {
        detected.add(token);
        continue;
      }

      // If the flag has a value, check if that value exists in untrusted tokens
      if (valToCheck && untrustedContext.untrustedTokens.has(valToCheck)) {
        detected.add(token);
        continue;
      }

      // Check if the next token is an argument for this flag and exists in untrusted tokens
      const nextToken = rawTokens[i + 1];
      if (
        nextToken &&
        !nextToken.startsWith('-') &&
        untrustedContext.untrustedTokens.has(nextToken)
      ) {
        detected.add(nextToken);
      }
    } else {
      // Check 2: Non-flag arguments. Check if the token is a sensitive value
      // (e.g., file paths, URLs, command strings) that is sourced from untrusted context.
      // We only flag it if the token is exactly present as a word/token in the untrusted index
      // OR if it is a substantial substring of any unsegmented untrusted text block.
      const isSensitiveWord =
        token.includes('/') ||
        token.includes('.') ||
        token.includes(':') ||
        token.length > 5;

      if (isSensitiveWord) {
        if (untrustedContext.untrustedTokens.has(token)) {
          detected.add(token);
          continue;
        }

        for (const text of untrustedContext.untrustedTexts) {
          if (text.includes(token)) {
            detected.add(token);
            break;
          }
        }
      }
    }
  }

  return Array.from(detected);
}

/**
 * Checks whether a command invokes a build tool, test harness, or compilation engine.
 *
 * @param command The shell command string.
 * @returns True if the command is a build or test tool.
 */
export function isBuildOrTestCommand(command: string): boolean {
  if (!command) {
    return false;
  }
  try {
    const roots = getCommandRoots(command);
    if (roots.length > 0) {
      return roots.some((root) => BUILD_TEST_COMMAND_ROOTS.has(root.toLowerCase()));
    }
  } catch {
    // Ignore and fallback
  }
  // Fallback if parsing fails or returns empty roots (e.g. parser not initialized yet in fast unit tests)
  const trimmed = command.trim();
  const root = trimmed.split(/\s+/)[0];
  return root ? BUILD_TEST_COMMAND_ROOTS.has(root.toLowerCase()) : false;
}

const globalSessionKey = {};
const sessionModifiedBuildFiles = new WeakMap<object, Set<string>>();

/**
 * Records that a build configuration file was modified in this session.
 */
export function recordModifiedBuildFile(filePath: string, sessionKey: object = globalSessionKey): void {
  let files = sessionModifiedBuildFiles.get(sessionKey);
  if (!files) {
    files = new Set<string>();
    sessionModifiedBuildFiles.set(sessionKey, files);
  }
  files.add(filePath);
}

/**
 * Returns all build configuration files that were modified in this session.
 */
export function getModifiedBuildFiles(sessionKey: object = globalSessionKey): string[] {
  const merged = new Set<string>();
  
  // Scoped files
  const files = sessionModifiedBuildFiles.get(sessionKey);
  if (files) {
    for (const f of files) merged.add(f);
  }

  // Fallback/Legacy global files (keeps tests that directly write to the global store green)
  if (sessionKey !== globalSessionKey) {
    const globalFiles = sessionModifiedBuildFiles.get(globalSessionKey);
    if (globalFiles) {
      for (const f of globalFiles) merged.add(f);
    }
  }

  return Array.from(merged);
}

/**
 * Resets the tracked modified build files (primarily for testing or session reset).
 */
export function resetModifiedBuildFiles(sessionKey: object = globalSessionKey): void {
  sessionModifiedBuildFiles.delete(sessionKey);
  if (sessionKey !== globalSessionKey) {
    sessionModifiedBuildFiles.delete(globalSessionKey);
  }
}
