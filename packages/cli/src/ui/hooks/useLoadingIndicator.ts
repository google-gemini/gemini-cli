/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import {
  WITTY_LOADING_PHRASES,
  PHRASE_CHANGE_INTERVAL_MS,
} from '../constants.js';
import { StreamingState } from '../types.js';

export const useLoadingIndicator = (
  streamingState: StreamingState,
  isPaused: boolean,
) => {
  const [elapsedTime, setElapsedTime] = useState(0);
  const [currentLoadingPhrase, setCurrentLoadingPhrase] = useState(
    WITTY_LOADING_PHRASES[0],
  );
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const phraseIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const currentPhraseIndexRef = useRef<number>(0);

  const [shouldShowSpinner, setShouldShowSpinner] = useState(true);

  useEffect(() => {
    if (streamingState === StreamingState.Responding) {
      if (!isPaused) {
        if (!timerRef.current) {
          // No specific action needed here if timer wasn't running and we are not paused.
          // Elapsed time continues from where it left off or starts from 0 if it's a fresh start.
        }
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = setInterval(() => {
          setElapsedTime((prevTime) => prevTime + 1);
        }, 1000);
      } else {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      }
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setElapsedTime(0);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [streamingState, isPaused]);

  useEffect(() => {
    if (streamingState === StreamingState.Responding) {
      if (!isPaused) {
        setShouldShowSpinner(true);
        if (!phraseIntervalRef.current) {
          currentPhraseIndexRef.current = 0;
          setCurrentLoadingPhrase(WITTY_LOADING_PHRASES[0]);
          phraseIntervalRef.current = setInterval(() => {
            currentPhraseIndexRef.current =
              (currentPhraseIndexRef.current + 1) %
              WITTY_LOADING_PHRASES.length;
            setCurrentLoadingPhrase(
              WITTY_LOADING_PHRASES[currentPhraseIndexRef.current],
            );
          }, PHRASE_CHANGE_INTERVAL_MS);
        }
      } else {
        setShouldShowSpinner(false);
        setCurrentLoadingPhrase('Waiting for user confirmation...');
        if (phraseIntervalRef.current) {
          clearInterval(phraseIntervalRef.current);
          phraseIntervalRef.current = null;
        }
      }
    } else {
      if (phraseIntervalRef.current) {
        clearInterval(phraseIntervalRef.current);
        phraseIntervalRef.current = null;
      }
    }

    return () => {
      if (phraseIntervalRef.current) {
        clearInterval(phraseIntervalRef.current);
        phraseIntervalRef.current = null;
      }
    };
  }, [streamingState, isPaused]);

  return { elapsedTime, currentLoadingPhrase, shouldShowSpinner };
};
