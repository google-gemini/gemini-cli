/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useCallback, useMemo } from 'react';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import type { Suggestion } from '../components/SuggestionsDisplay.js';
import { debugLogger } from '@google/gemini-cli-core';
import { getArgumentCompletions } from './shell-completions/index.js';

/**
 * Maximum number of suggestions to return to avoid freezing the React Ink UI.
 */
const MAX_SHELL_SUGGESTIONS = 100;

/**
 * Debounce interval (ms) for file system completions.
 */
const FS_COMPLETION_DEBOUNCE_MS = 50;

// Backslash-quote shell metacharacters on non-Windows platforms.

// On Unix, backslash-quote shell metacharacters (spaces, parens, etc.).
// On Windows, cmd.exe doesn't use backslash-quoting and `\` is the path
// separator, so we leave the path as-is.
const UNIX_SHELL_SPECIAL_CHARS = /[ \t\n\r'"()&|;<>!#$`{}[\]*?\\]/g;

/**
 * Escapes special shell characters in a path segment.
 */
export function escapeShellPath(segment: string): string {
  if (process.platform === 'win32') {
    return segment;
  }
  return segment.replace(UNIX_SHELL_SPECIAL_CHARS, '\\$&');
}

export interface TokenInfo {
  /** The raw token text (without surrounding quotes but with internal escapes). */
  token: string;
  /** Offset in the original line where this token begins. */
  start: number;
  /** Offset in the original line where this token ends (exclusive). */
  end: number;
  /** Whether this is the first token (command position). */
  isFirstToken: boolean;
  /** The fully built list of tokens parsing the string. */
  tokens: string[];
  /** The index in the tokens list where the cursor lies. */
  cursorIndex: number;
  /** The command token (always tokens[0] if length > 0, otherwise empty string) */
  commandToken: string;
}

export function getTokenAtCursor(
  line: string,
  cursorCol: number,
): TokenInfo | null {
  const tokensInfo: Array<{ token: string; start: number; end: number }> = [];
  let i = 0;

  while (i < line.length) {
    // Skip whitespace
    if (line[i] === ' ' || line[i] === '\t') {
      i++;
      continue;
    }

    const tokenStart = i;
    let token = '';

    while (i < line.length) {
      const ch = line[i];

      // Backslash escape: consume the next char literally
      if (ch === '\\' && i + 1 < line.length) {
        token += line[i + 1];
        i += 2;
        continue;
      }

      // Single-quoted string
      if (ch === "'") {
        i++; // skip opening quote
        while (i < line.length && line[i] !== "'") {
          token += line[i];
          i++;
        }
        if (i < line.length) i++; // skip closing quote
        continue;
      }

      // Double-quoted string
      if (ch === '"') {
        i++; // skip opening quote
        while (i < line.length && line[i] !== '"') {
          if (line[i] === '\\' && i + 1 < line.length) {
            token += line[i + 1];
            i += 2;
          } else {
            token += line[i];
            i++;
          }
        }
        if (i < line.length) i++; // skip closing quote
        continue;
      }

      // Unquoted whitespace ends the token
      if (ch === ' ' || ch === '\t') {
        break;
      }

      token += ch;
      i++;
    }

    tokensInfo.push({ token, start: tokenStart, end: i });
  }

  const rawTokens = tokensInfo.map((t) => t.token);
  const commandToken = rawTokens.length > 0 ? rawTokens[0] : '';

  if (tokensInfo.length === 0) {
    return {
      token: '',
      start: cursorCol,
      end: cursorCol,
      isFirstToken: true,
      tokens: [''],
      cursorIndex: 0,
      commandToken: '',
    };
  }

  // Find the token that contains or is immediately adjacent to the cursor
  for (let idx = 0; idx < tokensInfo.length; idx++) {
    const t = tokensInfo[idx];
    if (cursorCol >= t.start && cursorCol <= t.end) {
      return {
        token: t.token,
        start: t.start,
        end: t.end,
        isFirstToken: idx === 0,
        tokens: rawTokens,
        cursorIndex: idx,
        commandToken,
      };
    }
  }

  // Cursor is in whitespace between tokens, or at the start/end of the line.
  // Find the appropriate insertion index for a new empty token.
  let insertIndex = tokensInfo.length;
  for (let idx = 0; idx < tokensInfo.length; idx++) {
    if (cursorCol < tokensInfo[idx].start) {
      insertIndex = idx;
      break;
    }
  }

  const newTokens = [
    ...rawTokens.slice(0, insertIndex),
    '',
    ...rawTokens.slice(insertIndex),
  ];

  return {
    token: '',
    start: cursorCol,
    end: cursorCol,
    isFirstToken: insertIndex === 0,
    tokens: newTokens,
    cursorIndex: insertIndex,
    commandToken: newTokens.length > 0 ? newTokens[0] : '',
  };
}

export async function scanPathExecutables(
  signal?: AbortSignal,
): Promise<string[]> {
  const pathEnv = process.env['PATH'] ?? '';
  const dirs = pathEnv.split(path.delimiter).filter(Boolean);
  const isWindows = process.platform === 'win32';
  const pathExtList = isWindows
    ? (process.env['PATHEXT'] ?? '.EXE;.CMD;.BAT;.COM')
        .split(';')
        .filter(Boolean)
        .map((e) => e.toLowerCase())
    : [];

  const seen = new Set<string>();
  const executables: string[] = [];

  // Add Windows shell built-ins
  if (isWindows) {
    const builtins = [
      'assoc',
      'break',
      'call',
      'cd',
      'chcp',
      'chdir',
      'cls',
      'color',
      'copy',
      'date',
      'del',
      'dir',
      'echo',
      'endlocal',
      'erase',
      'exit',
      'for',
      'ftype',
      'goto',
      'if',
      'md',
      'mkdir',
      'mklink',
      'move',
      'path',
      'pause',
      'popd',
      'prompt',
      'pushd',
      'rd',
      'rem',
      'ren',
      'rename',
      'rmdir',
      'set',
      'setlocal',
      'shift',
      'start',
      'time',
      'title',
      'type',
      'ver',
      'verify',
      'vol',
    ];
    for (const builtin of builtins) {
      seen.add(builtin);
      executables.push(builtin);
    }
  }

  const dirResults = await Promise.all(
    dirs.map(async (dir) => {
      if (signal?.aborted) return [];
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        const validEntries: string[] = [];

        // Check executability in parallel (batched per directory)
        await Promise.all(
          entries.map(async (entry) => {
            if (signal?.aborted) return;
            if (!entry.isFile() && !entry.isSymbolicLink()) return;

            const name = entry.name;
            if (isWindows) {
              const ext = path.extname(name).toLowerCase();
              if (pathExtList.length > 0 && !pathExtList.includes(ext)) return;
            }

            try {
              await fs.access(
                path.join(dir, name),
                fs.constants.R_OK | fs.constants.X_OK,
              );
              validEntries.push(name);
            } catch {
              // Not executable — skip
            }
          }),
        );

        return validEntries;
      } catch {
        // EACCES, ENOENT, etc. — skip this directory
        return [];
      }
    }),
  );

  for (const names of dirResults) {
    for (const name of names) {
      if (!seen.has(name)) {
        seen.add(name);
        executables.push(name);
      }
    }
  }

  executables.sort();
  return executables;
}

