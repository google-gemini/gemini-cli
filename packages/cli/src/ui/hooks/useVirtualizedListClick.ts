/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useContext, useEffect, useCallback, useRef } from 'react';
import { VirtualizedListContext } from '../components/shared/VirtualizedList.js';
import type { DOMElement } from 'ink';

/**
 * A hook to register a clickable area within a VirtualizedList item.
 * This works seamlessly with both static and dynamic rendering.
 *
 * @param itemKey The unique key for the list item.
 * @param areaId A unique identifier for this clickable area within the list item.
 * @param callback The function to execute when the area is clicked.
 * @param options Configuration options.
 * @returns Props to spread onto the clickable component.
 */
export const useVirtualizedListClick = (
  itemKey: string | undefined,
  areaId: string,
  callback: () => void,
  options: { isActive?: boolean } = {},
) => {
  const { isActive = true } = options;
  const context = useContext(VirtualizedListContext);
  const elementRef = useRef<DOMElement | null>(null);

  useEffect(() => {
    if (isActive && context && itemKey) {
      context.registerClickCallback(itemKey, areaId, callback);
      return () => {
        context.unregisterClickCallback(itemKey, areaId);
      };
    }
    return undefined;
  }, [isActive, context, itemKey, areaId, callback]);

  useEffect(() => {
    if (!isActive || !context || !elementRef.current) return;
    context.registerClickableArea(elementRef.current, areaId);
    return () => {
      if (elementRef.current) {
        context.unregisterClickableArea(elementRef.current);
      }
    };
  }, [isActive, context, areaId]);

  const ref = useCallback(
    (el: DOMElement | null) => {
      if (elementRef.current && context) {
        context.unregisterClickableArea(elementRef.current);
      }
      elementRef.current = el;
      if (el && context && isActive) {
        context.registerClickableArea(el, areaId);
      }
    },
    [isActive, context, areaId],
  );

  return { ref };
};
