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
 * Standard read-only, formatting, filtering, or directory-navigation flags
 * that cannot execute code or escalate privileges on their own.
 * Note: Case-sensitive for short flags (e.g., '-C' is safe directory change in
 * git/tar/make, whereas lowercase '-c' can pass config overrides or shell commands).
 */
const SAFE_SHORT_FLAGS: ReadonlySet<string> = new Set([
  '-a',
  '-A',
  '-b',
  '-B',
  '-C',
  '-d',
  '-D',
  '-F',
  '-g',
  '-G',
  '-h',
  '-H',
  '-i',
  '-I',
  '-l',
  '-L',
  '-m',
  '-n',
  '-N',
  '-p',
  '-P',
  '-q',
  '-r',
  '-R',
  '-s',
  '-S',
  '-t',
  '-T',
  '-u',
  '-U',
  '-v',
  '-V',
  '-w',
  '-W',
  '-x',
  '-z',
  '-1',
  // Common combined POSIX inspection flags (ls, grep, ps, git)
  '-la',
  '-al',
  '-ld',
  '-dl',
  '-lh',
  '-hl',
  '-lah',
  '-alh',
  '-lrt',
  '-ltr',
  '-rn',
  '-nr',
  '-ri',
  '-ir',
  '-rni',
  '-rin',
  '-ni',
  '-in',
  '-ef',
  '-aux',
]);

const SAFE_LONG_FLAGS: ReadonlySet<string> = new Set([
  '--all',
  '--oneline',
  '--stat',
  '--numstat',
  '--shortstat',
  '--name-only',
  '--name-status',
  '--graph',
  '--decorate',
  '--no-pager',
  '--color',
  '--no-color',
  '--grep',
  '--author',
  '--since',
  '--until',
  '--before',
  '--after',
  '--pretty',
  '--format',
  '--abbrev-commit',
  '--max-count',
  '--cached',
  '--staged',
  '--short',
  '--branch',
  '--porcelain',
  '--help',
  '--version',
  '--quiet',
  '--verbose',
  '--dry-run',
  '--ignore-case',
  '--line-number',
  '--recursive',
  '--extended-regexp',
  '--fixed-strings',
  '--files-with-matches',
  '--count',
  '--context',
  '--before-context',
  '--after-context',
]);

/**
 * Flags that accept an argument which can control command execution, configuration,
 * or test runner behavior even if the flag name itself was not in untrusted text.
 */
const HIGH_RISK_VALUE_FLAGS: ReadonlySet<string> = new Set([
  '-c',
  '-e',
  '--eval',
  '--exec',
  '-exec',
  '-execdir',
  '--run_under',
  '--test_strategy',
  '--test_arg',
  '--test_env',
  '--action_env',
  '--jvmopt',
  '--host_jvm_args',
  '--wrapper_script_flag',
  '--upload-pack',
  '--receive-pack',
  '--require',
  '--import',
  '--loader',
]);

const FILE_MODE_STRING_REGEX = /^[dcbpsl-][rwxstST-]{9}[+@.]?$/i;
const BARE_DASHES_REGEX = /^--+$/;

