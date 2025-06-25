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
import { SlashCommand } from './slashCommandProcessor.js';

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

    const trimmedQuery = query.trimStart(); // Trim leading whitespace

    // --- Handle Slash Command Completion ---
    if (trimmedQuery.startsWith('/')) {
      const parts = trimmedQuery.substring(1).split(' ');
      const commandName = parts[0];
      const subCommand = parts.slice(1).join(' ');

      const command = slashCommands.find(
        (cmd) => cmd.name === commandName || cmd.altName === commandName,
      );

      if (command && command.completion) {
        const fetchAndSetSuggestions = async () => {
          setIsLoadingSuggestions(true);
          if (command.completion) {
            const results = await command.completion();
            const filtered = results.filter((r) => r.startsWith(subCommand));
            const newSuggestions = filtered.map((s) => ({
              label: s,
              value: s,
            }));
            setSuggestions(newSuggestions);
            setShowSuggestions(newSuggestions.length > 0);
            setActiveSuggestionIndex(newSuggestions.length > 0 ? 0 : -1);
          }
          setIsLoadingSuggestions(false);
        };
        fetchAndSetSuggestions();
        return;
      }

      const partialCommand = trimmedQuery.substring(1);
      const filteredSuggestions = slashCommands
        .filter(
          (cmd) =>
            cmd.name.startsWith(partialCommand) ||
            cmd.altName?.startsWith(partialCommand),
        )
        // Filter out ? and any other single character commands unless it's the only char
        .filter((cmd) => {
          const nameMatch = cmd.name.startsWith(partialCommand);
          const altNameMatch = cmd.altName?.startsWith(partialCommand);
          if (partialCommand.length === 1) {
            return nameMatch || altNameMatch; // Allow single char match if query is single char
          }
          return (
            (nameMatch && cmd.name.length > 1) ||
            (altNameMatch && cmd.altName && cmd.altName.length > 1)
          );
        })
        .filter((cmd) => cmd.description)
        .map((cmd) => ({
          label: cmd.name, // Always show the main name as label
          value: cmd.name, // Value should be the main command name for execution
          description: cmd.description,
        }))
        .sort((a, b) => a.label.localeCompare(b.label));

      setSuggestions(filteredSuggestions);
      setShowSuggestions(filteredSuggestions.length > 0);
      setActiveSuggestionIndex(filteredSuggestions.length > 0 ? 0 : -1);
      setVisibleStartIndex(0);
      setIsLoadingSuggestions(false);
      return;
    }

    // --- Handle At Command Completion ---
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
      fileDiscovery: { shouldGitIgnoreFile: (path: string) => boolean } | null,
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

          // Check if this entry should be ignored by git-aware filtering
          if (
            fileDiscovery &&
            fileDiscovery.shouldGitIgnoreFile(entryPathFromRoot)
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
            return !fileDiscoveryService.shouldGitIgnoreFile(s.label); // relative path
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
            );
          } else {
            fetchedSuggestions = await findFilesRecursively(
              cwd,
              prefix,
              fileDiscoveryService,
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
              fileDiscoveryService.shouldGitIgnoreFile(relativePath)
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
  }, [query, cwd, isActive, resetCompletionState, slashCommands, config]);

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
