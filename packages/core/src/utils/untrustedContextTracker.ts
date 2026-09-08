/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content } from '@google/genai';

export interface UntrustedContextData {
  untrustedTexts: string[];
  untrustedTokens: Set<string>;
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
  'clean',
  'check',
  'lint',
  'start',
  'install',
]);

function collectStringsFromValue(obj: unknown, results: string[]): void {
  if (typeof obj === 'string') {
    results.push(obj);
  } else if (Array.isArray(obj)) {
    for (const item of obj) {
      collectStringsFromValue(item, results);
    }
  } else if (typeof obj === 'object' && obj !== null) {
    for (const val of Object.values(obj)) {
      collectStringsFromValue(val, results);
    }
  }
}

/**
 * Extracts all untrusted text sections and tokens from conversation history.
 *
 * External inputs (MCP tools, Google Docs, Buganizer, web fetch) are wrapped
 * in `<untrusted_context>...</untrusted_context>`. This function extracts
 * all text contained within those blocks and tokenizes them.
 *
 * @param history The conversation content turns.
 * @returns An object with raw untrusted text snippets and a set of normalized tokens.
 */
export function extractUntrustedContext(
  history: readonly Content[] = [],
): UntrustedContextData {
  const untrustedTexts: string[] = [];
  const untrustedTokens = new Set<string>();

  for (const content of history) {
    for (const part of content.parts || []) {
      const textsToCheck: string[] = [];

      if (part.text) {
        textsToCheck.push(part.text);
      }

      if (part.functionResponse?.response) {
        const resp = part.functionResponse.response;
        collectStringsFromValue(resp, textsToCheck);
      }

      for (const text of textsToCheck) {
        UNTRUSTED_CONTEXT_REGEX.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = UNTRUSTED_CONTEXT_REGEX.exec(text)) !== null) {
          const rawBlock = match[1].trim();
          if (!rawBlock) continue;

          untrustedTexts.push(rawBlock);

          // Tokenize by whitespace and standard shell separators
          const tokens = rawBlock.split(/[\s,;"'`|&()]+/);
          for (const token of tokens) {
            const trimmed = token.trim();
            if (!trimmed) continue;

            untrustedTokens.add(trimmed);

            // Handle --flag=value by extracting both flag and value
            if (trimmed.startsWith('-') && trimmed.includes('=')) {
              const eqIdx = trimmed.indexOf('=');
              const flagName = trimmed.substring(0, eqIdx);
              const flagVal = trimmed.substring(eqIdx + 1);
              if (flagName) untrustedTokens.add(flagName);
              if (flagVal) untrustedTokens.add(flagVal);
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

  // Tokenize the command arguments
  const rawTokens = command.trim().split(/\s+/);

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

      // Check if flag value exists in untrusted tokens
      if (valToCheck && untrustedContext.untrustedTokens.has(valToCheck)) {
        detected.add(token);
        continue;
      }

      // Substring check in untrusted text for the flag
      for (const text of untrustedContext.untrustedTexts) {
        if (text.includes(token) || text.includes(flagToCheck)) {
          detected.add(token);
          break;
        }
      }
      continue;
    }

    // Check 2: Sensitive non-flag arguments (skip index 0 as root command)
    if (i > 0) {
      if (BENIGN_SUBCOMMAND_TOKENS.has(token.toLowerCase())) {
        continue;
      }

      // If an argument (such as a build target or file path) was specifically
      // mentioned in untrusted context, record it if it matches untrusted tokens
      if (
        token.startsWith('//') || // Bazel / Blaze target (e.g., //tools/tests:target)
        token.startsWith(':') ||
        token.includes('/') ||
        token.endsWith('.sh') ||
        token.endsWith('.py') ||
        token.endsWith('.so') ||
        token.endsWith('.exe')
      ) {
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

  const trimmed = command.trim();
  const root = trimmed.split(/\s+/)[0];
  if (!root) {
    return false;
  }

  const normalized = root.toLowerCase();
  return BUILD_TEST_COMMAND_ROOTS.has(normalized);
}

const sessionModifiedBuildFiles = new Set<string>();

/**
 * Records that a build configuration file was modified in this session.
 */
export function recordModifiedBuildFile(filePath: string): void {
  sessionModifiedBuildFiles.add(filePath);
}

/**
 * Returns all build configuration files that were modified in this session.
 */
export function getModifiedBuildFiles(): string[] {
  return Array.from(sessionModifiedBuildFiles);
}

/**
 * Resets the tracked modified build files (primarily for testing or session reset).
 */
export function resetModifiedBuildFiles(): void {
  sessionModifiedBuildFiles.clear();
}