function expandTilde(inputPath: string): [string, boolean] {
  if (
    inputPath === '~' ||
    inputPath.startsWith('~/') ||
    inputPath.startsWith('~' + path.sep)
  ) {
    return [path.join(os.homedir(), inputPath.slice(1)), true];
  }
  return [inputPath, false];
}

export async function resolvePathCompletions(
  partial: string,
  cwd: string,
  signal?: AbortSignal,
): Promise<Suggestion[]> {
  if (partial == null) return [];

  // Input Sanitization
  let strippedPartial = partial;
  if (strippedPartial.startsWith('"') || strippedPartial.startsWith("'")) {
    strippedPartial = strippedPartial.slice(1);
  }
  if (strippedPartial.endsWith('"') || strippedPartial.endsWith("'")) {
    strippedPartial = strippedPartial.slice(0, -1);
  }

  // Normalize separators \ to /
  const normalizedPartial = strippedPartial.replace(/\\/g, '/');

  const [expandedPartial, didExpandTilde] = expandTilde(normalizedPartial);

  // Directory Detection
  const endsWithSep =
    normalizedPartial.endsWith('/') || normalizedPartial === '';
  const dirToRead = endsWithSep
    ? path.resolve(cwd, expandedPartial)
    : path.resolve(cwd, path.dirname(expandedPartial));

  const prefix = endsWithSep ? '' : path.basename(expandedPartial);
  const prefixLower = prefix.toLowerCase();

  const showDotfiles = prefix.startsWith('.');

  let entries: Array<import('node:fs').Dirent>;
  try {
    if (signal?.aborted) return [];
    entries = await fs.readdir(dirToRead, { withFileTypes: true });
  } catch {
    // EACCES, ENOENT, etc.
    return [];
  }

  if (signal?.aborted) return [];

  const suggestions: Suggestion[] = [];
  for (const entry of entries) {
    if (signal?.aborted) break;

    const name = entry.name;

    // Hide dotfiles unless query starts with '.'
    if (name.startsWith('.') && !showDotfiles) continue;

    // Case-insensitive matching
    if (!name.toLowerCase().startsWith(prefixLower)) continue;

    const isDir = entry.isDirectory();
    const displayName = isDir ? name + '/' : name;

    // Build the completion value relative to what the user typed
    let completionValue: string;
    if (endsWithSep) {
      completionValue = normalizedPartial + displayName;
    } else {
      const parentPart = normalizedPartial.slice(
        0,
        normalizedPartial.length - path.basename(normalizedPartial).length,
      );
      completionValue = parentPart + displayName;
    }

    // Restore tilde if we expanded it
    if (didExpandTilde) {
      const homeDir = os.homedir().replace(/\\/g, '/');
      if (completionValue.startsWith(homeDir)) {
        completionValue = '~' + completionValue.slice(homeDir.length);
      }
    }

    // Output formatting: Escape special characters in the completion value
    // Since normalizedPartial stripped quotes, we escape the value directly.
    const escapedValue = escapeShellPath(completionValue);

    suggestions.push({
      label: displayName,
      value: escapedValue,
      description: isDir ? 'directory' : 'file',
    });

    if (suggestions.length >= MAX_SHELL_SUGGESTIONS) break;
  }

  // Sort: directories first, then alphabetically
  suggestions.sort((a, b) => {
    const aIsDir = a.description === 'directory';
    const bIsDir = b.description === 'directory';
    if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;
    return a.label.localeCompare(b.label);
  });

  return suggestions;
}

