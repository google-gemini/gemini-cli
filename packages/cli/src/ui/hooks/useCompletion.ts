/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  DEFAULT_GEMINI_FLASH_MODEL,
  getResponseText,
} from '@google/gemini-cli-core';
import { Content, GenerateContentConfig } from '@google/genai';
import {
  MAX_SUGGESTIONS_TO_SHOW,
  Suggestion,
} from '../components/SuggestionsDisplay.js';
import { CommandContext, SlashCommand } from '../commands/types.js';
import { TextBuffer } from '../components/shared/text-buffer.js';
import { isSlashCommand } from '../utils/commandUtils.js';
import { toCodePoints } from '../utils/textUtils.js';
import { Settings } from '../../config/settings.js';

// Debounce utility
const useDebounce = (callback: () => void, delay: number, deps: React.DependencyList) => {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(callback, delay);
    
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, deps);
};

// Constants - fallback values if not configured
const DEFAULT_PROMPT_COMPLETION_MIN_LENGTH = 5;
const DEFAULT_PROMPT_COMPLETION_DEBOUNCE_MS = 500;

export interface PromptCompletion {
  text: string;
  isLoading: boolean;
  isActive: boolean;
  accept: () => void;
  clear: () => void;
  markSelected: (selectedText: string) => void;
}

export interface UseCompletionReturn {
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
  promptCompletion: PromptCompletion;
}

