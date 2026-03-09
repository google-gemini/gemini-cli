/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from 'react';
import { StreamingState } from '../types.js';

/**
 * Emits a terminal bell character (\x07) when the CLI transitions from
 * an active state (Responding) to a state that requires user input
 * (Idle or WaitingForConfirmation). This alerts users in background
 * terminal tabs or multiplexers that the agent needs their attention.
 */
export function useTerminalBell(streamingState: StreamingState): void {
  const previousState = useRef<StreamingState>(streamingState);

  useEffect(() => {
    const prev = previousState.current;
    previousState.current = streamingState;

    if (prev === StreamingState.Responding) {
      if (
        streamingState === StreamingState.Idle ||
        streamingState === StreamingState.WaitingForConfirmation
      ) {
        process.stderr.write('\x07');
      }
    }
  }, [streamingState]);
}
