/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';
import type { KeypressHandler, Key } from '../contexts/KeypressContext.js';
import { useKeypressContext } from '../contexts/KeypressContext.js';

export type { Key };

/**
 * A hook that listens for keypress events from stdin.
 *
 * @param onKeypress - The callback function to execute on each keypress.
 * @param options - Options to control the hook's behavior.
 * @param options.isActive - Whether the hook should be actively listening for input.
 * @param options.priority - Whether the hook should have priority over normal subscribers.
 */
export function useKeypress(
  onKeypress: KeypressHandler,
  { isActive, priority }: { isActive: boolean; priority?: boolean },
) {
  const { subscribe, unsubscribe } = useKeypressContext();

  useEffect(() => {
    if (!isActive) {
      return;
    }

    subscribe(onKeypress, priority);
    return () => {
      unsubscribe(onKeypress);
    };
  }, [isActive, onKeypress, subscribe, unsubscribe, priority]);
}