export function useCompletion(
  buffer: TextBuffer,
  cwd: string,
  slashCommands: readonly SlashCommand[],
  commandContext: CommandContext,
  config?: Config,
  settings?: Settings,
): UseCompletionReturn {
  // Initialize prompt completion settings once
  const promptCompletionSettings = settings?.promptCompletion;
  const isPromptCompletionEnabled = promptCompletionSettings?.enabled ?? false;
  const promptCompletionMinLength = promptCompletionSettings?.minLength ?? DEFAULT_PROMPT_COMPLETION_MIN_LENGTH;
  const promptCompletionDebounceMs = promptCompletionSettings?.debounceMs ?? DEFAULT_PROMPT_COMPLETION_DEBOUNCE_MS;

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [activeSuggestionIndex, setActiveSuggestionIndex] =
    useState<number>(-1);
  const [visibleStartIndex, setVisibleStartIndex] = useState<number>(0);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const [isLoadingSuggestions, setIsLoadingSuggestions] =
    useState<boolean>(false);
  const [isPerfectMatch, setIsPerfectMatch] = useState<boolean>(false);
  
  const [ghostText, setGhostText] = useState<string>('');
  const [isLoadingGhostText, setIsLoadingGhostText] = useState<boolean>(false);
  
  const abortControllerRef = useRef<AbortController | null>(null);
  
  const [justSelectedSuggestion, setJustSelectedSuggestion] = useState<boolean>(false);
  const lastSelectedTextRef = useRef<string>('');

  const resetCompletionState = useCallback(() => {
    setSuggestions([]);
    setActiveSuggestionIndex(-1);
    setVisibleStartIndex(0);
    setShowSuggestions(false);
    setIsLoadingSuggestions(false);
    setIsPerfectMatch(false);
    setGhostText('');
    setIsLoadingGhostText(false);
  }, []);

  const clearGhostText = useCallback(() => {
    setGhostText('');
    setIsLoadingGhostText(false);
  }, []);

  const acceptGhostText = useCallback(() => {
    if (ghostText && ghostText.length > buffer.text.length) {
      buffer.setText(ghostText);
      setGhostText('');
      setJustSelectedSuggestion(true);
      lastSelectedTextRef.current = ghostText;
    }
  }, [ghostText, buffer]);

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

  // Check if cursor is after @ or / without unescaped spaces,or should show prompt completion
  const isActive = useMemo(() => {
    if (isSlashCommand(buffer.text.trim())) {
      return true;
    }

    // Check for prompt completion - only if enabled in config
    if (isPromptCompletionEnabled) {
      const trimmedText = buffer.text.trim();
      
      if (trimmedText.length >= promptCompletionMinLength && 
          !trimmedText.startsWith('/') && 
          !trimmedText.includes('@')) {
        return true;
      }
    }

    // For other completions like '@', we search backwards from the cursor.
    const [row, col] = buffer.cursor;
    const currentLine = buffer.lines[row] || '';
    const codePoints = toCodePoints(currentLine);

    for (let i = col - 1; i >= 0; i--) {
      const char = codePoints[i];

      if (char === ' ') {
        // Check for unescaped spaces.
        let backslashCount = 0;
        for (let j = i - 1; j >= 0 && codePoints[j] === '\\'; j--) {
          backslashCount++;
        }
        if (backslashCount % 2 === 0) {
          return false; // Inactive on unescaped space.
        }
      } else if (char === '@') {
        // Active if we find an '@' before any unescaped space.
        return true;
      }
    }

    return false;
  }, [buffer.text, buffer.cursor, buffer.lines, isPromptCompletionEnabled, promptCompletionMinLength]);

  const markSuggestionSelected = useCallback((selectedText: string) => {
    setJustSelectedSuggestion(true);
    lastSelectedTextRef.current = selectedText;
  }, []);

  const generatePromptSuggestions = useCallback(async () => {
    const trimmedText = buffer.text.trim();
    const geminiClient = config?.getGeminiClient();
    
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    if (trimmedText.length < promptCompletionMinLength || !geminiClient ||
        trimmedText.startsWith('/') || trimmedText.includes('@') ||
        !isPromptCompletionEnabled) {
      clearGhostText();
      return;
    }

    setIsLoadingGhostText(true);
    
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    try {
      const contents: Content[] = [
        {
          role: 'user',
          parts: [
            {
              text: `You are a professional prompt engineering assistant. Complete the user's partial prompt with expert precision and clarity.\n\nUser's input: "${trimmedText}"\n\nContinue this prompt by adding specific, actionable details that align with the user's intent. Focus on:\n- Clear, precise language\n- Structured requirements\n- Professional terminology\n- Measurable outcomes\n\nStart your response with the exact user text ("${trimmedText}") followed by your completion. Provide practical, implementation-focused suggestions rather than creative interpretations.\n\nFormat: Plain text only. Single completion. Match the user's language.`,
            },
          ],
        },
      ];
      const generationConfig: GenerateContentConfig = {
        temperature: 0.3,
        maxOutputTokens: 16000,
        thinkingConfig: {
          thinkingBudget: 0,
        }
      };

      const response = await geminiClient.generateContent(
        contents,
        generationConfig,
        signal,
        DEFAULT_GEMINI_FLASH_MODEL,
      );

      // Check if request was aborted
      if (signal.aborted) {
        return;
      }

      if (response) {
        const responseText = getResponseText(response);
        
        if (responseText) {
          const suggestionText = responseText.trim();
          
          if (suggestionText.length > 0 && suggestionText.startsWith(trimmedText)) {
            setGhostText(suggestionText);
          } else {
            clearGhostText();
          }
        }
      }
    } catch (error) {
      if (!(signal.aborted || (error instanceof Error && error.name === 'AbortError'))) {
        console.error('prompt completion error:', error);
      }
      clearGhostText();
    } finally {
      if (!signal.aborted) {
        setIsLoadingGhostText(false);
      }
    }
  }, [buffer.text, config, clearGhostText, promptCompletionMinLength, isPromptCompletionEnabled]);

  const isCursorAtEnd = useCallback(() => {
    const [cursorRow, cursorCol] = buffer.cursor;
    const totalLines = buffer.lines.length;
    if (cursorRow !== totalLines - 1) {
      return false;
    }
    
    const lastLine = buffer.lines[cursorRow] || '';
    return cursorCol >= lastLine.length;
  }, [buffer.cursor, buffer.lines]);

  const handlePromptCompletion = useCallback(() => {
    if (!isCursorAtEnd()) {
      clearGhostText();
      return;
    }
    
    const trimmedText = buffer.text.trim();
    
    if (justSelectedSuggestion && trimmedText === lastSelectedTextRef.current) {
      return;
    }
    
    if (trimmedText !== lastSelectedTextRef.current) {
      setJustSelectedSuggestion(false);
      lastSelectedTextRef.current = '';
    }
    
    generatePromptSuggestions();
  }, [generatePromptSuggestions, justSelectedSuggestion, isCursorAtEnd, clearGhostText]);
  
  useDebounce(handlePromptCompletion, promptCompletionDebounceMs, [buffer.text, buffer.cursor]);

  useEffect(() => {
    if (!isActive) {
      resetCompletionState();
      return;
    }

    const trimmedQuery = buffer.text.trimStart();

    if (trimmedQuery.startsWith('/')) {
      // Always reset perfect match at the beginning of processing.
      setIsPerfectMatch(false);

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

      // Handle the Ambiguous Case
      if (!hasTrailingSpace && currentLevel) {
        const exactMatchAsParent = currentLevel.find(
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
    const atIndex = buffer.text.lastIndexOf('@');
    if (atIndex === -1) {
      // No @ character found, check for prompt completion
      if (buffer.text.trim().length >= promptCompletionMinLength && 
          !buffer.text.trim().startsWith('/') && 
          !buffer.text.trim().includes('@') &&
          config?.getGeminiClient() &&
          isPromptCompletionEnabled) {
        // handlePromptCompletion is debounced automatically
      }
      return;
    }

    const partialPath = buffer.text.substring(atIndex + 1);
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
        .map((file: string) => ({
          label: file,
          value: escapePath(file),
        }))
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
      const filterOptions =
        config?.getFileFilteringOptions() ?? DEFAULT_FILE_FILTERING_OPTIONS;

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
              null,
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

        // Like glob, we always return forwardslashes, even in windows.
        fetchedSuggestions = fetchedSuggestions.map((suggestion) => ({
          ...suggestion,
          label: suggestion.label.replace(/\\/g, '/'),
          value: suggestion.value.replace(/\\/g, '/'),
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
    cwd,
    isActive,
    resetCompletionState,
    slashCommands,
    commandContext,
    config,
  ]);

  const handleAutocomplete = useCallback(
    (indexToUse: number) => {
      if (indexToUse < 0 || indexToUse >= suggestions.length) {
        return;
      }
      const query = buffer.text;
      const suggestion = suggestions[indexToUse].value;

      if (query.trimStart().startsWith('/')) {
        const hasTrailingSpace = query.endsWith(' ');
        const parts = query
          .trimStart()
          .substring(1)
          .split(/\s+/)
          .filter(Boolean);

        let isParentPath = false;
        // If there's no trailing space, we need to check if the current query
        // is already a complete path to a parent command.
        if (!hasTrailingSpace) {
          let currentLevel: readonly SlashCommand[] | undefined = slashCommands;
          for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const found: SlashCommand | undefined = currentLevel?.find(
              (cmd) => cmd.name === part || cmd.altNames?.includes(part),
            );

            if (found) {
              if (i === parts.length - 1 && found.subCommands) {
                isParentPath = true;
              }
              currentLevel = found.subCommands as
                | readonly SlashCommand[]
                | undefined;
            } else {
              // Path is invalid, so it can't be a parent path.
              currentLevel = undefined;
              break;
            }
          }
        }

        // Determine the base path of the command.
        // - If there's a trailing space, the whole command is the base.
        // - If it's a known parent path, the whole command is the base.
        // - If the last part is a complete argument, the whole command is the base.
        // - Otherwise, the base is everything EXCEPT the last partial part.
        const lastPart = parts.length > 0 ? parts[parts.length - 1] : '';
        const isLastPartACompleteArg =
          lastPart.startsWith('--') && lastPart.includes('=');

        const basePath =
          hasTrailingSpace || isParentPath || isLastPartACompleteArg
            ? parts
            : parts.slice(0, -1);
        const newValue = `/${[...basePath, suggestion].join(' ')} `;

        buffer.setText(newValue);
      } else {
        const atIndex = query.lastIndexOf('@');
        if (atIndex === -1) return;
        const pathPart = query.substring(atIndex + 1);
        const lastSlashIndexInPath = pathPart.lastIndexOf('/');
        let autoCompleteStartIndex = atIndex + 1;
        if (lastSlashIndexInPath !== -1) {
          autoCompleteStartIndex += lastSlashIndexInPath + 1;
        }
        buffer.replaceRangeByOffset(
          autoCompleteStartIndex,
          buffer.text.length,
          suggestion,
        );
      }
      resetCompletionState();
    },
    [resetCompletionState, buffer, suggestions, slashCommands],
  );

  // Ghost text validation - clear if it doesn't match current text
  useEffect(() => {
    const currentText = buffer.text.trim();
    
    if (ghostText && currentText.length > 0 && !ghostText.startsWith(currentText)) {
      clearGhostText();
    }
  }, [buffer.text, ghostText, clearGhostText]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

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
    promptCompletion: {
      text: ghostText,
      isLoading: isLoadingGhostText,
      isActive,
      accept: acceptGhostText,
      clear: clearGhostText,
      markSelected: markSuggestionSelected,
    },
  };
}
