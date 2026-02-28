/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { INFORMATIVE_TIPS } from '../constants/tips.js';
import { WITTY_LOADING_PHRASES } from '../constants/wittyPhrases.js';
import type { LoadingPhrasesMode } from '../../config/settings.js';

export const PHRASE_CHANGE_INTERVAL_MS = 15000;
export const INTERACTIVE_SHELL_WAITING_PHRASE =
  '! Shell awaiting input (Tab to focus)';

/**
 * Custom hook to manage cycling through loading phrases.
 * @param isActive Whether the phrase cycling should be active.
 * @param isWaiting Whether to show a specific waiting phrase.
 * @param shouldShowFocusHint Whether to show the shell focus hint.
 * @param loadingPhrasesMode Which phrases to show: tips, witty, all, or off.
 * @param customPhrases Optional list of custom phrases to use instead of built-in witty phrases.
 * @param maxLength Optional maximum length for the selected phrase.
 * @returns The current loading phrase.
 */
export const usePhraseCycler = (
  isActive: boolean,
  isWaiting: boolean,
  shouldShowFocusHint: boolean,
  loadingPhrasesMode: LoadingPhrasesMode = 'tips',
  customPhrases?: string[],
  maxLength?: number,
) => {
  const [currentLoadingPhrase, setCurrentLoadingPhrase] = useState<
    string | undefined
  >(undefined);

  const phraseIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasShownFirstRequestTipRef = useRef(false);

  useEffect(() => {
    // Always clear on re-run
    if (phraseIntervalRef.current) {
      clearInterval(phraseIntervalRef.current);
      phraseIntervalRef.current = null;
    }

    if (shouldShowFocusHint) {
      setCurrentLoadingPhrase(INTERACTIVE_SHELL_WAITING_PHRASE);
      return;
    }

    if (isWaiting) {
      setCurrentLoadingPhrase('Waiting for user confirmation...');
      return;
    }

    if (!isActive || loadingPhrasesMode === 'off') {
      setCurrentLoadingPhrase(undefined);
      return;
    }

    const wittyPhrases =
      customPhrases && customPhrases.length > 0
        ? customPhrases
        : WITTY_LOADING_PHRASES;

    const setRandomPhrase = () => {
      let phraseList: readonly string[];
      let currentMode = loadingPhrasesMode;

      // In 'all' mode, we decide once per phrase cycle what to show
      if (loadingPhrasesMode === 'all') {
        if (!hasShownFirstRequestTipRef.current) {
          currentMode = 'tips';
          hasShownFirstRequestTipRef.current = true;
        } else {
          currentMode = Math.random() < 1 / 2 ? 'tips' : 'witty';
        }
      }

      switch (currentMode) {
        case 'tips':
          phraseList = INFORMATIVE_TIPS;
          break;
        case 'witty':
          phraseList = wittyPhrases;
          break;
        default:
          phraseList = INFORMATIVE_TIPS;
          break;
      }

      // If we have a maxLength, we need to account for potential prefixes.
      // Tips are prefixed with "Tip: " in the Composer UI.
      const prefixLength = currentMode === 'tips' ? 5 : 0;
      const adjustedMaxLength =
        maxLength !== undefined ? maxLength - prefixLength : undefined;

      const filteredList =
        adjustedMaxLength !== undefined
          ? phraseList.filter((p) => p.length <= adjustedMaxLength)
          : phraseList;

      if (filteredList.length > 0) {
        const randomIndex = Math.floor(Math.random() * filteredList.length);
        setCurrentLoadingPhrase(filteredList[randomIndex]);
      } else {
        // If no phrases fit, try to fallback to a very short list or nothing
        setCurrentLoadingPhrase(undefined);
      }
    };

    // Select an initial random phrase
    setRandomPhrase();

    phraseIntervalRef.current = setInterval(() => {
      // Select a new random phrase
      setRandomPhrase();
    }, PHRASE_CHANGE_INTERVAL_MS);

    return () => {
      if (phraseIntervalRef.current) {
        clearInterval(phraseIntervalRef.current);
        phraseIntervalRef.current = null;
      }
    };
  }, [
    isActive,
    isWaiting,
    shouldShowFocusHint,
    loadingPhrasesMode,
    customPhrases,
    maxLength,
  ]);

  return currentLoadingPhrase;
};
