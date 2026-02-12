/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { INFORMATIVE_TIPS } from '../constants/tips.js';
import { WITTY_LOADING_PHRASES } from '../constants/wittyPhrases.js';

export const PHRASE_CHANGE_INTERVAL_MS = 15000;
export const INTERACTIVE_SHELL_WAITING_PHRASE =
  'Interactive shell awaiting input... press tab to focus shell';

/**
 * Custom hook to manage cycling through loading phrases.
 * @param isActive Whether the phrase cycling should be active.
 * @param isWaiting Whether to show a specific waiting phrase.
 * @param shouldShowFocusHint Whether to show the shell focus hint.
 * @param customPhrases Optional list of custom phrases to use.
 * @returns The current loading phrase.
 */
export const usePhraseCycler = (
  isActive: boolean,
  isWaiting: boolean,
  shouldShowFocusHint: boolean,
  customPhrases?: string[],
) => {
  const loadingPhrases =
    customPhrases && customPhrases.length > 0
      ? customPhrases
      : WITTY_LOADING_PHRASES;

  const [currentLoadingPhrase, setCurrentLoadingPhrase] = useState<
    string | undefined
  >(isActive ? loadingPhrases[0] : undefined);

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

    if (!isActive) {
      setCurrentLoadingPhrase(undefined);
      return;
    }

    const setRandomPhrase = () => {
      if (customPhrases && customPhrases.length > 0) {
        const randomIndex = Math.floor(Math.random() * customPhrases.length);
        setCurrentLoadingPhrase(customPhrases[randomIndex]);
      } else {
        let phraseList;
        // Show a tip on the first request after startup, then continue with 1/6 chance
        if (!hasShownFirstRequestTipRef.current) {
          // Show a tip during the first request
          phraseList = INFORMATIVE_TIPS;
          hasShownFirstRequestTipRef.current = true;
        } else {
          // Roughly 1 in 6 chance to show a tip after the first request
          const showTip = Math.random() < 1 / 6;
          phraseList = showTip ? INFORMATIVE_TIPS : WITTY_LOADING_PHRASES;
        }
        const randomIndex = Math.floor(Math.random() * phraseList.length);
        setCurrentLoadingPhrase(phraseList[randomIndex]);
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
  }, [isActive, isWaiting, shouldShowFocusHint, customPhrases, loadingPhrases]);

  return currentLoadingPhrase;
};
