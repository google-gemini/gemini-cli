/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  writeToStdout,
  disableMouseEvents,
  enableMouseEvents,
} from '@google/gemini-cli-core';
import process from 'node:process';
import { terminalCapabilityManager } from '../utils/terminalCapabilityManager.js';
import { WARNING_PROMPT_DURATION_MS } from '../constants.js';

interface UseSuspendProps {
  handleWarning: (message: string) => void;
  setRawMode: (mode: boolean) => void;
  refreshStatic: () => void;
  setForceRerenderKey: (updater: (prev: number) => number) => void;
}

export function useSuspend({
  handleWarning,
  setRawMode,
  refreshStatic,
  setForceRerenderKey,
}: UseSuspendProps) {
  const [ctrlZPressCount, setCtrlZPressCount] = useState(0);
  const ctrlZTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (ctrlZTimerRef.current) {
      clearTimeout(ctrlZTimerRef.current);
      ctrlZTimerRef.current = null;
    }
    if (ctrlZPressCount > 1) {
      setCtrlZPressCount(0);
      if (process.platform !== 'win32') {
        // Cleanup before suspend
        writeToStdout('\x1b[?25h'); // Show cursor
        disableMouseEvents();
        terminalCapabilityManager.disableKittyProtocol();

        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false);
        }
        setRawMode(false);

        const onResume = () => {
          // Restore terminal state
          if (process.stdin.isTTY) {
            process.stdin.setRawMode(true);
            process.stdin.resume();
            process.stdin.ref();
          }
          setRawMode(true);

          terminalCapabilityManager.enableKittyProtocol();
          writeToStdout('\x1b[?25l'); // Hide cursor
          enableMouseEvents();

          // Force Ink to do a complete repaint by:
          // 1. Emitting a resize event (tricks Ink into full redraw)
          // 2. Remounting components via state changes
          process.stdout.emit('resize');

          // Give a tick for resize to process, then trigger remount
          setImmediate(() => {
            refreshStatic();
            setForceRerenderKey((prev) => prev + 1);
          });

          process.off('SIGCONT', onResume);
        };
        process.on('SIGCONT', onResume);

        process.kill(0, 'SIGTSTP');
      }
    } else if (ctrlZPressCount > 0) {
      handleWarning(
        'Press Ctrl+Z again to suspend. Undo has moved to Cmd + Z or Alt/Opt + Z.',
      );
      ctrlZTimerRef.current = setTimeout(() => {
        setCtrlZPressCount(0);
        ctrlZTimerRef.current = null;
      }, WARNING_PROMPT_DURATION_MS);
    }
  }, [
    ctrlZPressCount,
    handleWarning,
    setRawMode,
    refreshStatic,
    setForceRerenderKey,
  ]);

  const handleSuspend = useCallback(() => {
    setCtrlZPressCount((prev) => prev + 1);
  }, []);

  return { handleSuspend };
}
