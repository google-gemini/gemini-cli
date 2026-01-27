/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { getBoundingBox, type DOMElement } from 'ink';
import type React from 'react';
import { useRef, useCallback } from 'react';
import { useMouse, type MouseEvent } from '../contexts/MouseContext.js';

const DOUBLE_CLICK_THRESHOLD_MS = 400;
const DOUBLE_CLICK_DISTANCE_TOLERANCE = 2;

export const useMouseDoubleClick = (
  containerRef: React.RefObject<DOMElement | null>,
  handler: (event: MouseEvent, relativeX: number, relativeY: number) => void,
  options: { isActive?: boolean } = {},
) => {
  const { isActive = true } = options;
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  const lastClickRef = useRef<{
    time: number;
    col: number;
    row: number;
  } | null>(null);

  const onMouse = useCallback(
    (event: MouseEvent) => {
      if (event.name !== 'left-press' || !containerRef.current) return;

      const now = Date.now();
      const lastClick = lastClickRef.current;

      // Check if this is a valid double-click
      if (
        lastClick &&
        now - lastClick.time < DOUBLE_CLICK_THRESHOLD_MS &&
        Math.abs(event.col - lastClick.col) <=
          DOUBLE_CLICK_DISTANCE_TOLERANCE &&
        Math.abs(event.row - lastClick.row) <= DOUBLE_CLICK_DISTANCE_TOLERANCE
      ) {
        // Double-click detected
        const { x, y, width, height } = getBoundingBox(containerRef.current);
        // Terminal mouse events are 1-based, Ink layout is 0-based.
        const mouseX = event.col - 1;
        const mouseY = event.row - 1;

        const relativeX = mouseX - x;
        const relativeY = mouseY - y;

        if (
          relativeX >= 0 &&
          relativeX < width &&
          relativeY >= 0 &&
          relativeY < height
        ) {
          handlerRef.current(event, relativeX, relativeY);
        }
        lastClickRef.current = null; // Reset after double-click
      } else {
        // First click, record it
        lastClickRef.current = { time: now, col: event.col, row: event.row };
      }
    },
    [containerRef],
  );

  useMouse(onMouse, { isActive });
};
