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
 * @param loadingPhraseLayout Which phrases to show and where.
 * @param customPhrases Optional list of custom phrases to use instead of built-in witty phrases.
 * @param maxLength Optional maximum length for the selected phrase.
 * @returns The current tip and witty phrase.
 */
export const usePhraseCycler = (
  isActive: boolean,
  isWaiting: boolean,
  shouldShowFocusHint: boolean,
  loadingPhraseLayout: LoadingPhrasesMode = 'all_inline',
  customPhrases?: string[],
  maxLength?: number,
) => {
  const [currentTip, setCurrentTip] = useState<string | undefined>(undefined);
  const [currentWittyPhrase, setCurrentWittyPhrase] = useState<
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
      setCurrentTip(INTERACTIVE_SHELL_WAITING_PHRASE);
      setCurrentWittyPhrase(undefined);
      return;
    }

    if (isWaiting) {
      setCurrentTip('Waiting for user confirmation...');
      setCurrentWittyPhrase(undefined);
      return;
    }

    if (!isActive || loadingPhraseLayout === 'none') {
      setCurrentTip(undefined);
      setCurrentWittyPhrase(undefined);
      return;
    }

    const wittyPhrases =
      customPhrases && customPhrases.length > 0
        ? customPhrases
        : WITTY_LOADING_PHRASES;

    const setRandomPhrase = () => {
      let currentMode: 'tips' | 'witty' | 'all' = 'all';

      if (loadingPhraseLayout === 'tips') {
        currentMode = 'tips';
      } else if (
        loadingPhraseLayout === 'wit_status' ||
        loadingPhraseLayout === 'wit_inline' ||
        loadingPhraseLayout === 'wit_ambient'
      ) {
        currentMode = 'witty';
      }

      // In 'all' modes, we decide once per phrase cycle what to show
      if (
        loadingPhraseLayout === 'all_inline' ||
        loadingPhraseLayout === 'all_ambient'
      ) {
        if (!hasShownFirstRequestTipRef.current) {
          currentMode = 'tips';
          hasShownFirstRequestTipRef.current = true;
        } else {
          currentMode = Math.random() < 1 / 2 ? 'tips' : 'witty';
        }
      }

      const phraseList =
        currentMode === 'witty' ? wittyPhrases : INFORMATIVE_TIPS;

      const filteredList =
        maxLength !== undefined
          ? phraseList.filter((p) => p.length <= maxLength)
          : phraseList;

      if (filteredList.length > 0) {
        const randomIndex = Math.floor(Math.random() * filteredList.length);
        const selected = filteredList[randomIndex];
        if (currentMode === 'witty') {
          setCurrentWittyPhrase(selected);
          setCurrentTip(undefined);
        } else {
          setCurrentTip(selected);
          setCurrentWittyPhrase(undefined);
        }
      } else {
        // If no phrases fit, try to fallback
        setCurrentTip(undefined);
        setCurrentWittyPhrase(undefined);
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
    loadingPhraseLayout,
    customPhrases,
    maxLength,
  ]);

  return { currentTip, currentWittyPhrase };
};
