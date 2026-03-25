/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useState } from 'react';

export interface UsePromptStashReturn {
  /** The currently stashed prompt text, or null if nothing is stashed. */
  stashedPrompt: string | null;
  /** Save text to the stash, replacing any existing stash. No-op for empty strings. */
  stashPrompt: (text: string) => void;
  /** Pop and return the stashed prompt, clearing the stash. */
  popStashedPrompt: () => string | null;
}

/**
 * Hook for managing a single stashed prompt.
 *
 * Allows users to temporarily set aside their current input and restore it
 * after the next submit.
 */
export function usePromptStash(): UsePromptStashReturn {
  const [stashedPrompt, setStashedPrompt] = useState<string | null>(null);

  const stashPrompt = useCallback((text: string) => {
    if (text.length > 0) {
      setStashedPrompt(text);
    }
  }, []);

  const popStashedPrompt = useCallback(() => {
    const prompt = stashedPrompt;
    setStashedPrompt(null);
    return prompt;
  }, [stashedPrompt]);

  return { stashedPrompt, stashPrompt, popStashedPrompt };
}
