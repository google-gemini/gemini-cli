/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useStdin, useStdout } from 'ink';
import { useEffect, useState } from 'react';
import { useKeypress } from './useKeypress.js';

// ANSI escape codes to enable/disable terminal focus reporting
export const ENABLE_FOCUS_REPORTING = '\x1b[?1004h';
export const DISABLE_FOCUS_REPORTING = '\x1b[?1004l';

// ANSI escape codes for focus events
export const FOCUS_IN = '\x1b[I';
export const FOCUS_OUT = '\x1b[O';

export const useFocus = () => {
  const { stdin } = useStdin();
  const { stdout } = useStdout();
  const [isFocused, setIsFocused] = useState(true);

  useEffect(() => {
    const handleData = (data: Buffer) => {
      const sequence = data.toString();
      const lastFocusIn = sequence.lastIndexOf(FOCUS_IN);
      const lastFocusOut = sequence.lastIndexOf(FOCUS_OUT);

      if (lastFocusIn > lastFocusOut) {
        setIsFocused(true);
      } else if (lastFocusOut > lastFocusIn) {
        setIsFocused(false);
      }
    };

    // Enable focus reporting
    stdout?.write(ENABLE_FOCUS_REPORTING);
    stdin?.on('data', handleData);

    return () => {
      // Disable focus reporting on cleanup
      stdout?.write(DISABLE_FOCUS_REPORTING);
      stdin?.removeListener('data', handleData);
    };
  }, [stdin, stdout]);

  useKeypress(
    (_) => {
      if (!isFocused) {
        // If the user has typed a key, and we cannot possibly be focused out.
        // This is a workaround for some tmux use cases. It is still useful to
        // listen for the true FOCUS_IN event as well as that will update the
        // focus state earlier than waiting for a keypress.
        setIsFocused(true);
      }
    },
    { isActive: true },
  );

  return isFocused;
};
