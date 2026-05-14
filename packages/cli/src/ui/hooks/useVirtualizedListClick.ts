/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useContext, useEffect, useCallback } from 'react';
import { VirtualizedListContext } from '../components/shared/VirtualizedList.js';
import { type DOMElement } from 'ink';

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
  const listContext = useContext(VirtualizedListContext);

  useEffect(() => {
    if (isActive && listContext && itemKey) {
      listContext.registerClickCallback(itemKey, areaId, callback);
      return () => {
        listContext.unregisterClickCallback(itemKey, areaId);
      };
    }
    return undefined;
  }, [isActive, listContext, itemKey, areaId, callback]);

  const ref = useCallback(
    (el: DOMElement | null) => {
      if (el) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const elHack = el as unknown as { attributes: Record<string, unknown> };
        if (!elHack.attributes) {
          elHack.attributes = {};
        }
        elHack.attributes['data-clickable'] = areaId;
      }
    },
    [areaId],
  );

  return { ref };
};