export interface UseShellCompletionProps {
  /** Whether shell completion is active. */
  enabled: boolean;
  /** The current line text. */
  line: string;
  /** The current cursor column. */
  cursorCol: number;
  /** The current working directory for path resolution. */
  cwd: string;
  /** Callback to set suggestions on the parent state. */
  setSuggestions: (suggestions: Suggestion[]) => void;
  /** Callback to set loading state on the parent. */
  setIsLoadingSuggestions: (isLoading: boolean) => void;
}

export interface UseShellCompletionReturn {
  completionStart: number;
  completionEnd: number;
  query: string;
}

const EMPTY_TOKENS: string[] = [];

export function useShellCompletion({
  enabled,
  line,
  cursorCol,
  cwd,
  setSuggestions,
  setIsLoadingSuggestions,
}: UseShellCompletionProps): UseShellCompletionReturn {
  const pathCachePromiseRef = useRef<Promise<string[]> | null>(null);
  const pathEnvRef = useRef<string>(process.env['PATH'] ?? '');
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const tokenInfo = useMemo(
    () => (enabled ? getTokenAtCursor(line, cursorCol) : null),
    [enabled, line, cursorCol],
  );

  const {
    token: query = '',
    start: completionStart = -1,
    end: completionEnd = -1,
    isFirstToken: isCommandPosition = false,
    tokens = EMPTY_TOKENS,
    cursorIndex = -1,
    commandToken = '',
  } = tokenInfo || {};

  // Invalidate PATH cache when $PATH changes
  useEffect(() => {
    const currentPath = process.env['PATH'] ?? '';
    if (currentPath !== pathEnvRef.current) {
      pathCachePromiseRef.current = null;
      pathEnvRef.current = currentPath;
    }
  });

  const performCompletion = useCallback(async () => {
    if (!enabled || !tokenInfo) {
      setSuggestions([]);
      return;
    }

    // Skip flags
    if (query.startsWith('-')) {
      setSuggestions([]);
      return;
    }

    // Cancel any in-flight request
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    try {
      let results: Suggestion[];

      if (isCommandPosition) {
        setIsLoadingSuggestions(true);

        if (!pathCachePromiseRef.current) {
          // We don't pass the signal here because we want the cache to finish
          // even if this specific completion request is aborted.
          pathCachePromiseRef.current = scanPathExecutables();
        }

        const executables = await pathCachePromiseRef.current;
        if (signal.aborted) return;

        const queryLower = query.toLowerCase();
        results = executables
          .filter((cmd) => cmd.toLowerCase().startsWith(queryLower))
          .sort((a, b) => {
            // Prioritize shorter commands as they are likely common built-ins
            if (a.length !== b.length) {
              return a.length - b.length;
            }
            return a.localeCompare(b);
          })
          .slice(0, MAX_SHELL_SUGGESTIONS)
          .map((cmd) => ({
            label: cmd,
            value: escapeShellPath(cmd),
            description: 'command',
          }));
      } else {
        const argumentCompletions = await getArgumentCompletions(
          commandToken,
          tokens,
          cursorIndex,
          cwd,
          signal,
        );

        if (signal.aborted) return;

        if (argumentCompletions?.exclusive) {
          results = argumentCompletions.suggestions;
        } else {
          const pathSuggestions = await resolvePathCompletions(
            query,
            cwd,
            signal,
          );
          if (signal.aborted) return;

          results = [
            ...(argumentCompletions?.suggestions ?? []),
            ...pathSuggestions,
          ].slice(0, MAX_SHELL_SUGGESTIONS);
        }
      }

      if (signal.aborted) return;

      setSuggestions(results);
    } catch (error) {
      if (
        !(
          signal.aborted ||
          (error instanceof Error && error.name === 'AbortError')
        )
      ) {
        debugLogger.warn(
          `[WARN] shell completion failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      if (!signal.aborted) {
        setSuggestions([]);
      }
    } finally {
      if (!signal.aborted) {
        setIsLoadingSuggestions(false);
      }
    }
  }, [
    enabled,
    tokenInfo,
    query,
    isCommandPosition,
    tokens,
    cursorIndex,
    commandToken,
    cwd,
    setSuggestions,
    setIsLoadingSuggestions,
  ]);

  useEffect(() => {
    if (!enabled) {
      abortRef.current?.abort();
      setSuggestions([]);
      setIsLoadingSuggestions(false);
    }
  }, [enabled, setSuggestions, setIsLoadingSuggestions]);

  // Debounced effect to trigger completion
  useEffect(() => {
    if (!enabled) return;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      performCompletion();
    }, FS_COMPLETION_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [enabled, performCompletion]);

  // Cleanup on unmount
  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    },
    [],
  );

  return {
    completionStart,
    completionEnd,
    query,
  };
}
