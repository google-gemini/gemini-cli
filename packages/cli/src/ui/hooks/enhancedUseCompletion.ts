/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import { Config, FileDiscoveryService } from '@google/gemini-cli-core';
import { MAX_SUGGESTIONS_TO_SHOW } from '../components/SuggestionsDisplay.js';
import { SlashCommand } from './slashCommandProcessor.js';
import { useFileContext } from '../contexts/FileContextContext.js';
import { EnhancedFileSuggestion } from '../components/EnhancedFilePicker.js';

export interface UseEnhancedCompletionReturn {
  suggestions: EnhancedFileSuggestion[];
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

/**
 * Estimate token count for a file based on its size
 * Rough approximation: 1 token ≈ 4 characters for English text
 */
function estimateTokenCount(fileSize: number): number {
  return Math.ceil(fileSize / 4);
}

export function useEnhancedCompletion(
  query: string,
  cwd: string,
  isActive: boolean,
  slashCommands: SlashCommand[],
  config?: Config,
): UseEnhancedCompletionReturn {
  const [suggestions, setSuggestions] = useState<EnhancedFileSuggestion[]>([]);
  const [activeSuggestionIndex, setActiveSuggestionIndex] =
    useState<number>(-1);
  const [visibleStartIndex, setVisibleStartIndex] = useState<number>(0);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const [isLoadingSuggestions, setIsLoadingSuggestions] =
    useState<boolean>(false);

  const { actions, state } = useFileContext();

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
      const newActiveIndex =
        prevActiveIndex <= 0 ? suggestions.length - 1 : prevActiveIndex - 1;

      setVisibleStartIndex((prevVisibleStart) => {
        if (
          newActiveIndex === suggestions.length - 1 &&
          suggestions.length > MAX_SUGGESTIONS_TO_SHOW
        ) {
          return Math.max(0, suggestions.length - MAX_SUGGESTIONS_TO_SHOW);
        }
        if (newActiveIndex < prevVisibleStart) {
          return newActiveIndex;
        }
        return prevVisibleStart;
      });

      return newActiveIndex;
    });
  }, [suggestions.length]);

  const navigateDown = useCallback(() => {
    if (suggestions.length === 0) return;

    setActiveSuggestionIndex((prevActiveIndex) => {
      const newActiveIndex =
        prevActiveIndex >= suggestions.length - 1 ? 0 : prevActiveIndex + 1;

      setVisibleStartIndex((prevVisibleStart) => {
        if (
          newActiveIndex === 0 &&
          suggestions.length > MAX_SUGGESTIONS_TO_SHOW
        ) {
          return 0;
        }
        const visibleEndIndex = prevVisibleStart + MAX_SUGGESTIONS_TO_SHOW;
        if (newActiveIndex >= visibleEndIndex) {
          return newActiveIndex - MAX_SUGGESTIONS_TO_SHOW + 1;
        }
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

    // Handle Slash Command Completion (existing logic)
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
              filepath: '',
              size: 0,
              estimatedTokens: 0,
              isInContext: false,
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
        .filter((cmd) => {
          const nameMatch = cmd.name.startsWith(partialCommand);
          const altNameMatch = cmd.altName?.startsWith(partialCommand);
          if (partialCommand.length === 1) {
            return nameMatch || altNameMatch;
          }
          return (
            (nameMatch && cmd.name.length > 1) ||
            (altNameMatch && cmd.altName && cmd.altName.length > 1)
          );
        })
        .filter((cmd) => cmd.description)
        .map((cmd) => ({
          label: cmd.name,
          value: cmd.name,
          description: cmd.description,
          filepath: '',
          size: 0,
          estimatedTokens: 0,
          isInContext: false,
        }))
        .sort((a, b) => a.label.localeCompare(b.label));

      setSuggestions(filteredSuggestions);
      setShowSuggestions(filteredSuggestions.length > 0);
      setActiveSuggestionIndex(filteredSuggestions.length > 0 ? 0 : -1);
      setVisibleStartIndex(0);
      setIsLoadingSuggestions(false);
      return;
    }

    // Handle Enhanced At Command Completion
    const atIndex = query.lastIndexOf('@');
    if (atIndex === -1) {
      resetCompletionState();
      return;
    }

    const partialPath = query.substring(atIndex + 1);

    // Check if this is a context management command
    const contextCommands = [
      'list',
      'show',
      'status',
      'remove',
      'clear',
      'clear-all',
      'help',
    ];
    const isContextCommand = contextCommands.some(
      (cmd) => partialPath === cmd || partialPath.startsWith(cmd + ' '),
    );

    if (isContextCommand) {
      // Handle context command completion
      const commandParts = partialPath.split(' ');
      const command = commandParts[0];
      const args = commandParts.slice(1);

      let contextSuggestions: EnhancedFileSuggestion[] = [];

      if (command === 'remove' && args.length === 0) {
        // Suggest files that are in context for removal
        const contextFiles = Array.from(state.files.keys());
        contextSuggestions = contextFiles
          .filter((filepath: string) =>
            filepath.toLowerCase().includes(partialPath.toLowerCase()),
          )
          .map((filepath: string) => {
            const fileInfo = actions.getFileInfo(filepath);
            return {
              label: filepath,
              value: `@remove ${filepath}`,
              filepath,
              size: fileInfo?.size || 0,
              estimatedTokens: fileInfo?.estimatedTokens || 0,
              isInContext: true,
            };
          });
      } else {
        // Suggest available context commands
        contextSuggestions = contextCommands
          .filter((cmd) => cmd.startsWith(command))
          .map((cmd) => ({
            label: cmd,
            value: `@${cmd}`,
            filepath: '',
            size: 0,
            estimatedTokens: 0,
            isInContext: false,
          }));
      }

      setSuggestions(contextSuggestions);
      setShowSuggestions(contextSuggestions.length > 0);
      setActiveSuggestionIndex(contextSuggestions.length > 0 ? 0 : -1);
      setVisibleStartIndex(0);
      setIsLoadingSuggestions(false);
      return;
    }

    // Handle regular file completion (enhanced with context info)
    const findFilesRecursively = async (
      startDir: string,
      searchPrefix: string,
      fileDiscovery: { shouldGitIgnoreFile: (path: string) => boolean } | null,
      currentRelativePath = '',
      depth = 0,
      maxDepth = 10,
      maxResults = 50,
    ): Promise<EnhancedFileSuggestion[]> => {
      const results: EnhancedFileSuggestion[] = [];
      if (depth > maxDepth || results.length >= maxResults) return results;

      try {
        const entries = await fs.readdir(startDir, { withFileTypes: true });
        const sortedEntries = entries.sort((a, b) =>
          a.name.localeCompare(b.name),
        );

        for (const entry of sortedEntries) {
          if (results.length >= maxResults) break;

          const entryPath = path.join(startDir, entry.name);
          const relativePath = path
            .join(currentRelativePath, entry.name)
            .replace(/\\/g, '/');

          // Skip git-ignored files
          if (fileDiscovery?.shouldGitIgnoreFile(relativePath)) {
            continue;
          }

          if (entry.isDirectory()) {
            // Recursively search directories
            const subResults = await findFilesRecursively(
              entryPath,
              searchPrefix,
              fileDiscovery,
              relativePath,
              depth + 1,
              maxDepth,
              maxResults - results.length,
            );
            results.push(...subResults);
          } else if (entry.isFile()) {
            // Check if file matches search prefix
            if (
              entry.name.toLowerCase().includes(searchPrefix.toLowerCase()) ||
              relativePath.toLowerCase().includes(searchPrefix.toLowerCase())
            ) {
              try {
                const stats = await fs.stat(entryPath);
                const isInContext = actions.isFileInContext(relativePath);

                results.push({
                  label: relativePath,
                  value: `@${relativePath}`,
                  filepath: relativePath,
                  size: stats.size,
                  estimatedTokens: estimateTokenCount(stats.size),
                  isInContext,
                });
              } catch (_error) {
                // Skip files we can't stat
                continue;
              }
            }
          }
        }
      } catch (_error) {
        // Skip directories we can't read
      }

      return results;
    };

    const findFilesWithGlob = async (
      searchPrefix: string,
      fileDiscoveryService: FileDiscoveryService,
      maxResults = 50,
    ): Promise<EnhancedFileSuggestion[]> => {
      try {
        const pattern = `**/*${searchPrefix}*`;
        const files = await glob(pattern, {
          cwd,
          ignore: ['node_modules/**', '.git/**', 'dist/**', 'build/**'],
        });

        const results: EnhancedFileSuggestion[] = [];
        for (const file of files.slice(0, maxResults)) {
          try {
            const filePath = path.join(cwd, file);
            const stats = await fs.stat(filePath);
            const isInContext = actions.isFileInContext(file);

            results.push({
              label: file,
              value: `@${file}`,
              filepath: file,
              size: stats.size,
              estimatedTokens: estimateTokenCount(stats.size),
              isInContext,
            });
          } catch (_error) {
            // Skip files we can't stat
            continue;
          }
        }

        return results;
      } catch (_error) {
        return [];
      }
    };

    const fetchSuggestions = async () => {
      setIsLoadingSuggestions(true);

      try {
        let fileSuggestions: EnhancedFileSuggestion[] = [];

        if (config?.getEnableRecursiveFileSearch()) {
          // Use recursive search
          fileSuggestions = await findFilesRecursively(
            cwd,
            partialPath,
            config.getFileService(),
            '',
            0,
            10,
            50,
          );
        } else {
          // Use glob search
          const fileDiscovery = config?.getFileService();
          if (fileDiscovery) {
            fileSuggestions = await findFilesWithGlob(
              partialPath,
              fileDiscovery,
              50,
            );
          }
        }

        // Sort suggestions: files in context first, then alphabetically
        fileSuggestions.sort((a, b) => {
          if (a.isInContext && !b.isInContext) return -1;
          if (!a.isInContext && b.isInContext) return 1;
          return a.label.localeCompare(b.label);
        });

        setSuggestions(fileSuggestions);
        setShowSuggestions(fileSuggestions.length > 0);
        setActiveSuggestionIndex(fileSuggestions.length > 0 ? 0 : -1);
        setVisibleStartIndex(0);
      } catch (_error) {
        console.error('Error fetching file suggestions:', _error);
        setSuggestions([]);
        setShowSuggestions(false);
        setActiveSuggestionIndex(-1);
      } finally {
        setIsLoadingSuggestions(false);
      }
    };

    fetchSuggestions();
  }, [
    query,
    cwd,
    isActive,
    slashCommands,
    config,
    actions,
    state,
    resetCompletionState,
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
