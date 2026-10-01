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
  /<untrusted_context[^>]*>([\s\S]*?)<\/untrusted_context>/gi;

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
  'gradlew',
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
export function extractUntrustedContext(
  history: readonly Content[],
): UntrustedContextData {
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

      for (const match of contentToSearch.matchAll(UNTRUSTED_CONTEXT_REGEX)) {
        const untrustedContent = match[1]?.trim();
        if (untrustedContent) {
          const normalizedContent = untrustedContent.replace(/\\/g, '/');
          untrustedTexts.push(normalizedContent);

          // Tokenize the untrusted text to index specific words/flags
          const tokens = normalizedContent
            .split(/[\s,`"';()|&[\]{}<>]+/)
            .map((t) => t.trim())
            .filter((t) => t.length > 1) // Ignore single-character words/punctuation
            .filter((t) => !BENIGN_SUBCOMMAND_TOKENS.has(t.toLowerCase()));

          for (const token of tokens) {
            const lowerToken = token.toLowerCase();
            untrustedTokens.add(lowerToken);
            // Also index without common flag prefixes so we can match '--flag' against 'flag'
            if (lowerToken.startsWith('--')) {
              untrustedTokens.add(lowerToken.substring(2));
            } else if (lowerToken.startsWith('-')) {
              untrustedTokens.add(lowerToken.substring(1));
            }

            // Split on equals to handle key-value pairs
            if (lowerToken.includes('=')) {
              const eqParts = lowerToken.split('=');
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

            // Split on slashes to handle path segments and filenames
            if (lowerToken.includes('/')) {
              const pathParts = lowerToken.split('/');
              for (const part of pathParts) {
                const trimmedPart = part.trim();
                if (trimmedPart.length > 1) {
                  untrustedTokens.add(trimmedPart);
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
    const normalizedCommand =
      process.platform === 'win32' ? command.replace(/\\(?!")/g, '/') : command;
    parsed = shellParse(normalizedCommand);
  } catch {
    // Fallback to whitespace split if parsing fails
    parsed = command.trim().split(/\s+/);
  }

  const rawTokens = parsed
    .flatMap((x) => {
      if (typeof x === 'string') return [x];
      if (x && typeof x === 'object') {
        const tokens: string[] = [];
        if ('pattern' in x && typeof x.pattern === 'string') {
          tokens.push(x.pattern);
        }
        if ('file' in x && typeof x.file === 'string') {
          tokens.push(x.file);
        }
        return tokens;
      }
      return [];
    })
    .filter(Boolean);

  for (let i = 0; i < rawTokens.length; i++) {
    const token = rawTokens[i];
    const lowerToken = token.toLowerCase();

    // Check 1: Flags (starting with '-' or '--')
    if (token.startsWith('-')) {
      let flagToCheck = lowerToken;
      let valToCheck: string | undefined;

      if (token.includes('=')) {
        const eqIdx = lowerToken.indexOf('=');
        flagToCheck = lowerToken.substring(0, eqIdx);
        valToCheck = lowerToken.substring(eqIdx + 1);
      }

      // Check if full flag or flag name exists in untrusted tokens
      if (
        untrustedContext.untrustedTokens.has(lowerToken) ||
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
        untrustedContext.untrustedTokens.has(nextToken.toLowerCase())
      ) {
        detected.add(token);
        detected.add(nextToken);
      }
    } else {
      // Check 2: Non-flag arguments. Check if the token is a sensitive value
      // (e.g., file paths, URLs, command strings) that is sourced from untrusted context.
      // We only flag it if the token is exactly present as a word/token in the untrusted index
      // OR if it is a substantial substring of any unsegmented untrusted text block.
      if (token.length <= 1) {
        continue;
      }
      const isSensitiveWord =
        token.includes('/') || token.includes('.') || token.includes(':');

      const isHighRiskPattern =
        token.startsWith('http://') ||
        token.startsWith('https://') ||
        token.startsWith('/') ||
        token.startsWith('\\') ||
        /^[a-zA-Z]:[\\/]/.test(token);

      if (isSensitiveWord) {
        if (untrustedContext.untrustedTokens.has(lowerToken)) {
          detected.add(token);
          continue;
        }

        if (isHighRiskPattern) {
          const normalizedLowerToken = lowerToken.replace(/\\/g, '/');
          for (const text of untrustedContext.untrustedTexts) {
            if (text.toLowerCase().includes(normalizedLowerToken)) {
              detected.add(token);
              break;
            }
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
  const getBaseName = (cmd: string) => {
    const base = cmd.replace(/\\/g, '/').split('/').pop();
    if (!base) return cmd.toLowerCase();
    return base.toLowerCase().replace(/\.(exe|cmd|bat)$/, '');
  };
  try {
    const roots = getCommandRoots(command);
    if (roots.length > 0) {
      return roots.some((root) => {
        const base = getBaseName(root);
        return (
          BUILD_TEST_COMMAND_ROOTS.has(base) ||
          BUILD_TEST_COMMAND_ROOTS.has(root.toLowerCase())
        );
      });
    }
  } catch {
    // Ignore and fallback
  }
  // Fallback if parsing fails or returns empty roots (e.g. parser not initialized yet in fast unit tests)
  const parts = command.trim().split(/\s+/);
  let rootIndex = 0;
  while (
    rootIndex < parts.length &&
    (parts[rootIndex].includes('=') ||
      ['sudo', 'env', 'time'].includes(parts[rootIndex].toLowerCase()))
  ) {
    rootIndex++;
  }
  const root = parts[rootIndex];
  if (!root) return false;
  const base = getBaseName(root);
  return (
    BUILD_TEST_COMMAND_ROOTS.has(base) ||
    BUILD_TEST_COMMAND_ROOTS.has(root.toLowerCase())
  );
}

const MODIFIED_BUILD_FILES_SYMBOL = Symbol('sessionModifiedBuildFiles');

interface SessionRecord {
  [MODIFIED_BUILD_FILES_SYMBOL]?: Set<string>;
}

function hasSessionRecord(sessionKey: object): sessionKey is SessionRecord {
  return typeof sessionKey === 'object' && sessionKey !== null;
}

/**
 * Records that a build configuration file was modified in this session.
 */
export function recordModifiedBuildFile(
  filePath: string,
  sessionKey: object,
): void {
  if (hasSessionRecord(sessionKey)) {
    let files = sessionKey[MODIFIED_BUILD_FILES_SYMBOL];
    if (!files) {
      files = new Set<string>();
      sessionKey[MODIFIED_BUILD_FILES_SYMBOL] = files;
    }
    files.add(filePath);
  }
}

/**
 * Returns all build configuration files that were modified in this session.
 */
export function getModifiedBuildFiles(sessionKey: object): string[] {
  if (hasSessionRecord(sessionKey)) {
    const files = sessionKey[MODIFIED_BUILD_FILES_SYMBOL];
    return files ? Array.from(files) : [];
  }
  return [];
}

/**
 * Resets the tracked modified build files (primarily for testing or session reset).
 */
export function resetModifiedBuildFiles(sessionKey: object): void {
  if (hasSessionRecord(sessionKey)) {
    delete sessionKey[MODIFIED_BUILD_FILES_SYMBOL];
  }
}
