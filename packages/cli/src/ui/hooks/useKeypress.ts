/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from 'react';
import {
  useKeypressContext,
  type KeypressHandler,
  type Key,
  type KeypressPriority,
} from '../contexts/KeypressContext.js';

export type { Key };

/**
 * A hook that listens for keypress events from stdin.
 *
 * @param onKeypress - The callback function to execute on each keypress.
 * @param options - Options to control the hook's behavior.
 * @param options.isActive - Whether the hook should be actively listening for input.
 * @param options.priority - Priority level (integer or KeypressPriority enum) or boolean for backward compatibility.
 */
export function useKeypress(
  onKeypress: KeypressHandler,
  {
    isActive,
    priority,
  }: { isActive: boolean; priority?: KeypressPriority | boolean },
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

    const handler: KeypressHandler = (key) => onKeypressRef.current(key);
    subscribe(handler, priority);
    return () => {
      unsubscribe(handler);
    };
  }, [isActive, subscribe, unsubscribe, priority]);
}
