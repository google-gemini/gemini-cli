/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useCallback, useMemo, useRef } from 'react';
import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import {
  isNodeError,
  escapePath,
  unescapePath,
  getErrorMessage,
  Config,
  FileDiscoveryService,
  DEFAULT_FILE_FILTERING_OPTIONS,
  SHELL_SPECIAL_CHARS,
} from '@google/gemini-cli-core';
import { Suggestion } from '../components/SuggestionsDisplay.js';
import { CommandContext, SlashCommand } from '../commands/types.js';
import {
  logicalPosToOffset,
  TextBuffer,
} from '../components/shared/text-buffer.js';
import { isSlashCommand } from '../utils/commandUtils.js';
import { toCodePoints } from '../utils/textUtils.js';
import { useCompletion } from './useCompletion.js';

export interface UseCommandCompletionReturn {
  suggestions: Suggestion[];
  activeSuggestionIndex: number;
  visibleStartIndex: number;
  showSuggestions: boolean;
  isLoadingSuggestions: boolean;
  isPerfectMatch: boolean;
  setActiveSuggestionIndex: React.Dispatch<React.SetStateAction<number>>;
  setShowSuggestions: React.Dispatch<React.SetStateAction<boolean>>;
  resetCompletionState: () => void;
  navigateUp: () => void;
  navigateDown: () => void;
  handleAutocomplete: (indexToUse: number) => void;
}

