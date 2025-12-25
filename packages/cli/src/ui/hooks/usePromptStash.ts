/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from 'react';

export interface UsePromptStashReturn {
  /** The currently stashed prompt text, or null if nothing is stashed */
  stashedPrompt: string | null;
  /** Stash the given text, returns true if stashed successfully */
  stash: (text: string) => boolean;
  /** Pop and return the stashed prompt, clearing it from the stash */
  pop: () => string | null;
  /** Check if there is a stashed prompt */
  hasStash: boolean;
  /** Clear the stash without returning it */
  clear: () => void;
}

/**
 * Hook for managing prompt stashing functionality.
 * Allows users to temporarily save their current input and restore it later.
 */
export function usePromptStash(): UsePromptStashReturn {
  const [stashedPrompt, setStashedPrompt] = useState<string | null>(null);

  const stash = useCallback((text: string): boolean => {
    const trimmedText = text.trim();
    if (!trimmedText) {
      return false; // Don't stash empty input
    }
    setStashedPrompt(trimmedText);
    return true;
  }, []);

  const pop = useCallback((): string | null => {
    const current = stashedPrompt;
    setStashedPrompt(null);
    return current;
  }, [stashedPrompt]);

  const clear = useCallback(() => {
    setStashedPrompt(null);
  }, []);

  return {
    stashedPrompt,
    stash,
    pop,
    hasStash: stashedPrompt !== null,
    clear,
  };
}
