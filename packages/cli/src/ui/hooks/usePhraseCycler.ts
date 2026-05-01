/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { INFORMATIVE_TIPS } from '../constants/tips.js';
import { WITTY_LOADING_PHRASES } from '../constants/wittyPhrases.js';

export const PHRASE_CHANGE_INTERVAL_MS = 10000;
export const WITTY_PHRASE_CHANGE_INTERVAL_MS = 5000;
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

  const tipIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const wittyIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastTipChangeTimeRef = useRef<number>(0);
  const lastWittyChangeTimeRef = useRef<number>(0);
  const lastSelectedTipRef = useRef<string | undefined>(undefined);
  const lastSelectedWittyPhraseRef = useRef<string | undefined>(undefined);
  const MIN_TIP_DISPLAY_TIME_MS = 10000;
  const MIN_WIT_DISPLAY_TIME_MS = 5000;

  useEffect(() => {
    // Always clear on re-run
    const clearTimers = () => {
      if (tipIntervalRef.current) {
        clearInterval(tipIntervalRef.current);
        tipIntervalRef.current = null;
      }
      if (wittyIntervalRef.current) {
        clearInterval(wittyIntervalRef.current);
        wittyIntervalRef.current = null;
      }
    };

    clearTimers();

    if (shouldShowFocusHint || isWaiting) {
      // These are handled by the return value directly for immediate feedback
      return clearTimers;
    }

    if (!isActive || (!showTips && !showWit)) {
      return clearTimers;
    }

    const wittyPhrasesList =
      customPhrases && customPhrases.length > 0
        ? customPhrases
        : WITTY_LOADING_PHRASES;

    const setRandomTip = (force: boolean = false) => {
      if (!showTips) {
        setCurrentTipState(undefined);
        lastSelectedTipRef.current = undefined;
        return;
      }

      const now = Date.now();
      if (
        !force &&
        now - lastTipChangeTimeRef.current < MIN_TIP_DISPLAY_TIME_MS &&
        lastSelectedTipRef.current
      ) {
        setCurrentTipState(lastSelectedTipRef.current);
        return;
      }

      const filteredTips =
        maxLength !== undefined
          ? INFORMATIVE_TIPS.filter((p) => p.length <= maxLength)
          : INFORMATIVE_TIPS;

      if (filteredTips.length > 0) {
        // codeql[js/insecure-randomness] false positive: used for non-sensitive UI flavor text (tips)
        const selected =
          filteredTips[Math.floor(Math.random() * filteredTips.length)];
        setCurrentTipState(selected);
        lastSelectedTipRef.current = selected;
        lastTipChangeTimeRef.current = now;
      }
    };

    const setRandomWitty = (force: boolean = false) => {
      if (!showWit) {
        setCurrentWittyPhraseState(undefined);
        lastSelectedWittyPhraseRef.current = undefined;
        return;
      }

      const now = Date.now();
      if (
        !force &&
        now - lastWittyChangeTimeRef.current < MIN_WIT_DISPLAY_TIME_MS &&
        lastSelectedWittyPhraseRef.current
      ) {
        setCurrentWittyPhraseState(lastSelectedWittyPhraseRef.current);
        return;
      }

      const filteredWitty =
        maxLength !== undefined
          ? wittyPhrasesList.filter((p) => p.length <= maxLength)
          : wittyPhrasesList;

      if (filteredWitty.length > 0) {
        // codeql[js/insecure-randomness] false positive: used for non-sensitive UI flavor text (witty phrases)
        const selected =
          filteredWitty[Math.floor(Math.random() * filteredWitty.length)];
        setCurrentWittyPhraseState(selected);
        lastSelectedWittyPhraseRef.current = selected;
        lastWittyChangeTimeRef.current = now;
      }
    };

    // Select initial random phrases or resume previous ones
    setRandomTip(false);
    setRandomWitty(false);

    if (showTips) {
      tipIntervalRef.current = setInterval(() => {
        setRandomTip(true);
      }, PHRASE_CHANGE_INTERVAL_MS);
    }

    if (showWit) {
      wittyIntervalRef.current = setInterval(() => {
        setRandomWitty(true);
      }, WITTY_PHRASE_CHANGE_INTERVAL_MS);
    }

    return clearTimers;
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
