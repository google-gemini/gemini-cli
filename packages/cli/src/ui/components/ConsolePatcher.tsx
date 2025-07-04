/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { logger } from '@google/gemini-cli-core';
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
    const originalConsoleLog = logger.info;
    const originalConsoleWarn = logger.warn;
    const originalConsoleError = logger.error;
    const originalConsoleDebug = logger.debug;

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

    logger.info = patchConsoleMethod('log', originalConsoleLog);
    logger.warn = patchConsoleMethod('warn', originalConsoleWarn);
    logger.error = patchConsoleMethod('error', originalConsoleError);
    logger.debug = patchConsoleMethod('debug', originalConsoleDebug);

    return () => {
      logger.info = originalConsoleLog;
      logger.warn = originalConsoleWarn;
      logger.error = originalConsoleError;
      logger.debug = originalConsoleDebug;
    };
  }, [onNewMessage, debugMode]);
};
