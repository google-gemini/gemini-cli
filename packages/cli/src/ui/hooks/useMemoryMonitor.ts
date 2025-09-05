/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from 'react';
import process from 'node:process';
import { type HistoryItemWithoutId, MessageType } from '../types.js';

const MEMORY_WARNING_THRESHOLD = 7 * 1024 * 1024 * 1024; // 7GB in bytes

interface MemoryMonitorOptions {
  addItem: (item: HistoryItemWithoutId, timestamp: number) => void;
}

export const useMemoryMonitor = ({ addItem }: MemoryMonitorOptions) => {
  const addItemRef = useRef(addItem);
  addItemRef.current = addItem;

  useEffect(() => {
    const intervalId = setInterval(() => {
      const usage = process.memoryUsage().rss;
      if (usage > MEMORY_WARNING_THRESHOLD) {
        addItemRef.current(
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
    }, 5000); // Check every 5 seconds

    return () => clearInterval(intervalId);
  }, []);
};
