/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { theme } from '../semantic-colors.js';
import { interpolateColor } from '../themes/color-utils.js';

export function useAnimatedScrollbar(
  isFocused: boolean,
  scrollBy: (delta: number) => void,
) {
  const [scrollbarColor, setScrollbarColor] = useState(theme.ui.dark);
  const colorRef = useRef(scrollbarColor);
  colorRef.current = scrollbarColor;

  const animationFrame = useRef<NodeJS.Timeout | null>(null);
  const timeout = useRef<NodeJS.Timeout | null>(null);

  const flashScrollbar = useCallback(() => {
    if (animationFrame.current) {
      clearInterval(animationFrame.current);
    }
    if (timeout.current) {
      clearTimeout(timeout.current);
    }

    const fadeInDuration = 200;
    const visibleDuration = 1000;
    const fadeOutDuration = 300;

    const focusedColor = theme.text.secondary;
    const unfocusedColor = theme.ui.dark;
    const startColor = colorRef.current;

    // Phase 1: Fade In
    let start = Date.now();
    const animateFadeIn = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / fadeInDuration, 1);

      setScrollbarColor(interpolateColor(startColor, focusedColor, progress));

      if (progress === 1) {
        if (animationFrame.current) {
          clearInterval(animationFrame.current);
        }

        // Phase 2: Wait
        timeout.current = setTimeout(() => {
          // Phase 3: Fade Out
          start = Date.now();
          const animateFadeOut = () => {
            const elapsed = Date.now() - start;
            const progress = Math.min(elapsed / fadeOutDuration, 1);
            setScrollbarColor(
              interpolateColor(focusedColor, unfocusedColor, progress),
            );

            if (progress === 1) {
              if (animationFrame.current) {
                clearInterval(animationFrame.current);
              }
            }
          };

          animationFrame.current = setInterval(animateFadeOut, 33);
        }, visibleDuration);
      }
    };

    animationFrame.current = setInterval(animateFadeIn, 33);
  }, []);

  const wasFocused = useRef(isFocused);
  useEffect(() => {
    if (isFocused && !wasFocused.current) {
      flashScrollbar();
    } else if (!isFocused && wasFocused.current) {
      if (animationFrame.current) {
        clearInterval(animationFrame.current);
      }
      if (timeout.current) {
        clearTimeout(timeout.current);
      }
      setScrollbarColor(theme.ui.dark);
    }
    wasFocused.current = isFocused;
  }, [isFocused, flashScrollbar]);

  const scrollByWithAnimation = useCallback(
    (delta: number) => {
      scrollBy(delta);
      flashScrollbar();
    },
    [scrollBy, flashScrollbar],
  );

  return { scrollbarColor, flashScrollbar, scrollByWithAnimation };
}
