/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useReducer, useRef } from 'react';
import { setTimeout as setTimeoutPromise } from 'node:timers/promises';
import * as path from 'node:path';
import type { Config, FileSearch } from '@google/gemini-cli-core';
import {
  FileSearchFactory,
  escapePath,
  FileDiscoveryService,
} from '@google/gemini-cli-core';
import type { Suggestion } from '../components/SuggestionsDisplay.js';
import { MAX_SUGGESTIONS_TO_SHOW } from '../components/SuggestionsDisplay.js';
import { CommandKind } from '../commands/types.js';
import { AsyncFzf } from 'fzf';

const DEFAULT_SEARCH_TIMEOUT_MS = 5000;

export enum AtCompletionStatus {
  IDLE = 'idle',
  INITIALIZING = 'initializing',
  READY = 'ready',
  SEARCHING = 'searching',
  ERROR = 'error',
}

interface AtCompletionState {
  status: AtCompletionStatus;
  suggestions: Suggestion[];
  isLoading: boolean;
  pattern: string | null;
}

type AtCompletionAction =
  | { type: 'INITIALIZE' }
  | { type: 'INITIALIZE_SUCCESS' }
  | { type: 'SEARCH'; payload: string }
  | { type: 'SEARCH_SUCCESS'; payload: Suggestion[] }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'ERROR' }
  | { type: 'RESET' };

const initialState: AtCompletionState = {
  status: AtCompletionStatus.IDLE,
  suggestions: [],
  isLoading: false,
  pattern: null,
};

function atCompletionReducer(
  state: AtCompletionState,
  action: AtCompletionAction,
): AtCompletionState {
  switch (action.type) {
    case 'INITIALIZE':
      return {
        ...state,
        status: AtCompletionStatus.INITIALIZING,
        isLoading: true,
      };
    case 'INITIALIZE_SUCCESS':
      return { ...state, status: AtCompletionStatus.READY, isLoading: false };
    case 'SEARCH':
      // Keep old suggestions, don't set loading immediately
      return {
        ...state,
        status: AtCompletionStatus.SEARCHING,
        pattern: action.payload,
      };
    case 'SEARCH_SUCCESS':
      return {
        ...state,
        status: AtCompletionStatus.READY,
        suggestions: action.payload,
        isLoading: false,
      };
    case 'SET_LOADING':
      // Only show loading if we are still in a searching state
      if (state.status === AtCompletionStatus.SEARCHING) {
        return { ...state, isLoading: action.payload, suggestions: [] };
      }
      return state;
    case 'ERROR':
      return {
        ...state,
        status: AtCompletionStatus.ERROR,
        isLoading: false,
        suggestions: [],
      };
    case 'RESET':
      return initialState;
    default:
      return state;
  }
}

export interface UseAtCompletionProps {
  enabled: boolean;
  pattern: string;
  config: Config | undefined;
  cwd: string;
  setSuggestions: (suggestions: Suggestion[]) => void;
  setIsLoadingSuggestions: (isLoading: boolean) => void;
}

interface ResourceSuggestionCandidate {
  searchKey: string;
  suggestion: Suggestion;
}

function buildResourceCandidates(
  config?: Config,
): ResourceSuggestionCandidate[] {
  const registry = config?.getResourceRegistry?.();
  if (!registry) {
    return [];
  }

  const resources = registry.getAllResources().map((resource) => {
    // Use serverName:uri format to disambiguate resources from different MCP servers
    const prefixedUri = `${resource.serverName}:${resource.uri}`;
    return {
      // Include prefixedUri in searchKey so users can search by the displayed format
      searchKey: `${prefixedUri} ${resource.name ?? ''}`.toLowerCase(),
      suggestion: {
        label: prefixedUri,
        value: prefixedUri,
      },
    } satisfies ResourceSuggestionCandidate;
  });

  return resources;
}

function buildAgentCandidates(config?: Config): Suggestion[] {
  const registry = config?.getAgentRegistry?.();
  if (!registry) {
    return [];
  }
  return registry.getAllDefinitions().map((def) => ({
    label: def.name,
    value: def.name,
    commandKind: CommandKind.AGENT,
  }));
}