export function useCommandCompletion(
  buffer: TextBuffer,
  dirs: readonly string[],
  cwd: string,
  slashCommands: readonly SlashCommand[],
  commandContext: CommandContext,
  reverseSearchActive: boolean = false,
  config?: Config,
): UseCommandCompletionReturn {
  const {
    suggestions,
    activeSuggestionIndex,
    visibleStartIndex,
    showSuggestions,
    isLoadingSuggestions,
    isPerfectMatch,

    setSuggestions,
    setShowSuggestions,
    setActiveSuggestionIndex,
    setIsLoadingSuggestions,
    setIsPerfectMatch,
    setVisibleStartIndex,

    resetCompletionState,
    navigateUp,
    navigateDown,
  } = useCompletion();

  const completionStart = useRef(-1);
  const completionEnd = useRef(-1);

  const cursorRow = buffer.cursor[0];
  const cursorCol = buffer.cursor[1];

  // Check if cursor is after @ or / without unescaped spaces
  const commandIndex = useMemo(() => {
    const currentLine = buffer.lines[cursorRow] || '';
    if (cursorRow === 0 && isSlashCommand(currentLine.trim())) {
      return currentLine.indexOf('/');
    }

    // For other completions like '@', we search backwards from the cursor.

    const codePoints = toCodePoints(currentLine);
    for (let i = cursorCol - 1; i >= 0; i--) {
      const char = codePoints[i];

      if (char === ' ') {
        // Check for unescaped spaces.
        let backslashCount = 0;
        for (let j = i - 1; j >= 0 && codePoints[j] === '\\'; j--) {
          backslashCount++;
        }
        if (backslashCount % 2 === 0) {
          return -1; // Inactive on unescaped space.
        }
      } else if (char === '@') {
        // Active if we find an '@' before any unescaped space.
        return i;
      }
    }

    return -1;
  }, [cursorRow, cursorCol, buffer.lines]);

  useEffect(() => {
    if (commandIndex === -1 || reverseSearchActive) {
      setTimeout(resetCompletionState, 0);
      return;
    }

    const currentLine = buffer.lines[cursorRow] || '';
    const codePoints = toCodePoints(currentLine);

    if (codePoints[commandIndex] === '/') {
      // Always reset perfect match at the beginning of processing.
      setIsPerfectMatch(false);

      const fullPath = currentLine.substring(commandIndex + 1);
      const hasTrailingSpace = currentLine.endsWith(' ');

      // Get all non-empty parts of the command.
      const rawParts = fullPath.split(/\s+/).filter((p) => p);

      let commandPathParts = rawParts;
      let partial = '';

      // If there's no trailing space, the last part is potentially a partial segment.
      // We tentatively separate it.
      if (!hasTrailingSpace && rawParts.length > 0) {
        partial = rawParts[rawParts.length - 1];
        commandPathParts = rawParts.slice(0, -1);
      }

      // Traverse the Command Tree using the tentative completed path
      let currentLevel: readonly SlashCommand[] | undefined = slashCommands;
      let leafCommand: SlashCommand | null = null;

      for (const part of commandPathParts) {
        if (!currentLevel) {
          leafCommand = null;
          currentLevel = [];
          break;
        }
        const found: SlashCommand | undefined = currentLevel.find(
          (cmd) => cmd.name === part || cmd.altNames?.includes(part),
        );
        if (found) {
          leafCommand = found;
          currentLevel = found.subCommands as
            | readonly SlashCommand[]
            | undefined;
        } else {
          leafCommand = null;
          currentLevel = [];
          break;
        }
      }

      let exactMatchAsParent: SlashCommand | undefined;
      // Handle the Ambiguous Case
      if (!hasTrailingSpace && currentLevel) {
        exactMatchAsParent = currentLevel.find(
          (cmd) =>
            (cmd.name === partial || cmd.altNames?.includes(partial)) &&
            cmd.subCommands,
        );

        if (exactMatchAsParent) {
          // It's a perfect match for a parent command. Override our initial guess.
          // Treat it as a completed command path.
          leafCommand = exactMatchAsParent;
          currentLevel = exactMatchAsParent.subCommands;
          partial = ''; // We now want to suggest ALL of its sub-commands.
        }
      }

      // Check for perfect, executable match
      if (!hasTrailingSpace) {
        if (leafCommand && partial === '' && leafCommand.action) {
          // Case: /command<enter> - command has action, no sub-commands were suggested
          setIsPerfectMatch(true);
        } else if (currentLevel) {
          // Case: /command subcommand<enter>
          const perfectMatch = currentLevel.find(
            (cmd) =>
              (cmd.name === partial || cmd.altNames?.includes(partial)) &&
              cmd.action,
          );
          if (perfectMatch) {
            setIsPerfectMatch(true);
          }
        }
      }

      const depth = commandPathParts.length;
      const isArgumentCompletion =
        leafCommand?.completion &&
        (hasTrailingSpace ||
          (rawParts.length > depth && depth > 0 && partial !== ''));

      // Set completion range
      if (hasTrailingSpace || exactMatchAsParent) {
        completionStart.current = currentLine.length;
        completionEnd.current = currentLine.length;
      } else if (partial) {
        if (isArgumentCompletion) {
          const commandSoFar = `/${commandPathParts.join(' ')}`;
          const argStartIndex =
            commandSoFar.length + (commandPathParts.length > 0 ? 1 : 0);
          completionStart.current = argStartIndex;
        } else {
          completionStart.current = currentLine.length - partial.length;
        }
        completionEnd.current = currentLine.length;
      } else {
        // e.g. /
        completionStart.current = commandIndex + 1;
        completionEnd.current = currentLine.length;
      }

      // Provide Suggestions based on the now-corrected context
      if (isArgumentCompletion) {
        const fetchAndSetSuggestions = async () => {
          setIsLoadingSuggestions(true);
          const argString = rawParts.slice(depth).join(' ');
          const results =
            (await leafCommand!.completion!(commandContext, argString)) || [];
          const finalSuggestions = results.map((s) => ({ label: s, value: s }));
          setSuggestions(finalSuggestions);
          setShowSuggestions(finalSuggestions.length > 0);
          setActiveSuggestionIndex(finalSuggestions.length > 0 ? 0 : -1);
          setIsLoadingSuggestions(false);
        };
        fetchAndSetSuggestions();
        return;
      }

      // Command/Sub-command Completion
      const commandsToSearch = currentLevel || [];
      if (commandsToSearch.length > 0) {
        let potentialSuggestions = commandsToSearch.filter(
          (cmd) =>
            cmd.description &&
            (cmd.name.startsWith(partial) ||
              cmd.altNames?.some((alt) => alt.startsWith(partial))),
        );

        // If a user's input is an exact match and it is a leaf command,
        // enter should submit immediately.
        if (potentialSuggestions.length > 0 && !hasTrailingSpace) {
          const perfectMatch = potentialSuggestions.find(
            (s) => s.name === partial || s.altNames?.includes(partial),
          );
          if (perfectMatch && perfectMatch.action) {
            potentialSuggestions = [];
          }
        }

        const finalSuggestions = potentialSuggestions.map((cmd) => ({
          label: cmd.name,
          value: cmd.name,
          description: cmd.description,
        }));

        setSuggestions(finalSuggestions);
        setShowSuggestions(finalSuggestions.length > 0);
        setActiveSuggestionIndex(finalSuggestions.length > 0 ? 0 : -1);
        setIsLoadingSuggestions(false);
        return;
      }

      // If we fall through, no suggestions are available.
      resetCompletionState();
      return;
    }

    // Handle At Command Completion
    completionEnd.current = codePoints.length;
    for (let i = cursorCol; i < codePoints.length; i++) {
      if (codePoints[i] === ' ') {
        let backslashCount = 0;
        for (let j = i - 1; j >= 0 && codePoints[j] === '\\'; j--) {
          backslashCount++;
        }

        if (backslashCount % 2 === 0) {
          completionEnd.current = i;
          break;
        }
      }
    }

    const pathStart = commandIndex + 1;
    const partialPath = currentLine.substring(pathStart, completionEnd.current);
    const lastSlashIndex = partialPath.lastIndexOf('/');
    completionStart.current =
      lastSlashIndex === -1 ? pathStart : pathStart + lastSlashIndex + 1;
    const baseDirRelative =
      lastSlashIndex === -1
        ? '.'
        : partialPath.substring(0, lastSlashIndex + 1);
    const prefix = unescapePath(
      lastSlashIndex === -1
        ? partialPath
        : partialPath.substring(lastSlashIndex + 1),
    );

    let isMounted = true;

    const findFilesRecursively = async (
      startDir: string,
      searchPrefix: string,
      fileDiscovery: FileDiscoveryService | null,
      filterOptions: {
        respectGitIgnore?: boolean;
        respectGeminiIgnore?: boolean;
      },
      currentRelativePath = '',
      depth = 0,
      maxDepth = 10, // Limit recursion depth
      maxResults = 50, // Limit number of results
    ): Promise<Suggestion[]> => {
      if (depth > maxDepth) {
        return [];
      }

      const lowerSearchPrefix = searchPrefix.toLowerCase();
      let foundSuggestions: Suggestion[] = [];
      try {
        const entries = await fs.readdir(startDir, { withFileTypes: true });
        for (const entry of entries) {
          if (foundSuggestions.length >= maxResults) break;

          const entryPathRelative = path.join(currentRelativePath, entry.name);
          const entryPathFromRoot = path.relative(
            startDir,
            path.join(startDir, entry.name),
          );

          // Conditionally ignore dotfiles
          if (!searchPrefix.startsWith('.') && entry.name.startsWith('.')) {
            continue;
          }

          // Check if this entry should be ignored by filtering options
          if (
            fileDiscovery &&
            fileDiscovery.shouldIgnoreFile(entryPathFromRoot, filterOptions)
          ) {
            continue;
          }

          if (entry.name.toLowerCase().startsWith(lowerSearchPrefix)) {
            foundSuggestions.push({
              label: entryPathRelative + (entry.isDirectory() ? '/' : ''),
              value: escapePath(
                entryPathRelative + (entry.isDirectory() ? '/' : ''),
              ),
            });
          }
          if (
            entry.isDirectory() &&
            entry.name !== 'node_modules' &&
            !entry.name.startsWith('.')
          ) {
            if (foundSuggestions.length < maxResults) {
              foundSuggestions = foundSuggestions.concat(
                await findFilesRecursively(
                  path.join(startDir, entry.name),
                  searchPrefix, // Pass original searchPrefix for recursive calls
                  fileDiscovery,
                  filterOptions,
                  entryPathRelative,
                  depth + 1,
                  maxDepth,
                  maxResults - foundSuggestions.length,
                ),
              );
            }
          }
        }
      } catch (_err) {
        // Ignore errors like permission denied or ENOENT during recursive search
      }
      return foundSuggestions.slice(0, maxResults);
    };

    const findFilesWithGlob = async (
      searchPrefix: string,
      fileDiscoveryService: FileDiscoveryService,
      filterOptions: {
        respectGitIgnore?: boolean;
        respectGeminiIgnore?: boolean;
      },
      searchDir: string,
      maxResults = 50,
    ): Promise<Suggestion[]> => {
      const globPattern = `**/${searchPrefix}*`;
      const files = await glob(globPattern, {
        cwd: searchDir,
        dot: searchPrefix.startsWith('.'),
        nocase: true,
      });

      const suggestions: Suggestion[] = files
        .filter((file) => {
          if (fileDiscoveryService) {
            return !fileDiscoveryService.shouldIgnoreFile(file, filterOptions);
          }
          return true;
        })
        .map((file: string) => {
          const absolutePath = path.resolve(searchDir, file);
          const label = path.relative(cwd, absolutePath);
          return {
            label,
            value: escapePath(label),
          };
        })
        .slice(0, maxResults);

      return suggestions;
    };

    const fetchSuggestions = async () => {
      setIsLoadingSuggestions(true);
      let fetchedSuggestions: Suggestion[] = [];

      const fileDiscoveryService = config ? config.getFileService() : null;
      const enableRecursiveSearch =
        config?.getEnableRecursiveFileSearch() ?? true;
      const filterOptions =
        config?.getFileFilteringOptions() ?? DEFAULT_FILE_FILTERING_OPTIONS;

      try {
        // If there's no slash, or it's the root, do a recursive search from workspace directories
        for (const dir of dirs) {
          let fetchedSuggestionsPerDir: Suggestion[] = [];
          if (
            partialPath.indexOf('/') === -1 &&
            prefix &&
            enableRecursiveSearch
          ) {
            if (fileDiscoveryService) {
              fetchedSuggestionsPerDir = await findFilesWithGlob(
                prefix,
                fileDiscoveryService,
                filterOptions,
                dir,
              );
            } else {
              fetchedSuggestionsPerDir = await findFilesRecursively(
                dir,
                prefix,
                null,
                filterOptions,
              );
            }
          } else {
            // Original behavior: list files in the specific directory
            const lowerPrefix = prefix.toLowerCase();
            const baseDirAbsolute = path.resolve(dir, baseDirRelative);
            const entries = await fs.readdir(baseDirAbsolute, {
              withFileTypes: true,
            });

            // Filter entries using git-aware filtering
            const filteredEntries = [];
            for (const entry of entries) {
              // Conditionally ignore dotfiles
              if (!prefix.startsWith('.') && entry.name.startsWith('.')) {
                continue;
              }
              if (!entry.name.toLowerCase().startsWith(lowerPrefix)) continue;

              const relativePath = path.relative(
                dir,
                path.join(baseDirAbsolute, entry.name),
              );
              if (
                fileDiscoveryService &&
                fileDiscoveryService.shouldIgnoreFile(
                  relativePath,
                  filterOptions,
                )
              ) {
                continue;
              }

              filteredEntries.push(entry);
            }

            fetchedSuggestionsPerDir = filteredEntries.map((entry) => {
              const absolutePath = path.resolve(baseDirAbsolute, entry.name);
              const label =
                cwd === dir ? entry.name : path.relative(cwd, absolutePath);
              const suggestionLabel = entry.isDirectory() ? label + '/' : label;
              return {
                label: suggestionLabel,
                value: escapePath(suggestionLabel),
              };
            });
          }
          fetchedSuggestions = [
            ...fetchedSuggestions,
            ...fetchedSuggestionsPerDir,
          ];
        }

        // Like glob, we always return forward slashes for path separators, even on Windows.
        // But preserve backslash escaping for special characters.
        const specialCharsLookahead = `(?![${SHELL_SPECIAL_CHARS.source.slice(1, -1)}])`;
        const pathSeparatorRegex = new RegExp(
          `\\\\${specialCharsLookahead}`,
          'g',
        );
        fetchedSuggestions = fetchedSuggestions.map((suggestion) => ({
          ...suggestion,
          label: suggestion.label.replace(pathSeparatorRegex, '/'),
          value: suggestion.value.replace(pathSeparatorRegex, '/'),
        }));

        // Sort by depth, then directories first, then alphabetically
        fetchedSuggestions.sort((a, b) => {
          const depthA = (a.label.match(/\//g) || []).length;
          const depthB = (b.label.match(/\//g) || []).length;

          if (depthA !== depthB) {
            return depthA - depthB;
          }

          const aIsDir = a.label.endsWith('/');
          const bIsDir = b.label.endsWith('/');
          if (aIsDir && !bIsDir) return -1;
          if (!aIsDir && bIsDir) return 1;

          // exclude extension when comparing
          const filenameA = a.label.substring(
            0,
            a.label.length - path.extname(a.label).length,
          );
          const filenameB = b.label.substring(
            0,
            b.label.length - path.extname(b.label).length,
          );

          return (
            filenameA.localeCompare(filenameB) || a.label.localeCompare(b.label)
          );
        });

        if (isMounted) {
          setSuggestions(fetchedSuggestions);
          setShowSuggestions(fetchedSuggestions.length > 0);
          setActiveSuggestionIndex(fetchedSuggestions.length > 0 ? 0 : -1);
          setVisibleStartIndex(0);
        }
      } catch (error: unknown) {
        if (isNodeError(error) && error.code === 'ENOENT') {
          if (isMounted) {
            setSuggestions([]);
            setShowSuggestions(false);
          }
        } else {
          console.error(
            `Error fetching completion suggestions for ${partialPath}: ${getErrorMessage(error)}`,
          );
          if (isMounted) {
            resetCompletionState();
          }
        }
      }
      if (isMounted) {
        setIsLoadingSuggestions(false);
      }
    };

    const debounceTimeout = setTimeout(fetchSuggestions, 100);

    return () => {
      isMounted = false;
      clearTimeout(debounceTimeout);
    };
  }, [
    buffer.text,
    cursorRow,
    cursorCol,
    buffer.lines,
    dirs,
    cwd,
    commandIndex,
    resetCompletionState,
    slashCommands,
    commandContext,
    config,
    reverseSearchActive,
    setSuggestions,
    setShowSuggestions,
    setActiveSuggestionIndex,
    setIsLoadingSuggestions,
    setIsPerfectMatch,
    setVisibleStartIndex,
  ]);

  const handleAutocomplete = useCallback(
    (indexToUse: number) => {
      if (indexToUse < 0 || indexToUse >= suggestions.length) {
        return;
      }
      const suggestion = suggestions[indexToUse].value;

      if (completionStart.current === -1 || completionEnd.current === -1) {
        return;
      }

      const isSlash = (buffer.lines[cursorRow] || '')[commandIndex] === '/';
      let suggestionText = suggestion;
      if (isSlash) {
        // If we are inserting (not replacing), and the preceding character is not a space, add one.
        if (
          completionStart.current === completionEnd.current &&
          completionStart.current > commandIndex + 1 &&
          (buffer.lines[cursorRow] || '')[completionStart.current - 1] !== ' '
        ) {
          suggestionText = ' ' + suggestionText;
        }
      }

      suggestionText += ' ';

      buffer.replaceRangeByOffset(
        logicalPosToOffset(buffer.lines, cursorRow, completionStart.current),
        logicalPosToOffset(buffer.lines, cursorRow, completionEnd.current),
        suggestionText,
      );
    },
    [cursorRow, buffer, suggestions, commandIndex],
  );

  return {
    suggestions,
    activeSuggestionIndex,
    visibleStartIndex,
    showSuggestions,
    isLoadingSuggestions,
    isPerfectMatch,
    setActiveSuggestionIndex,
    setShowSuggestions,
    resetCompletionState,
    navigateUp,
    navigateDown,
    handleAutocomplete,
  };
}
