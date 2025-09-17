/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';
import process from 'node:process';
import { type HistoryItemWithoutId, MessageType } from '../types.js';

export const MEMORY_WARNING_THRESHOLD = 7 * 1024 * 1024 * 1024; // 7GB in bytes
export const MEMORY_CHECK_INTERVAL = 60 * 1000; // one minute

interface MemoryMonitorOptions {
  addItem: (item: HistoryItemWithoutId, timestamp: number) => void;
}

export const useMemoryMonitor = ({ addItem }: MemoryMonitorOptions) => {
  useEffect(() => {
    const intervalId = setInterval(() => {
      const usage = process.memoryUsage().rss;
      if (usage > MEMORY_WARNING_THRESHOLD) {
        addItem(
          {
            type: MessageType.WARNING,
            text:
              `High memory usage detected: ${(
                usage /
                (1024 * 1024 * 1024)
              ).toFixed(2)} GB. ` +
              'If you experience a crash, please file a bug report by running `/bug`',
          },
          Date.now(),
        );
        clearInterval(intervalId);
      }
    }, MEMORY_CHECK_INTERVAL);

    return () => clearInterval(intervalId);
  }, [addItem]);
};
