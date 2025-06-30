/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { sessionId, logger as LoggerInstance } from '@google/gemini-cli-core';

/**
 * Hook to manage the logger instance.
 */
export const useLogger = () => {
  const [logger, setLogger] = useState<typeof LoggerInstance | null>(null);

  useEffect(() => {
    // The logger instance is already created and exported from the core package.
    // We just need to initialize it with the session ID.
    LoggerInstance.sessionId = sessionId;
    LoggerInstance.initialize().then(() => {
      setLogger(LoggerInstance);
    }).catch(() => {});
  }, []);

  return logger;
};
