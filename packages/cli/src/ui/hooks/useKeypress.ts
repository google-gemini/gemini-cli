/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from 'react';
import type { KeypressHandler, Key } from '../contexts/KeypressContext.js';
import { useKeypressContext } from '../contexts/KeypressContext.js';

export type { Key };

/**
 * A hook that listens for keypress events from stdin.
 *
 * @param onKeypress - The callback function to execute on each keypress.
 * @param options - Options to control the hook's behavior.
 * @param options.isActive - Whether the hook should be actively listening for input.
 */
export function useKeypress(
  onKeypress: KeypressHandler,
  { isActive }: { isActive: boolean },
) {
  const { subscribe, unsubscribe } = useKeypressContext();
  const onKeypressRef = useRef(onKeypress);

  useEffect(() => {
    onKeypressRef.current = onKeypress;
  }, [onKeypress]);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const handler: KeypressHandler = (key) => {
      onKeypressRef.current(key);
    };

    subscribe(handler);
    return () => {
      unsubscribe(handler);
    };
  }, [isActive, subscribe, unsubscribe]);
}
