/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import {
  Logger,
  uiTelemetryService,
  type Config,
} from '@google/gemini-cli-core';

/**
 * Hook to manage the logger instance.
 */
export const useLogger = (config: Config): Logger | null => {
  const [logger, setLogger] = useState<Logger | null>(null);

  useEffect(() => {
    let disposed = false;
    let loggerToken = 0;

    const initializeLogger = (sessionId = config.getSessionId()) => {
      const currentToken = ++loggerToken;
      const newLogger = new Logger(sessionId, config.storage);

      /**
       * Start async initialization, no need to await. Using await slows down the
       * time from launch to see the gemini-cli prompt and it's better to not save
       * messages than for the cli to hanging waiting for the logger to loading.
       */
      newLogger
        .initialize()
        .then(() => {
          if (!disposed && currentToken === loggerToken) {
            setLogger(newLogger);
          }
        })
        .catch(() => {});
    };

    const handleClear = (newSessionId?: string) => {
      initializeLogger(newSessionId);
    };

    initializeLogger();
    uiTelemetryService.on('clear', handleClear);

    return () => {
      disposed = true;
      uiTelemetryService.off('clear', handleClear);
    };
  }, [config]);

  return logger;
};
