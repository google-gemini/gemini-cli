/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
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
} from '@google/gemini-cli-core';
import {
  MAX_SUGGESTIONS_TO_SHOW,
  Suggestion,
} from '../components/SuggestionsDisplay.js';
import { CommandContext, SlashCommand } from '../commands/types.js';

export interface UseCompletionReturn {
  suggestions: Suggestion[];
  activeSuggestionIndex: number;
  visibleStartIndex: number;
  showSuggestions: boolean;
  isLoadingSuggestions: boolean;
  setActiveSuggestionIndex: React.Dispatch<React.SetStateAction<number>>;
  setShowSuggestions: React.Dispatch<React.SetStateAction<boolean>>;
  resetCompletionState: () => void;
  navigateUp: () => void;
  navigateDown: () => void;
}

export function useCompletion(
  query: string,
  cwd: string,
  isActive: boolean,
  slashCommands: SlashCommand[],
  commandContext: CommandContext,
  config?: Config,
): UseCompletionReturn {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [activeSuggestionIndex, setActiveSuggestionIndex] =
    useState<number>(-1);
  const [visibleStartIndex, setVisibleStartIndex] = useState<number>(0);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const [isLoadingSuggestions, setIsLoadingSuggestions] =
    useState<boolean>(false);

  const resetCompletionState = useCallback(() => {
    setSuggestions([]);
    setActiveSuggestionIndex(-1);
    setVisibleStartIndex(0);
    setShowSuggestions(false);
    setIsLoadingSuggestions(false);
  }, []);

  const navigateUp = useCallback(() => {
    if (suggestions.length === 0) return;

    setActiveSuggestionIndex((prevActiveIndex) => {
      // Calculate new active index, handling wrap-around
      const newActiveIndex =
        prevActiveIndex <= 0 ? suggestions.length - 1 : prevActiveIndex - 1;

      // Adjust scroll position based on the new active index
      setVisibleStartIndex((prevVisibleStart) => {
        // Case 1: Wrapped around to the last item
        if (
          newActiveIndex === suggestions.length - 1 &&
          suggestions.length > MAX_SUGGESTIONS_TO_SHOW
        ) {
          return Math.max(0, suggestions.length - MAX_SUGGESTIONS_TO_SHOW);
        }
        // Case 2: Scrolled above the current visible window
        if (newActiveIndex < prevVisibleStart) {
          return newActiveIndex;
        }
        // Otherwise, keep the current scroll position
        return prevVisibleStart;
      });

      return newActiveIndex;
    });
  }, [suggestions.length]);

  const navigateDown = useCallback(() => {
    if (suggestions.length === 0) return;

    setActiveSuggestionIndex((prevActiveIndex) => {
      // Calculate new active index, handling wrap-around
      const newActiveIndex =
        prevActiveIndex >= suggestions.length - 1 ? 0 : prevActiveIndex + 1;

      // Adjust scroll position based on the new active index
      setVisibleStartIndex((prevVisibleStart) => {
        // Case 1: Wrapped around to the first item
        if (
          newActiveIndex === 0 &&
          suggestions.length > MAX_SUGGESTIONS_TO_SHOW
        ) {
          return 0;
        }
        // Case 2: Scrolled below the current visible window
        const visibleEndIndex = prevVisibleStart + MAX_SUGGESTIONS_TO_SHOW;
        if (newActiveIndex >= visibleEndIndex) {
          return newActiveIndex - MAX_SUGGESTIONS_TO_SHOW + 1;
        }
        // Otherwise, keep the current scroll position
        return prevVisibleStart;
      });

      return newActiveIndex;
    });
  }, [suggestions.length]);

  useEffect(() => {
    if (!isActive) {
      resetCompletionState();
      return;
    }

    const trimmedQuery = query.trimStart();

    if (trimmedQuery.startsWith('/')) {
      const fullPath = trimmedQuery.substring(1);
      const hasTrailingSpace = trimmedQuery.endsWith(' ');

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
      let currentLevel: SlashCommand[] | undefined = slashCommands;
      let leafCommand: SlashCommand | null = null;

      for (const part of commandPathParts) {
        if (!currentLevel) {
          leafCommand = null;
          currentLevel = [];
          break;
        }
        const found: SlashCommand | undefined = currentLevel.find(
          (cmd) => cmd.name === part || cmd.altName === part,
        );
        if (found) {
          leafCommand = found;
          currentLevel = found.subCommands;
        } else {
          leafCommand = null;
          currentLevel = [];
          break;
        }
      }

      // Handle the Ambiguous Case
      if (!hasTrailingSpace && currentLevel) {
        const exactMatchAsParent = currentLevel.find(
          (cmd) =>
            (cmd.name === partial || cmd.altName === partial) &&
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

      const depth = commandPathParts.length;

      // Provide Suggestions based on the now-corrected context

      // Argument Completion
      if (
        leafCommand?.completion &&
        (hasTrailingSpace ||
          (rawParts.length > depth && depth > 0 && partial !== ''))
      ) {
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
            (cmd.name.startsWith(partial) || cmd.altName?.startsWith(partial)),
        );

        // If a user's input is an exact match and it is a leaf command,
        // enter should submit immediately.
        if (potentialSuggestions.length > 0 && !hasTrailingSpace) {
          const perfectMatch = potentialSuggestions.find(
            (s) => s.name === partial,
          );
          if (perfectMatch && !perfectMatch.subCommands) {
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
    const atIndex = query.lastIndexOf('@');
    if (atIndex === -1) {
      resetCompletionState();
      return;
    }

    const partialPath = query.substring(atIndex + 1);
    const lastSlashIndex = partialPath.lastIndexOf('/');
    const baseDirRelative =
      lastSlashIndex === -1
        ? '.'
        : partialPath.substring(0, lastSlashIndex + 1);
    const prefix = unescapePath(
      lastSlashIndex === -1
        ? partialPath
        : partialPath.substring(lastSlashIndex + 1),
    );

    const baseDirAbsolute = path.resolve(cwd, baseDirRelative);

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
            cwd,
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
      maxResults = 50,
    ): Promise<Suggestion[]> => {
      const globPattern = `**/${searchPrefix}*`;
      const files = await glob(globPattern, {
        cwd,
        dot: searchPrefix.startsWith('.'),
        nocase: true,
      });

      const suggestions: Suggestion[] = files
        .map((file: string) => {
          const relativePath = path.relative(cwd, file);
          return {
            label: relativePath,
            value: escapePath(relativePath),
          };
        })
        .filter((s) => {
          if (fileDiscoveryService) {
            return !fileDiscoveryService.shouldIgnoreFile(
              s.label,
              filterOptions,
            ); // relative path
          }
          return true;
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
      const filterOptions = {
        respectGitIgnore: config?.getFileFilteringRespectGitIgnore() ?? true,
        respectGeminiIgnore: true,
      };

      try {
        // If there's no slash, or it's the root, do a recursive search from cwd
        if (
          partialPath.indexOf('/') === -1 &&
          prefix &&
          enableRecursiveSearch
        ) {
          if (fileDiscoveryService) {
            fetchedSuggestions = await findFilesWithGlob(
              prefix,
              fileDiscoveryService,
              filterOptions,
            );
          } else {
            fetchedSuggestions = await findFilesRecursively(
              cwd,
              prefix,
              fileDiscoveryService,
              filterOptions,
            );
          }
        } else {
          // Original behavior: list files in the specific directory
          const lowerPrefix = prefix.toLowerCase();
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
              cwd,
              path.join(baseDirAbsolute, entry.name),
            );
            if (
              fileDiscoveryService &&
              fileDiscoveryService.shouldIgnoreFile(relativePath, filterOptions)
            ) {
              continue;
            }

            filteredEntries.push(entry);
          }

          fetchedSuggestions = filteredEntries.map((entry) => {
            const label = entry.isDirectory() ? entry.name + '/' : entry.name;
            return {
              label,
              value: escapePath(label), // Value for completion should be just the name part
            };
          });
        }

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

          return a.label.localeCompare(b.label);
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
    query,
    cwd,
    isActive,
    resetCompletionState,
    slashCommands,
    commandContext,
    config,
  ]);

  return {
    suggestions,
    activeSuggestionIndex,
    visibleStartIndex,
    showSuggestions,
    isLoadingSuggestions,
    setActiveSuggestionIndex,
    setShowSuggestions,
    resetCompletionState,
    navigateUp,
    navigateDown,
  };
}