async function searchResourceCandidates(
  pattern: string,
  candidates: ResourceSuggestionCandidate[],
): Promise<Suggestion[]> {
  if (candidates.length === 0) {
    return [];
  }

  const normalizedPattern = pattern.toLowerCase();
  if (!normalizedPattern) {
    return candidates
      .slice(0, MAX_SUGGESTIONS_TO_SHOW)
      .map((candidate) => candidate.suggestion);
  }

  const fzf = new AsyncFzf(candidates, {
    selector: (candidate: ResourceSuggestionCandidate) => candidate.searchKey,
  });
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const results = await fzf.find(normalizedPattern, {
    limit: MAX_SUGGESTIONS_TO_SHOW * 3,
  });
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return results.map(
    (result: { item: ResourceSuggestionCandidate }) => result.item.suggestion,
  );
}

async function searchAgentCandidates(
  pattern: string,
  candidates: Suggestion[],
): Promise<Suggestion[]> {
  if (candidates.length === 0) {
    return [];
  }
  const normalizedPattern = pattern.toLowerCase();
  if (!normalizedPattern) {
    return candidates.slice(0, MAX_SUGGESTIONS_TO_SHOW);
  }
  const fzf = new AsyncFzf(candidates, {
    selector: (s: Suggestion) => s.label,
  });
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const results = await fzf.find(normalizedPattern, {
    limit: MAX_SUGGESTIONS_TO_SHOW,
  });
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return results.map((r: { item: Suggestion }) => r.item);
}

