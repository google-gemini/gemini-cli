/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { Logger, type Config } from '@google/gemini-cli-core';

/**
 * Hook to manage the logger instance.
 */
export const useLogger = (config: Config): Logger | null => {
  const [logger, setLogger] = useState<Logger | null>(null);
  // Depend on the session id value, not just the (stable) config object, so the
  // logger follows the active session. `/clear` mints a new session id on the
  // same config instance; without this the logger keeps writing under the old
  // id and logs disagree with the current chat session.
  const sessionId = config.getSessionId();

  useEffect(() => {
    const newLogger = new Logger(sessionId, config.storage);

    /**
     * Start async initialization, no need to await. Using await slows down the
     * time from launch to see the gemini-cli prompt and it's better to not save
     * messages than for the cli to hanging waiting for the logger to loading.
     */
    newLogger
      .initialize()
      .then(() => setLogger(newLogger))
      .catch(() => {});
  }, [config, sessionId]);

  return logger;
};
