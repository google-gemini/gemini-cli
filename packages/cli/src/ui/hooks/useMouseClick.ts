/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { getBoundingBox, type DOMElement } from 'ink';
import type React from 'react';
import { useMouse, type MouseEvent } from '../contexts/MouseContext.js';

export const useMouseClick = (
  containerRef: React.RefObject<DOMElement | null>,
  handler: (event: MouseEvent, x: number, y: number) => void,
  options: { isActive?: boolean; button?: 'left' | 'right' } = {},
) => {
  const { isActive = true, button = 'left' } = options;

  useMouse(
    (event: MouseEvent) => {
      const eventName = button === 'left' ? 'left-press' : 'right-release';
      if (event.name === eventName && containerRef.current) {
        const { x, y, width, height } = getBoundingBox(containerRef.current);
        // Terminal mouse events are 1-based, Ink layout is 0-based.
        const mouseX = event.col - 1;
        const mouseY = event.row - 1;

        if (
          mouseX >= x &&
          mouseX < x + width &&
          mouseY >= y &&
          mouseY < y + height
        ) {
          handler(event, mouseX, mouseY);
        }
      }
    },
    { isActive },
  );
};
