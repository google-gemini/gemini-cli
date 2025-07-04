/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from '@google/gemini-cli-core';
import { useEffect } from 'react';
import util from 'util';
import { ConsoleMessageItem } from '../types.js';

interface UseConsolePatcherParams {
  onNewMessage: (message: Omit<ConsoleMessageItem, 'id'>) => void;
  debugMode: boolean;
}

export const useConsolePatcher = ({
  onNewMessage,
  debugMode,
}: UseConsolePatcherParams): void => {
  useEffect(() => {
    const originalConsoleLog = new Logger().info;
    const originalConsoleWarn = new Logger().warn;
    const originalConsoleError = new Logger().error;
    const originalConsoleDebug = new Logger().debug;

    const formatArgs = (args: unknown[]): string => util.format(...args);

    const patchConsoleMethod =
      (
        type: 'log' | 'warn' | 'error' | 'debug',
        originalMethod: (...args: unknown[]) => void,
      ) =>
      (...args: unknown[]) => {
        if (debugMode) {
          originalMethod.apply(console, args);
        }

        // Then, if it's not a debug message or debugMode is on, pass to onNewMessage
        if (type !== 'debug' || debugMode) {
          onNewMessage({
            type,
            content: formatArgs(args),
            count: 1,
          });
        }
      };

    new Logger().info = patchConsoleMethod('log', originalConsoleLog);
    new Logger().warn = patchConsoleMethod('warn', originalConsoleWarn);
    new Logger().error = patchConsoleMethod('error', originalConsoleError);
    new Logger().debug = patchConsoleMethod('debug', originalConsoleDebug);

    return () => {
      new Logger().info = originalConsoleLog;
      new Logger().warn = originalConsoleWarn;
      new Logger().error = originalConsoleError;
      new Logger().debug = originalConsoleDebug;
    };
  }, [onNewMessage, debugMode]);
};
