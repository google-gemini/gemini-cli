/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Content } from '@google/genai';
import {
  debugLogger,
  getResponseText,
  LlmRole,
  type Config,
} from '@google/gemini-cli-core';

export const SHELL_NATURAL_LANGUAGE_PREFIX = '?';
export const SHELL_COMMAND_EXPANSION_FAILURE_MESSAGE =
  'Could not generate a shell command.';
export const SHELL_COMMAND_EXPANSION_EMPTY_MESSAGE =
  'Enter a shell request after ?.';

export type ShellCommandExpansionResult =
  | { status: 'expanded'; command: string }
  | { status: 'aborted' | 'empty_request' | 'failed' | 'unavailable' };

export function shouldExpandShellCommandInline(input: string): boolean {
  return input.startsWith(SHELL_NATURAL_LANGUAGE_PREFIX);
}

export function extractShellCommandFromResponse(
  responseText: string,
): string | null {
  const trimmed = responseText.trim();
  if (!trimmed) {
    return null;
  }

  const fencedBlockMatch = trimmed.match(/```(?:[\w-]+)?\s*([\s\S]*?)```/);
  const normalized = (fencedBlockMatch?.[1] ?? trimmed).trim();
  const lines = normalized
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return null;
  }

  let command = lines[0]
    .replace(/^(?:Command:\s*)/i, '')
    .replace(/^(?:\$|>)\s*/, '')
    .replace(/^[-*]\s+/, '')
    .trim();

  command = command.replace(/^`+|`+$/g, '').trim();

  return command.length > 0 ? command : null;
}

function buildShellCommandExpansionPrompt(
  request: string,
  targetDir: string,
): string {
  const shellEnvironment =
    process.platform === 'win32'
      ? 'Return a single command suitable for a standard Windows shell, preferring PowerShell-compatible syntax.'
      : 'Return a single POSIX shell command suitable for bash.';

  return [
    'Convert the following natural language request into a single shell command.',
    'Return only the command.',
    'Do not include explanations, markdown, comments, backticks, prompts, labels, or multiple alternatives.',
    'The output must be exactly one line.',
    shellEnvironment,
    'Prefer safe, standard, idiomatic commands.',
    'If the request is explicitly destructive, you may return a destructive command.',
    'If the request is ambiguous and could be destructive, prefer an inspectable command over an irreversible one.',
    `Current working directory: ${targetDir}`,
    `User request: ${request}`,
  ].join('\n');
}

export interface UseShellCommandExpansionOptions {
  config: Config;
}

export function useShellCommandExpansion({
  config,
}: UseShellCommandExpansionOptions) {
  const [isExpanding, setIsExpanding] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const expandShellCommand = useCallback(
    async (input: string): Promise<ShellCommandExpansionResult> => {
      const geminiClient = config.getGeminiClient();
      if (!geminiClient) {
        return { status: 'unavailable' };
      }

      const request = input.slice(SHELL_NATURAL_LANGUAGE_PREFIX.length).trim();
      if (!request) {
        return { status: 'empty_request' };
      }

      abortControllerRef.current?.abort();

      const controller = new AbortController();
      const signal = controller.signal;
      abortControllerRef.current = controller;
      setIsExpanding(true);

      try {
        const contents: Content[] = [
          {
            role: 'user',
            parts: [
              {
                text: buildShellCommandExpansionPrompt(
                  request,
                  config.getTargetDir(),
                ),
              },
            ],
          },
        ];

        const response = await geminiClient.generateContent(
          { model: 'prompt-completion' },
          contents,
          signal,
          LlmRole.UTILITY_AUTOCOMPLETE,
        );

        if (signal.aborted) {
          return { status: 'aborted' };
        }

        const command = extractShellCommandFromResponse(
          getResponseText(response) ?? '',
        );

        if (!command) {
          return { status: 'failed' };
        }

        return { status: 'expanded', command };
      } catch (error) {
        if (
          signal.aborted ||
          (error instanceof Error && error.name === 'AbortError')
        ) {
          return { status: 'aborted' };
        }

        debugLogger.warn(
          `[WARN] shell command expansion failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        return { status: 'failed' };
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
        if (!signal.aborted) {
          setIsExpanding(false);
        }
      }
    },
    [config],
  );

  useEffect(() => () => abortControllerRef.current?.abort(), []);

  return {
    isExpanding,
    expandShellCommand,
  };
}
