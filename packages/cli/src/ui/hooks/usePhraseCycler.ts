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
  '! Shell awaiting input (Tab to focus)';

/**
 * Custom hook to manage cycling through loading phrases.
 * @param isActive Whether the phrase cycling should be active.
 * @param isWaiting Whether to show a specific waiting phrase.
 * @param shouldShowFocusHint Whether to show the shell focus hint.
 * @param showTips Whether to show informative tips.
 * @param showWit Whether to show witty phrases.
 * @param customPhrases Optional list of custom phrases to use instead of built-in witty phrases.
 * @param maxLength Optional maximum length for the selected phrase.
 * @returns The current loading phrase.
 */
export const usePhraseCycler = (
  isActive: boolean,
  isWaiting: boolean,
  shouldShowFocusHint: boolean,
  showTips: boolean = true,
  showWit: boolean = true,
  customPhrases?: string[],
  maxLength?: number,
) => {
  const [currentTipState, setCurrentTipState] = useState<string | undefined>(
    undefined,
  );
  const [currentWittyPhraseState, setCurrentWittyPhraseState] = useState<
    string | undefined
  >(undefined);

  const phraseIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastChangeTimeRef = useRef<number>(0);
  const lastSelectedTipRef = useRef<string | undefined>(undefined);
  const lastSelectedWittyPhraseRef = useRef<string | undefined>(undefined);
  const MIN_TIP_DISPLAY_TIME_MS = 10000;

  useEffect(() => {
    // Always clear on re-run
    if (phraseIntervalRef.current) {
      clearInterval(phraseIntervalRef.current);
      phraseIntervalRef.current = null;
    }

    if (shouldShowFocusHint || isWaiting) {
      // These are handled by the return value directly for immediate feedback
      return;
    }

    if (!isActive || (!showTips && !showWit)) {
      return;
    }

    const wittyPhrasesList =
      customPhrases && customPhrases.length > 0
        ? customPhrases
        : WITTY_LOADING_PHRASES;

    const setRandomPhrases = (force: boolean = false) => {
      const now = Date.now();
      if (
        !force &&
        now - lastChangeTimeRef.current < MIN_TIP_DISPLAY_TIME_MS &&
        (lastSelectedTipRef.current || lastSelectedWittyPhraseRef.current)
      ) {
        // Sync state if it was cleared by inactivation.
        setCurrentTipState(lastSelectedTipRef.current);
        setCurrentWittyPhraseState(lastSelectedWittyPhraseRef.current);
        return;
      }

      const adjustedMaxLength = maxLength;

      if (showTips) {
        const filteredTips =
          adjustedMaxLength !== undefined
            ? INFORMATIVE_TIPS.filter((p) => p.length <= adjustedMaxLength)
            : INFORMATIVE_TIPS;
        if (filteredTips.length > 0) {
          const selected =
            filteredTips[Math.floor(Math.random() * filteredTips.length)];
          setCurrentTipState(selected);
          lastSelectedTipRef.current = selected;
        }
      } else {
        setCurrentTipState(undefined);
        lastSelectedTipRef.current = undefined;
      }

      if (showWit) {
        const filteredWitty =
          adjustedMaxLength !== undefined
            ? wittyPhrasesList.filter((p) => p.length <= adjustedMaxLength)
            : wittyPhrasesList;
        if (filteredWitty.length > 0) {
          const selected =
            filteredWitty[Math.floor(Math.random() * filteredWitty.length)];
          setCurrentWittyPhraseState(selected);
          lastSelectedWittyPhraseRef.current = selected;
        }
      } else {
        setCurrentWittyPhraseState(undefined);
        lastSelectedWittyPhraseRef.current = undefined;
      }

      lastChangeTimeRef.current = now;
    };

    // Select initial random phrases or resume previous ones
    setRandomPhrases(false);

    phraseIntervalRef.current = setInterval(() => {
      setRandomPhrases(true); // Force change on interval
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
    showTips,
    showWit,
    customPhrases,
    maxLength,
  ]);

  let currentTip = undefined;
  let currentWittyPhrase = undefined;

  if (shouldShowFocusHint) {
    currentTip = INTERACTIVE_SHELL_WAITING_PHRASE;
  } else if (isWaiting) {
    currentTip = 'Waiting for user confirmation...';
  } else if (isActive) {
    currentTip = currentTipState;
    currentWittyPhrase = currentWittyPhraseState;
  }

  return { currentTip, currentWittyPhrase };
};
