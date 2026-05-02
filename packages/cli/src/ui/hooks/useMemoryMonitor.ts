/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from 'react';
import process from 'node:process';
import { type HistoryItemWithoutId, MessageType } from '../types.js';

export const MEMORY_WARNING_THRESHOLD = 7 * 1024 * 1024 * 1024; // 7GB in bytes
export const MEMORY_CHECK_INTERVAL = 60 * 1000; // one minute

interface MemoryMonitorOptions {
  addItem: (item: HistoryItemWithoutId, timestamp: number) => void;
  pruneHistory?: (count: number) => void;
  historyLength?: number;
}

export const useMemoryMonitor = ({
  addItem,
  pruneHistory,
  historyLength = 0,
}: MemoryMonitorOptions) => {
  const historyLengthRef = useRef(historyLength);
  const warnedRef = useRef(false);

  // Keep the ref up to date with the latest historyLength
  useEffect(() => {
    historyLengthRef.current = historyLength;
  }, [historyLength]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      const usage = process.memoryUsage().rss;
      if (usage > MEMORY_WARNING_THRESHOLD) {
        if (!warnedRef.current) {
          addItem(
            {
              type: MessageType.WARNING,
              text:
                `High memory usage detected: ${(
                  usage /
                  (1024 * 1024 * 1024)
                ).toFixed(2)} GB. ` +
                'To save memory, the oldest part of your chat history will be pruned from the UI. ' +
                'Old messages are still preserved in your terminal scrollback.',
            },
            Date.now(),
          );

          if (pruneHistory && historyLengthRef.current > 50) {
            // Prune the oldest 20% of history only once per warning cycle
            pruneHistory(Math.floor(historyLengthRef.current * 0.2));
          }
          warnedRef.current = true;
        }
      } else {
        // Reset the warning flag if memory usage drops back below the threshold
        warnedRef.current = false;
      }
    }, MEMORY_CHECK_INTERVAL);

    return () => clearInterval(intervalId);
  }, [addItem, pruneHistory]);
};