function isHighRiskPatternToken(token: string): boolean {
  return (
    token.startsWith('http://') ||
    token.startsWith('https://') ||
    token.startsWith('/') ||
    token.startsWith('\\') ||
    token.startsWith('./') ||
    token.startsWith('../') ||
    /^[a-zA-Z]:[\\/]/.test(token) ||
    /\.(sh|bash|zsh|ps1|bat|cmd|exe)$/i.test(token)
  );
}

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

          // Strip internal ShellTool execution metadata wrapper lines so empty/normal
          // shell executions do not pollute untrustedTokens with wrapper labels.
          const contentWithoutShellMetadata = normalizedContent
            .replace(/^\s*Output:\s*(\(empty\))?\s*/i, '')
            .replace(
              /\n(?:Exit Code|Signal|Background PIDs|Process Group PGID):.*$/gim,
              '',
            );

          // Tokenize the untrusted text to index specific words/flags
          const tokens = contentWithoutShellMetadata
            .split(/[\s,`"';()|&[\]{}<>]+/)
            .map((t) => t.trim())
            .filter((t) => t.length > 1) // Ignore single-character words/punctuation
            .filter((t) => !BARE_DASHES_REGEX.test(t))
            .filter((t) => !FILE_MODE_STRING_REGEX.test(t))
            .filter((t) => !BENIGN_SUBCOMMAND_TOKENS.has(t.toLowerCase()));

          for (const token of tokens) {
            const lowerToken = token.toLowerCase();
            untrustedTokens.add(lowerToken);

            // Split on equals to handle key-value pairs (e.g., --run_under=/tmp/payload.sh)
            if (lowerToken.includes('=')) {
              const eqParts = lowerToken.split('=');
              for (const eqPart of eqParts) {
                const trimmedPart = eqPart.trim();
                if (
                  trimmedPart.length > 1 &&
                  !BARE_DASHES_REGEX.test(trimmedPart)
                ) {
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

  // Parse the command safely using shell-quote to handle quotes and escapes correctly.
  // Pass an env lookup function so shell variables (e.g. "$repo") are preserved
  // as "$repo" instead of expanding to empty strings and shifting positional tokens.
  let parsed: ReturnType<typeof shellParse>;
  try {
    const normalizedCommand =
      process.platform === 'win32' ? command.replace(/\\(?!")/g, '/') : command;
    parsed = shellParse(normalizedCommand, (key) => `$${key}`);
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
      if (/^--?$/.test(token)) {
        continue;
      }

      let rawFlagName = token;
      let flagToCheck = lowerToken;
      let rawValToCheck: string | undefined;
      let valToCheck: string | undefined;

      if (token.includes('=')) {
        const eqIdx = token.indexOf('=');
        rawFlagName = token.substring(0, eqIdx);
        flagToCheck = lowerToken.substring(0, eqIdx);
        rawValToCheck = token.substring(eqIdx + 1);
        valToCheck = lowerToken.substring(eqIdx + 1);
      }

      const isSafeFlag =
        SAFE_SHORT_FLAGS.has(rawFlagName) || SAFE_LONG_FLAGS.has(flagToCheck);
      const isHighRiskFlag =
        HIGH_RISK_VALUE_FLAGS.has(rawFlagName) ||
        (rawFlagName.startsWith('--') &&
          HIGH_RISK_VALUE_FLAGS.has(flagToCheck));

      // Check 1A: Full flag or flag name exists in untrusted tokens (unless it is a known safe flag)
      if (
        !isSafeFlag &&
        (untrustedContext.untrustedTokens.has(lowerToken) ||
          untrustedContext.untrustedTokens.has(flagToCheck))
      ) {
        detected.add(token);
        if (!token.includes('=') && isHighRiskFlag) {
          const nextToken = rawTokens[i + 1];
          if (
            nextToken &&
            !nextToken.startsWith('-') &&
            !nextToken.startsWith('$') &&
            untrustedContext.untrustedTokens.has(nextToken.toLowerCase())
          ) {
            detected.add(nextToken);
          }
        }
        continue;
      }

      // Check 1B: Attached '=value'
      if (valToCheck && rawValToCheck) {
        const isValUntrusted =
          untrustedContext.untrustedTokens.has(valToCheck) &&
          (isHighRiskFlag ||
            (!isSafeFlag && isHighRiskPatternToken(rawValToCheck)));
        const isHighRiskValSubstring =
          (!isSafeFlag || isHighRiskFlag) &&
          isHighRiskPatternToken(rawValToCheck) &&
          untrustedContext.untrustedTexts.some((text) =>
            text.toLowerCase().includes(valToCheck.replace(/\\/g, '/')),
          );
        if (isValUntrusted || isHighRiskValSubstring) {
          detected.add(token);
          continue;
        }
      }

      // Check 1C: Space-separated argument for high-risk value-taking flags
      if (!token.includes('=') && isHighRiskFlag) {
        const nextToken = rawTokens[i + 1];
        if (
          nextToken &&
          !nextToken.startsWith('-') &&
          !nextToken.startsWith('$') &&
          !BENIGN_SUBCOMMAND_TOKENS.has(nextToken.toLowerCase()) &&
          (untrustedContext.untrustedTokens.has(nextToken.toLowerCase()) ||
            (isHighRiskPatternToken(nextToken) &&
              untrustedContext.untrustedTexts.some((text) =>
                text
                  .toLowerCase()
                  .includes(nextToken.toLowerCase().replace(/\\/g, '/')),
              )))
        ) {
          detected.add(token);
          detected.add(nextToken);
        }
      }
    } else {
      // Check 2: Non-flag arguments. Flag high-risk values (e.g. URLs, absolute paths,
      // relative script executions) sourced from untrusted context.
      if (token.length <= 1 || token.startsWith('$')) {
        continue;
      }

      if (isHighRiskPatternToken(token)) {
        if (untrustedContext.untrustedTokens.has(lowerToken)) {
          detected.add(token);
          continue;
        }

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
