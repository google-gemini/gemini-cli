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
  enterAlternateScreen,
  exitAlternateScreen,
  enableLineWrapping,
  disableLineWrapping,
  shouldEnterAlternateScreen,
  type Config,
} from '@google/gemini-cli-core';
import process from 'node:process';
import {
  cleanupTerminalOnExit,
  terminalCapabilityManager,
  clearTerminalScreen,
} from '../utils/terminalCapabilityManager.js';
import { WARNING_PROMPT_DURATION_MS } from '../constants.js';
import { formatCommand } from '../key/keybindingUtils.js';
import { Command } from '../key/keyBindings.js';
import type { MutableRefObject } from 'react';

interface UseSuspendProps {
  handleWarning: (message: string) => void;
  setRawMode: (mode: boolean) => void;
  refreshStatic: () => void;
  setForceRerenderKey: (updater: (prev: number) => number) => void;
  isAlternateBufferRef: MutableRefObject<boolean>;
  config: Config;
}

export function useSuspend({
  handleWarning,
  setRawMode,
  refreshStatic,
  setForceRerenderKey,
  isAlternateBufferRef,
  config,
}: UseSuspendProps) {
  const [ctrlZPressCount, setCtrlZPressCount] = useState(0);
  const ctrlZTimerRef = useRef<NodeJS.Timeout | null>(null);
  const onResumeHandlerRef = useRef<(() => void) | null>(null);

  useEffect(
    () => () => {
      if (ctrlZTimerRef.current) {
        clearTimeout(ctrlZTimerRef.current);
        ctrlZTimerRef.current = null;
      }
      if (onResumeHandlerRef.current) {
        process.off('SIGCONT', onResumeHandlerRef.current);
        onResumeHandlerRef.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    if (ctrlZTimerRef.current) {
      clearTimeout(ctrlZTimerRef.current);
      ctrlZTimerRef.current = null;
    }
    const suspendKey = formatCommand(Command.SUSPEND_APP);

    const shouldUseAlternateScreen = shouldEnterAlternateScreen(
      isAlternateBufferRef.current,
      config.getScreenReader(),
    );

    if (ctrlZPressCount > 1) {
      setCtrlZPressCount(0);
      if (process.platform === 'win32') {
        handleWarning(`${suspendKey} suspend is not supported on Windows.`);
        return;
      }

      if (shouldUseAlternateScreen) {
        clearTerminalScreen();
        exitAlternateScreen();
        enableLineWrapping();
      }

      // Cleanup before suspend.
      writeToStdout('\x1b[?25h'); // Show cursor
      disableMouseEvents();
      cleanupTerminalOnExit();

      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      setRawMode(false);

      const onResume = () => {
        try {
          // Restore terminal state.
          if (process.stdin.isTTY) {
            process.stdin.setRawMode(true);
            process.stdin.resume();
            process.stdin.ref();
          }
          setRawMode(true);

          if (shouldUseAlternateScreen) {
            enterAlternateScreen();
            disableLineWrapping();
            clearTerminalScreen();
          }

          terminalCapabilityManager.enableSupportedModes();
          writeToStdout('\x1b[?25l'); // Hide cursor
          if (shouldUseAlternateScreen) {
            enableMouseEvents();
          }

          // Force Ink to do a complete repaint by:
          // 1. Emitting a resize event (tricks Ink into full redraw)
          // 2. Remounting components via state changes
          process.stdout.emit('resize');

          // Give a tick for resize to process, then trigger remount
          setImmediate(() => {
            refreshStatic();
            setForceRerenderKey((prev) => prev + 1);
          });
        } finally {
          if (onResumeHandlerRef.current === onResume) {
            onResumeHandlerRef.current = null;
          }
        }
      };

      if (onResumeHandlerRef.current) {
        process.off('SIGCONT', onResumeHandlerRef.current);
      }
      onResumeHandlerRef.current = onResume;
      process.once('SIGCONT', onResume);

      process.kill(0, 'SIGTSTP');
    } else if (ctrlZPressCount > 0) {
      const undoKey = formatCommand(Command.UNDO);
      handleWarning(
        `Press ${suspendKey} again to suspend. Undo has moved to ${undoKey}.`,
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
    isAlternateBufferRef,
    config,
  ]);
  const handleSuspend = useCallback(() => {
    setCtrlZPressCount((prev) => prev + 1);
  }, []);

  return { handleSuspend };
}
