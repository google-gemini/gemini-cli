/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * A hook to manage a state value that automatically resets to null after a duration.
 * Useful for transient UI messages, hints, or warnings.
 */
export function useTimedMessage<T>(durationMs: number) {
  const [message, setMessage] = useState<T | null>(null);
  const messageRef = useRef<T | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showMessage = useCallback(
    (msg: T | null) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (msg !== null) {
        timeoutRef.current = setTimeout(() => {
          timeoutRef.current = null;
          messageRef.current = null;
          setMessage((prev) => (prev === null ? prev : null));
        }, durationMs);
      }

      if (Object.is(messageRef.current, msg)) {
        return;
      }

      messageRef.current = msg;
      setMessage(msg);
    },
    [durationMs],
  );

  useEffect(
    () => () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    },
    [],
  );

  return [message, showMessage] as const;
}