export function useAtCompletion(props: UseAtCompletionProps): void {
  const {
    enabled,
    pattern,
    config,
    cwd,
    setSuggestions,
    setIsLoadingSuggestions,
  } = props;
  const [state, dispatch] = useReducer(atCompletionReducer, initialState);
  const fileSearchMap = useRef<Map<string, FileSearch>>(new Map());
  const initEpoch = useRef(0);
  const searchAbortController = useRef<AbortController | null>(null);
  const slowSearchTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setSuggestions(state.suggestions);
  }, [state.suggestions, setSuggestions]);

  useEffect(() => {
    setIsLoadingSuggestions(state.isLoading);
  }, [state.isLoading, setIsLoadingSuggestions]);

  const resetFileSearchState = () => {
    fileSearchMap.current.clear();
    initEpoch.current += 1;
    dispatch({ type: 'RESET' });
  };

  useEffect(() => {
    resetFileSearchState();
  }, [cwd, config]);

  useEffect(() => {
    const workspaceContext = config?.getWorkspaceContext?.();
    if (!workspaceContext) return;

    const unsubscribe =
      workspaceContext.onDirectoriesChanged(resetFileSearchState);

    return unsubscribe;
  }, [config]);

  // Reacts to user input (`pattern`) ONLY.
  useEffect(() => {
    if (!enabled) {
      // reset when first getting out of completion suggestions
      if (
        state.status === AtCompletionStatus.READY ||
        state.status === AtCompletionStatus.ERROR
      ) {
        dispatch({ type: 'RESET' });
      }
      return;
    }
    if (pattern === null) {
      dispatch({ type: 'RESET' });
      return;
    }

    if (state.status === AtCompletionStatus.IDLE) {
      dispatch({ type: 'INITIALIZE' });
    } else if (
      (state.status === AtCompletionStatus.READY ||
        state.status === AtCompletionStatus.SEARCHING) &&
      pattern.toLowerCase() !== state.pattern // Only search if the pattern has changed
    ) {
      dispatch({ type: 'SEARCH', payload: pattern.toLowerCase() });
    }
  }, [enabled, pattern, state.status, state.pattern]);

  // The "Worker" that performs async operations based on status.
  useEffect(() => {
    const initialize = async () => {
      const currentEpoch = initEpoch.current;
      try {
        const directories = config
          ?.getWorkspaceContext?.()
          ?.getDirectories() ?? [cwd];

        const initPromises: Array<Promise<void>> = [];

        for (const dir of directories) {
          if (fileSearchMap.current.has(dir)) continue;

          const searcher = FileSearchFactory.create({
            projectRoot: dir,
            ignoreDirs: [],
            fileDiscoveryService: new FileDiscoveryService(
              dir,
              config?.getFileFilteringOptions(),
            ),
            cache: true,
            cacheTtl: 30,
            enableRecursiveFileSearch:
              config?.getEnableRecursiveFileSearch() ?? true,
            enableFuzzySearch:
              config?.getFileFilteringEnableFuzzySearch() ?? true,
            maxFiles: config?.getFileFilteringOptions()?.maxFileCount,
          });

          initPromises.push(
            searcher.initialize().then(() => {
              if (initEpoch.current === currentEpoch) {
                fileSearchMap.current.set(dir, searcher);
              }
            }),
          );
        }

        await Promise.all(initPromises);

        if (initEpoch.current !== currentEpoch) return;

        dispatch({ type: 'INITIALIZE_SUCCESS' });
        if (state.pattern !== null) {
          dispatch({ type: 'SEARCH', payload: state.pattern });
        }
      } catch (_) {
        if (initEpoch.current === currentEpoch) {
          dispatch({ type: 'ERROR' });
        }
      }
    };

    const search = async () => {
      if (fileSearchMap.current.size === 0 || state.pattern === null) {
        return;
      }

      const currentPattern = state.pattern;

      if (slowSearchTimer.current) {
        clearTimeout(slowSearchTimer.current);
      }

      const controller = new AbortController();
      searchAbortController.current = controller;

      slowSearchTimer.current = setTimeout(() => {
        dispatch({ type: 'SET_LOADING', payload: true });
      }, 200);

      const timeoutMs =
        config?.getFileFilteringOptions()?.searchTimeout ??
        DEFAULT_SEARCH_TIMEOUT_MS;

      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      (async () => {
        try {
          await setTimeoutPromise(timeoutMs, undefined, {
            signal: controller.signal,
          });
          controller.abort();
        } catch {
          // ignore
        }
      })();

      try {
        const directories = config
          ?.getWorkspaceContext?.()
          ?.getDirectories() ?? [cwd];
        const cwdRealpath = directories[0];

        const allSearchPromises = [...fileSearchMap.current.entries()].map(
          async ([dir, searcher]): Promise<string[]> => {
            const results = await searcher.search(currentPattern, {
              signal: controller.signal,
              maxResults: MAX_SUGGESTIONS_TO_SHOW * 3,
            });

            if (dir !== cwdRealpath) {
              return results.map((p: string) => path.join(dir, p));
            }
            return results;
          },
        );

        const allResults = await Promise.all(allSearchPromises);

        if (slowSearchTimer.current) {
          clearTimeout(slowSearchTimer.current);
        }

        if (controller.signal.aborted) {
          return;
        }

        const mergedResults = allResults.flat();

        const fileSuggestions = mergedResults.map((p) => ({
          label: p,
          value: escapePath(p),
        }));

        const resourceCandidates = buildResourceCandidates(config);
        const resourceSuggestions = (
          await searchResourceCandidates(
            currentPattern ?? '',
            resourceCandidates,
          )
        ).map((suggestion) => ({
          ...suggestion,
          label: suggestion.label.replace(/^@/, ''),
          value: suggestion.value.replace(/^@/, ''),
        }));

        const agentCandidates = buildAgentCandidates(config);
        const agentSuggestions = await searchAgentCandidates(
          currentPattern ?? '',
          agentCandidates,
        );

        // Re-check after resource/agent searches which are not abort-aware
        if (controller.signal.aborted) {
          return;
        }

        const combinedSuggestions = [
          ...agentSuggestions,
          ...fileSuggestions,
          ...resourceSuggestions,
        ];
        dispatch({ type: 'SEARCH_SUCCESS', payload: combinedSuggestions });
      } catch (error) {
        if (!(error instanceof Error && error.name === 'AbortError')) {
          dispatch({ type: 'ERROR' });
        }
      } finally {
        controller.abort();
      }
    };

    if (state.status === AtCompletionStatus.INITIALIZING) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      initialize();
    } else if (state.status === AtCompletionStatus.SEARCHING) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      search();
    }

    return () => {
      searchAbortController.current?.abort();
      if (slowSearchTimer.current) {
        clearTimeout(slowSearchTimer.current);
      }
    };
  }, [state.status, state.pattern, config, cwd]);
}
