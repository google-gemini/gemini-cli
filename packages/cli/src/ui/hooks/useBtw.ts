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
  | { type: 'APPEND_CONTENT'; content: string }
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
    case 'APPEND_CONTENT':
      return {
        ...state,
        response: state.response + action.content,
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

  const dismissBtw = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
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

      dispatch({ type: 'SUBMIT', query: newQuery });

      try {
        const stream = geminiClient.sendBtwStream(
          [{ text: newQuery }],
          abortController.signal,
          `btw-${Date.now()}`,
        );

        for await (const event of stream) {
          if (abortController.signal.aborted) break;

          switch (event.type) {
            case GeminiEventType.Content:
              dispatch({ type: 'APPEND_CONTENT', content: event.value ?? '' });
              break;
            case GeminiEventType.Error: {
              const value = event.value;
              let errorMessage = 'Unknown error';
              if (
                typeof value === 'object' &&
                value !== null &&
                'error' in value &&
                typeof value.error === 'object' &&
                value.error !== null
              ) {
                const errorObj = value.error;
                errorMessage =
                  'message' in errorObj
                    ? String(errorObj.message)
                    : String(errorObj);
              } else {
                errorMessage = String(value);
              }
              dispatch({
                type: 'ERROR',
                error: errorMessage,
              });
              break;
            }
            case GeminiEventType.Finished:
              dispatch({ type: 'FINISHED' });
              break;
            case GeminiEventType.UserCancelled:
              dispatch({ type: 'FINISHED' });
              break;
            default:
              break;
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          // Ignore aborts
        } else {
          dispatch({
            type: 'ERROR',
            error: err instanceof Error ? err.message : String(err),
          });
        }
      } finally {
        if (abortControllerRef.current === abortController) {
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
