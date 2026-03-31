/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useRef, useEffect, useReducer } from 'react';
import { type GeminiClient, GeminiEventType } from '@google/gemini-cli-core';

export interface UseBtwReturn {
  isActive: boolean;
  query: string;
  response: string;
  isStreaming: boolean;
  error: string | null;
  submitBtw: (query: string) => Promise<void>;
  dismissBtw: () => void;
}

interface BtwState {
  isActive: boolean;
  query: string;
  response: string;
  isStreaming: boolean;
  error: string | null;
}

type BtwAction =
  | { type: 'SUBMIT'; query: string }
  | { type: 'SET_RESPONSE'; content: string }
  | { type: 'ERROR'; error: string }
  | { type: 'FINISHED' }
  | { type: 'DISMISS' };

const initialState: BtwState = {
  isActive: false,
  query: '',
  response: '',
  isStreaming: false,
  error: null,
};

const btwReducer = (state: BtwState, action: BtwAction): BtwState => {
  switch (action.type) {
    case 'SUBMIT':
      return {
        ...state,
        isActive: true,
        query: action.query,
        response: '',
        isStreaming: true,
        error: null,
      };
    case 'SET_RESPONSE':
      return {
        ...state,
        response: action.content,
      };
    case 'ERROR':
      return {
        ...state,
        error: action.error,
        isStreaming: false,
      };
    case 'FINISHED':
      return {
        ...state,
        isStreaming: false,
      };
    case 'DISMISS':
      return initialState;
    default:
      return state;
  }
};

export const useBtw = (
  geminiClient: GeminiClient | undefined,
): UseBtwReturn => {
  const [state, dispatch] = useReducer(btwReducer, initialState);

  const abortControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef<number>(0);

  const dismissBtw = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    requestIdRef.current++;
    dispatch({ type: 'DISMISS' });
  }, []);

  const submitBtw = useCallback(
    async (newQuery: string) => {
      if (!geminiClient) return;

      // Abort any ongoing BTW stream
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      const requestId = ++requestIdRef.current;

      dispatch({ type: 'SUBMIT', query: newQuery });

      let accumulatedResponse = '';
      let lastDispatchTime = 0;
      let flushTimer: NodeJS.Timeout | null = null;

      const flushResponse = () => {
        if (requestIdRef.current !== requestId) return;
        dispatch({ type: 'SET_RESPONSE', content: accumulatedResponse });
        lastDispatchTime = Date.now();
      };

      try {
        const stream = geminiClient.sendBtwStream(
          [{ text: newQuery }],
          abortController.signal,
          `btw-${Date.now()}`,
        );

        for await (const event of stream) {
          if (abortController.signal.aborted) break;

          switch (event.type) {
            case GeminiEventType.Content: {
              accumulatedResponse += event.value ?? '';
              const now = Date.now();
              if (now - lastDispatchTime > 50) {
                if (flushTimer) {
                  clearTimeout(flushTimer);
                  flushTimer = null;
                }
                flushResponse();
              } else if (!flushTimer) {
                flushTimer = setTimeout(() => {
                  flushResponse();
                  flushTimer = null;
                }, 50);
              }
              break;
            }
            case GeminiEventType.Error: {
              if (flushTimer) clearTimeout(flushTimer);
              flushResponse();

              const value = event.value;
              let errorMessage = 'Unknown error';
              if (
                typeof value === 'object' &&
                value !== null &&
                'error' in value
              ) {
                const errorObj = value.error;
                const extracted =
                  typeof errorObj === 'object' &&
                  errorObj !== null &&
                  'message' in errorObj
                    ? String(errorObj.message)
                    : String(errorObj);
                errorMessage = extracted.trim() || 'Unknown error';
              } else {
                errorMessage = String(value).trim() || 'Unknown error';
              }
              dispatch({
                type: 'ERROR',
                error: errorMessage,
              });
              break;
            }
            case GeminiEventType.Finished:
            case GeminiEventType.UserCancelled:
              if (flushTimer) clearTimeout(flushTimer);
              flushResponse();
              dispatch({ type: 'FINISHED' });
              break;
            default:
              break;
          }
        }
      } catch (err) {
        if (flushTimer) clearTimeout(flushTimer);
        flushResponse();

        if (err instanceof Error && err.name === 'AbortError') {
          // Ignore aborts
        } else if (requestIdRef.current === requestId) {
          dispatch({
            type: 'ERROR',
            error: err instanceof Error ? err.message : String(err),
          });
        }
      } finally {
        if (flushTimer) clearTimeout(flushTimer);
        flushResponse();

        if (requestIdRef.current === requestId) {
          dispatch({ type: 'FINISHED' });
        }
      }
    },
    [geminiClient],
  );

  // Cleanup on unmount
  useEffect(
    () => () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    },
    [],
  );

  return {
    ...state,
    submitBtw,
    dismissBtw,
  };
};
