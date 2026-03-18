/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useContext } from 'react';
import {
  sessionId as globalSessionId,
  Logger,
  type Storage,
} from '@google/gemini-cli-core';
import { ConfigContext } from '../contexts/ConfigContext.js';

/**
 * Hook to manage the logger instance.
 */
export const useLogger = (storage: Storage): Logger | null => {
  const [logger, setLogger] = useState<Logger | null>(null);
  const config = useContext(ConfigContext);

  useEffect(() => {
    const activeSessionId = config?.getSessionId() ?? globalSessionId;
    const newLogger = new Logger(activeSessionId, storage);

    /**
     * Start async initialization, no need to await. Using await slows down the
     * time from launch to see the gemini-cli prompt and it's better to not save
     * messages than for the cli to hanging waiting for the logger to loading.
     */
    newLogger
      .initialize()
      .then(() => {
        setLogger(newLogger);
      })
      .catch(() => {});
  }, [storage, config]);

  return logger;
};
